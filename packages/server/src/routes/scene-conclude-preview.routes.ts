// ──────────────────────────────────────────────
// Routes: Scene Conclude — Preview / Commit
// ──────────────────────────────────────────────
// Two-step alternative to upstream's atomic POST /api/scene/conclude.
//
//   POST /api/scene/conclude/preview  — assemble prompts, optionally run the
//     LLM, return a candidate summary. No side effects; scene stays "active".
//   POST /api/scene/conclude/commit   — take a finalised summary text, do
//     the side-effects (inject narrator into origin, store character memory,
//     mark scene concluded, disconnect chats). No LLM call.
//
// Lives in its own file to keep upstream's scene.routes.ts untouched —
// upstream owns POST /api/scene/conclude (and the rest of /api/scene/*),
// we own POST /api/scene/conclude/preview and POST /api/scene/conclude/commit.
// Helpers (resolveConnection, buildCharacterContext, etc.) are duplicated
// from upstream rather than imported, so changes upstream make to its own
// scene.routes.ts can't break this file.
// ──────────────────────────────────────────────
import type { FastifyInstance } from "fastify";
import { logger } from "../lib/logger.js";
import { createAgentsStorage } from "../services/storage/agents.storage.js";
import { createChatsStorage } from "../services/storage/chats.storage.js";
import { createConnectionsStorage } from "../services/storage/connections.storage.js";
import { createCharactersStorage } from "../services/storage/characters.storage.js";
import { createLLMProvider } from "../services/llm/provider-registry.js";
import { getLocalSidecarProvider, LOCAL_SIDECAR_MODEL } from "../services/llm/local-sidecar.js";
import type { ChatMessage } from "../services/llm/base-provider.js";
import {
  LOCAL_SIDECAR_CONNECTION_ID,
  type SceneConcludePreviewRequest,
  type SceneConcludePreviewResponse,
  type SceneConcludeCommitRequest,
  type SceneConcludeCommitResponse,
} from "@marinara-engine/shared";

// ──────────────────────────────────────────────
// Defaults
// ──────────────────────────────────────────────

const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TEMPERATURE = 0.8;

// User-prompt instruction block. The actual scene transcript is prepended
// at assembly time. Length and detail are driven by these instructions —
// maxTokens is a safety net, not a target.
const DEFAULT_USER_INSTRUCTIONS = [
  `Write a vivid but concise narrative summary of what happened during this scene.`,
  `Write up to five paragraphs, capturing all important details.`,
  `Write in past tense, third person. Include the emotional beats and key moments.`,
  `This summary will become a permanent memory for the character(s) involved.`,
  `Do NOT use asterisks, em-dashes, or markdown formatting. Write natural prose.`,
  `Start directly with the narrative — no preamble like "Here's a summary".`,
].join("\n");

// ──────────────────────────────────────────────
// Helpers (duplicated from upstream's scene.routes.ts for fork isolation)
// ──────────────────────────────────────────────

async function resolveConnection(
  connections: ReturnType<typeof createConnectionsStorage>,
  connId: string | null | undefined,
  chatConnectionId: string | null,
) {
  let id = connId ?? chatConnectionId;
  if (id === "random") {
    const pool = await connections.listRandomPool();
    if (!pool.length) throw new Error("No connections marked for the random pool");
    id = pool[Math.floor(Math.random() * pool.length)].id;
  }
  if (!id) throw new Error("No API connection configured");
  const conn = await connections.getWithKey(id);
  if (!conn) throw new Error("API connection not found");

  let baseUrl = conn.baseUrl;
  if (!baseUrl) {
    const { PROVIDERS } = await import("@marinara-engine/shared");
    const providerDef = PROVIDERS[conn.provider as keyof typeof PROVIDERS];
    baseUrl = providerDef?.defaultBaseUrl ?? "";
  }
  if (!baseUrl) throw new Error("No base URL configured for this connection");

  return { conn, baseUrl };
}

/**
 * Resolve a connection through the utility-task chain (per-call → chat-summary
 * agent → default-for-agents → chat conn), with sidecar-sentinel handling.
 * Mirrors the same chain in chats.routes.ts /generate-summary so a "Local
 * Model (sidecar)" agent setting routes through getLocalSidecarProvider()
 * instead of failing the connections lookup.
 */
async function resolveUtilityConnection(
  connections: ReturnType<typeof createConnectionsStorage>,
  agentsStore: ReturnType<typeof createAgentsStorage>,
  connId: string | null | undefined,
  chatConnectionId: string | null,
) {
  if (!connId) {
    // Skip a disabled chat-summary agent's stale connectionId — its setting
    // is forgotten config and shouldn't override the user's default-for-agents.
    const summaryAgentCfg = await agentsStore.getByType("chat-summary");
    const summaryAgentEnabled = summaryAgentCfg?.enabled !== "false";
    if (summaryAgentEnabled && summaryAgentCfg?.connectionId) {
      connId = summaryAgentCfg.connectionId;
    } else {
      const defaultAgentConn = await connections.getDefaultForAgents();
      if (defaultAgentConn?.id) connId = defaultAgentConn.id;
    }
  }
  const finalId = connId ?? chatConnectionId;
  if (finalId === LOCAL_SIDECAR_CONNECTION_ID) {
    return { kind: "sidecar" as const };
  }
  const { conn, baseUrl } = await resolveConnection(connections, connId, chatConnectionId);
  return { kind: "connection" as const, conn, baseUrl };
}

async function buildCharacterContext(chars: ReturnType<typeof createCharactersStorage>, characterIds: string[]) {
  let ctx = "";
  for (const cid of characterIds) {
    const row = await chars.getById(cid);
    if (!row) continue;
    const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
    ctx += `<character="${data.name}" id="${cid}">\n`;
    if (data.description) ctx += `${data.description}\n`;
    if (data.personality) ctx += `${data.personality}\n`;
    if (data.extensions?.appearance) ctx += `Appearance: ${data.extensions.appearance}\n`;
    if (data.extensions?.backstory) ctx += `Backstory: ${data.extensions.backstory}\n`;
    ctx += `</character>\n\n`;
  }
  return ctx;
}

async function buildPersonaContext(chars: ReturnType<typeof createCharactersStorage>) {
  const allPersonas = await chars.listPersonas();
  const active = allPersonas.find((p) => p.isActive === "true");
  if (!active) return { personaName: "User", personaCtx: "No persona information available." };
  let ctx = `Name: ${active.name}\n`;
  if (active.description) ctx += `${active.description}\n`;
  if (active.personality) ctx += `${active.personality}\n`;
  if (active.backstory) ctx += `${active.backstory}\n`;
  if (active.appearance) ctx += `${active.appearance}\n`;
  return { personaName: active.name, personaCtx: ctx };
}

async function getRecentMessages(
  chats: ReturnType<typeof createChatsStorage>,
  chatId: string,
  limit: number = 30,
): Promise<ChatMessage[]> {
  const allMsgs = await chats.listMessages(chatId);
  return allMsgs
    .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-limit)
    .map((m: any) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));
}

async function getCharacterName(chars: ReturnType<typeof createCharactersStorage>, charId: string): Promise<string> {
  if (!charId) return "the character";
  const row = await chars.getById(charId);
  if (!row) return "the character";
  const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
  return data?.name ?? "the character";
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Assemble the default system prompt. Inlines character + persona context
 * plus the scene's description / scenario / date. Returned as a string so
 * the dialog can show it for editing.
 */
function assembleSystemPrompt(args: {
  personaName: string;
  characterCtx: string;
  personaCtx: string;
  sceneDescription: string;
  sceneScenario: string;
  dateStr: string;
}): string {
  return [
    `You are summarizing a roleplay scene that just concluded between ${args.personaName} and the character(s).`,
    ``,
    `<characters>`,
    args.characterCtx,
    `</characters>`,
    ``,
    `<persona>`,
    args.personaCtx,
    `</persona>`,
    ``,
    `Scene description: ${args.sceneDescription}`,
    args.sceneScenario ? `Scene scenario: ${args.sceneScenario}` : "",
    `Date: ${args.dateStr}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Assemble the default scene transcript block. Includes the framing line so
 * the LLM has context about what it's reading.
 */
function assembleSceneTranscript(sceneText: string): string {
  return [`Here is the full scene that was roleplayed:`, ``, sceneText].join("\n");
}

/**
 * Combine transcript + instructions into the final user-role prompt sent to
 * the LLM. Two newlines between so the model sees them as distinct sections.
 */
function joinUserPrompt(sceneTranscript: string, userInstructions: string): string {
  return [sceneTranscript, "", userInstructions].join("\n");
}

/** Rough character/4 token estimate. */
function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

// ──────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────

export async function sceneConcludePreviewRoutes(app: FastifyInstance) {
  const chats = createChatsStorage(app.db);
  const chars = createCharactersStorage(app.db);
  const connections = createConnectionsStorage(app.db);
  const agentsStore = createAgentsStorage(app.db);

  // ───────────────────────── PREVIEW ─────────────────────────
  app.post<{ Body: SceneConcludePreviewRequest }>("/preview", async (req, reply) => {
    const body = req.body;
    if (!body?.sceneChatId) return reply.status(400).send({ error: "sceneChatId is required" });

    const sceneChat = await chats.getById(body.sceneChatId);
    if (!sceneChat) return reply.status(404).send({ error: "Scene chat not found" });

    const sceneMeta =
      typeof sceneChat.metadata === "string" ? JSON.parse(sceneChat.metadata) : (sceneChat.metadata ?? {});

    if (sceneMeta.sceneStatus !== "active") {
      return reply.status(400).send({ error: "Scene is not active" });
    }

    // Resolve connection via the utility-task chain.
    const utility = await resolveUtilityConnection(
      connections,
      agentsStore,
      body.connectionId,
      sceneChat.connectionId,
    );

    // Build context for prompt assembly. Same shape as upstream's conclude.
    const characterIds: string[] =
      typeof sceneChat.characterIds === "string"
        ? JSON.parse(sceneChat.characterIds)
        : (sceneChat.characterIds as string[]);
    const characterCtx = await buildCharacterContext(chars, characterIds);
    const { personaName, personaCtx } = await buildPersonaContext(chars);

    const sceneMessages = await getRecentMessages(chats, body.sceneChatId, 100);
    const sceneText = sceneMessages
      .map((m) => `${m.role === "user" ? personaName : "Character"}: ${m.content}`)
      .join("\n\n");

    const dateStr = formatDate(new Date());

    // Use overrides if provided, else assemble defaults.
    const systemPrompt =
      body.systemPrompt ??
      assembleSystemPrompt({
        personaName,
        characterCtx,
        personaCtx,
        sceneDescription: sceneMeta.sceneDescription ?? "",
        sceneScenario: sceneMeta.sceneScenario ?? "",
        dateStr,
      });
    const sceneTranscript = body.sceneTranscript ?? assembleSceneTranscript(sceneText);
    const userInstructions = body.userInstructions ?? DEFAULT_USER_INSTRUCTIONS;
    const userPrompt = joinUserPrompt(sceneTranscript, userInstructions);

    const maxTokens = body.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = body.temperature ?? DEFAULT_TEMPERATURE;

    // Resolve provider, model, and the connectionId we'll echo back. The
    // sidecar branch uses its sentinel; the connection branch uses the
    // resolved row's id.
    let provider;
    let model: string;
    let resolvedConnectionId: string;
    if (utility.kind === "sidecar") {
      provider = getLocalSidecarProvider();
      model = body.model ?? LOCAL_SIDECAR_MODEL;
      resolvedConnectionId = LOCAL_SIDECAR_CONNECTION_ID;
    } else {
      const { conn, baseUrl } = utility;
      provider = createLLMProvider(
        conn.provider,
        baseUrl,
        conn.apiKey,
        conn.maxContext,
        conn.openrouterProvider,
        conn.maxTokensOverride,
      );
      model = body.model ?? conn.model;
      resolvedConnectionId = conn.id;
    }

    const inputTokenEstimate =
      estimateTokens(systemPrompt) + estimateTokens(sceneTranscript) + estimateTokens(userInstructions);

    // Compose-only path: skip the LLM call, just return the assembled prompts.
    if (body.compose) {
      return {
        summary: null,
        systemPrompt,
        sceneTranscript,
        userInstructions,
        connectionId: resolvedConnectionId,
        model,
        maxTokens,
        temperature,
        inputTokenEstimate,
      } satisfies SceneConcludePreviewResponse;
    }

    logger.info(
      "[scene/conclude/preview] generating: connection=%s model=%s maxTokens=%d",
      resolvedConnectionId,
      model,
      maxTokens,
    );

    const promptMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const result = await provider.chatComplete(promptMessages, { model, temperature, maxTokens });
    const summary = (result.content ?? "").trim();

    return {
      summary,
      systemPrompt,
      sceneTranscript,
      userInstructions,
      connectionId: resolvedConnectionId,
      model,
      maxTokens,
      temperature,
      inputTokenEstimate,
    } satisfies SceneConcludePreviewResponse;
  });

  // ───────────────────────── COMMIT ─────────────────────────
  app.post<{ Body: SceneConcludeCommitRequest }>("/commit", async (req, reply) => {
    const body = req.body;
    if (!body?.sceneChatId) return reply.status(400).send({ error: "sceneChatId is required" });
    if (!body?.summary || !body.summary.trim()) {
      return reply.status(400).send({ error: "summary is required" });
    }

    const sceneChat = await chats.getById(body.sceneChatId);
    if (!sceneChat) return reply.status(404).send({ error: "Scene chat not found" });

    const sceneMeta =
      typeof sceneChat.metadata === "string" ? JSON.parse(sceneChat.metadata) : (sceneChat.metadata ?? {});

    if (sceneMeta.sceneStatus !== "active") {
      return reply.status(400).send({ error: "Scene is not active" });
    }

    const originChatId = sceneMeta.sceneOriginChatId;
    if (!originChatId) return reply.status(400).send({ error: "Not a scene chat (no origin)" });

    const summary = body.summary.trim();
    const characterIds: string[] =
      typeof sceneChat.characterIds === "string"
        ? JSON.parse(sceneChat.characterIds)
        : (sceneChat.characterIds as string[]);
    const { personaName } = await buildPersonaContext(chars);
    const initiatorCharId = sceneMeta.sceneInitiatorCharId ?? characterIds[0] ?? null;
    const now = new Date();
    const dateStr = formatDate(now);

    // 1. Inject the summary as a narrator message in the ORIGIN conversation.
    const narratorMessage = await chats.createMessage({
      chatId: originChatId,
      role: "narrator",
      characterId: null,
      content: `*${personaName} and ${await getCharacterName(chars, initiatorCharId ?? "")} returned from their scene...*\n\n${summary}`,
    });

    // 2. Store as a permanent memory on each participating character.
    for (const charId of characterIds) {
      const charRow = await chars.getById(charId);
      if (!charRow) continue;
      const charData = typeof charRow.data === "string" ? JSON.parse(charRow.data) : charRow.data;
      const extensions = { ...(charData.extensions ?? {}) };
      const memories: Array<{ from: string; fromCharId: string; summary: string; createdAt: string }> =
        extensions.characterMemories ?? [];

      memories.push({
        from: personaName,
        fromCharId: "scene",
        summary: `[Scene on ${dateStr}] ${summary}`,
        createdAt: now.toISOString(),
      });

      extensions.characterMemories = memories;
      await chars.update(charId, { extensions } as any);
    }

    // 3. Mark scene as concluded.
    await chats.updateMetadata(body.sceneChatId, { ...sceneMeta, sceneStatus: "concluded" });

    // 4. Clean up origin chat metadata — remove scene-busy state.
    const originChat = await chats.getById(originChatId);
    if (originChat) {
      const originMeta =
        typeof originChat.metadata === "string" ? JSON.parse(originChat.metadata) : (originChat.metadata ?? {});
      delete originMeta.activeSceneChatId;
      delete originMeta.sceneBusyCharIds;
      await chats.updateMetadata(originChatId, originMeta);
    }

    // 5. Disconnect the chats — scene is over, link no longer meaningful.
    await chats.disconnectChat(body.sceneChatId);

    if (!narratorMessage) {
      return reply.status(500).send({ error: "Failed to create narrator message" });
    }

    return {
      narratorMessageId: narratorMessage.id,
      originChatId,
    } satisfies SceneConcludeCommitResponse;
  });
}
