// ──────────────────────────────────────────────
// Routes: Lorebooks
// ──────────────────────────────────────────────
import type { FastifyInstance } from "fastify";
import {
  createLorebookSchema,
  updateLorebookSchema,
  createLorebookEntrySchema,
  updateLorebookEntrySchema,
} from "@marinara-engine/shared";
import type { ExportEnvelope } from "@marinara-engine/shared";
import { createLorebooksStorage } from "../services/storage/lorebooks.storage.js";
import { createChatsStorage } from "../services/storage/chats.storage.js";
import { createConnectionsStorage } from "../services/storage/connections.storage.js";
import { processLorebooks } from "../services/lorebook/index.js";
import { createLLMProvider } from "../services/llm/provider-registry.js";
import type { APIProvider } from "@marinara-engine/shared";
import { normalizeTimestampOverrides } from "../services/import/import-timestamps.js";
import AdmZip from "adm-zip";

function toSafeExportName(name: string, fallback: string) {
  const sanitized = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized || fallback;
}

export async function lorebooksRoutes(app: FastifyInstance) {
  const storage = createLorebooksStorage(app.db);

  // ── Lorebooks CRUD ──

  app.get("/", async (req) => {
    const query = req.query as Record<string, string>;
    if (query.category) return storage.listByCategory(query.category);
    if (query.characterId) return storage.listByCharacter(query.characterId);
    if (query.chatId) return storage.listByChat(query.chatId);
    return storage.list();
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const lb = await storage.getById(req.params.id);
    if (!lb) return reply.status(404).send({ error: "Lorebook not found" });
    return lb;
  });

  app.post("/", async (req) => {
    const input = createLorebookSchema.parse(req.body);
    const body = req.body as Record<string, unknown>;
    return storage.create(
      input,
      normalizeTimestampOverrides({
        createdAt: body.createdAt,
        updatedAt: body.updatedAt,
      }),
    );
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const input = updateLorebookSchema.parse(req.body);
    const updated = await storage.update(req.params.id, input);
    if (!updated) return reply.status(404).send({ error: "Lorebook not found" });
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    await storage.remove(req.params.id);
    return reply.status(204).send();
  });

  // ── Export ──

  app.get<{ Params: { id: string } }>("/:id/export", async (req, reply) => {
    const lb = (await storage.getById(req.params.id)) as Record<string, unknown> | null;
    if (!lb) return reply.status(404).send({ error: "Lorebook not found" });
    const entries = await storage.listEntries(req.params.id);
    const envelope: ExportEnvelope = {
      type: "marinara_lorebook",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: { lorebook: lb, entries },
    };
    return reply
      .header(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(String(lb.name || "lorebook"))}.marinara.json"`,
      )
      .send(envelope);
  });

  app.post("/export-bulk", async (req, reply) => {
    const { ids } = req.body as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ error: "ids array is required" });
    }

    const zip = new AdmZip();
    let exportedCount = 0;
    for (const id of ids) {
      const lb = (await storage.getById(id)) as Record<string, unknown> | null;
      if (!lb) continue;
      const entries = await storage.listEntries(id);
      const envelope: ExportEnvelope = {
        type: "marinara_lorebook",
        version: 1,
        exportedAt: new Date().toISOString(),
        data: { lorebook: lb, entries },
      };
      zip.addFile(
        `${toSafeExportName(String(lb.name || "lorebook"), `lorebook-${exportedCount + 1}`)}.marinara.json`,
        Buffer.from(JSON.stringify(envelope, null, 2), "utf-8"),
      );
      exportedCount++;
    }

    if (exportedCount === 0) {
      return reply.status(404).send({ error: "No lorebooks found for the provided ids" });
    }

    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", 'attachment; filename="marinara-lorebooks.zip"')
      .send(zip.toBuffer());
  });

  // ── Entries CRUD ──

  app.get<{ Params: { id: string } }>("/:id/entries", async (req) => {
    return storage.listEntries(req.params.id);
  });

  app.get<{ Params: { id: string; entryId: string } }>("/:id/entries/:entryId", async (req, reply) => {
    const entry = await storage.getEntry(req.params.entryId);
    if (!entry) return reply.status(404).send({ error: "Entry not found" });
    return entry;
  });

  app.post<{ Params: { id: string } }>("/:id/entries", async (req) => {
    const input = createLorebookEntrySchema.parse({
      ...(req.body as Record<string, unknown>),
      lorebookId: req.params.id,
    });
    return storage.createEntry(input);
  });

  app.patch<{ Params: { id: string; entryId: string } }>("/:id/entries/:entryId", async (req, reply) => {
    const input = updateLorebookEntrySchema.parse(req.body);
    const updated = await storage.updateEntry(req.params.entryId, input);
    if (!updated) return reply.status(404).send({ error: "Entry not found" });
    return updated;
  });

  app.delete<{ Params: { lorebookId: string; entryId: string } }>(
    "/:lorebookId/entries/:entryId",
    async (req, reply) => {
      await storage.removeEntry(req.params.entryId);
      return reply.status(204).send();
    },
  );

  // ── Bulk operations ──

  app.post<{ Params: { id: string } }>("/:id/entries/bulk", async (req) => {
    const body = req.body as { entries: unknown[] };
    const entries = (body.entries ?? []).map((e: unknown) => {
      const { lorebookId, ...rest } = createLorebookEntrySchema.parse({
        ...(e as Record<string, unknown>),
        lorebookId: req.params.id,
      });
      return rest;
    });
    return storage.bulkCreateEntries(req.params.id, entries);
  });

  // ── Search ──

  app.get("/search/entries", async (req) => {
    const query = (req.query as Record<string, string>).q ?? "";
    if (!query) return [];
    return storage.searchEntries(query);
  });

  // ── Active entries (for prompt injection) ──

  app.get("/active/entries", async () => {
    return storage.listActiveEntries();
  });

  // ── Scan chat for activated entries ──

  app.get<{ Params: { chatId: string }; Querystring: { prepend?: string } }>("/scan/:chatId", async (req, reply) => {
    const { chatId } = req.params;
    const prepend = typeof req.query.prepend === "string" ? req.query.prepend : "";
    const chatsStorage = createChatsStorage(app.db);
    const chatMessages = await chatsStorage.listMessages(chatId);
    if (!chatMessages.length) return reply.send({ entries: [], totalTokens: 0, totalEntries: 0 });

    // Load chat to get characterIds and activeLorebookIds from metadata
    const chat = await chatsStorage.getById(chatId);
    let characterIds: string[] = [];
    let activeLorebookIds: string[] = [];
    if (chat) {
      try {
        characterIds =
          typeof chat.characterIds === "string"
            ? JSON.parse(chat.characterIds)
            : ((chat.characterIds as string[]) ?? []);
      } catch {
        /* ignore */
      }
      try {
        const meta =
          typeof chat.metadata === "string"
            ? JSON.parse(chat.metadata)
            : ((chat.metadata as Record<string, unknown>) ?? {});
        activeLorebookIds = Array.isArray(meta.activeLorebookIds) ? meta.activeLorebookIds : [];
      } catch {
        /* ignore */
      }
    }

    const scanMessages = chatMessages.map((m) => ({
      role: (m.role === "narrator" ? "system" : m.role) as string,
      content: typeof m.content === "string" ? m.content : "",
    }));

    // Optional preview mode: callers can scan as if a hypothetical user
    // message were appended to the chat history. Used by the World Info
    // panel's regenerate button so users can see which entries would
    // activate against their currently-typed-but-unsubmitted input.
    if (prepend.trim()) {
      scanMessages.push({ role: "user", content: prepend });
    }

    // Read per-chat entry state overrides so we can:
    //   - annotate each entry with its userEnabled / userPinned flags for UI
    //   - force-activate pinned entries via processLorebooks (chars/4 budget,
    //     scanner promotes them to constant)
    //   - keep disabled entries in the result (includeDisabled) so the panel
    //     can render them with the eye-off treatment
    let entryStateOverrides:
      | Record<string, { ephemeral?: number | null; enabled?: boolean; pinned?: boolean }>
      | undefined;
    if (chat) {
      try {
        const meta =
          typeof chat.metadata === "string"
            ? JSON.parse(chat.metadata)
            : ((chat.metadata as Record<string, unknown>) ?? {});
        if (meta.entryStateOverrides && typeof meta.entryStateOverrides === "object") {
          entryStateOverrides = meta.entryStateOverrides as typeof entryStateOverrides;
        }
      } catch {
        /* ignore */
      }
    }

    const result = await processLorebooks(app.db, scanMessages, null, {
      chatId,
      characterIds,
      activeLorebookIds,
      entryStateOverrides,
      includeDisabled: true,
    });

    // Build the response set: scanner-activated UNION user-overridden.
    //
    // Scanner-activated covers CONST entries, keyword/semantic matches,
    // and pinned entries (which were promoted to constant in processLorebooks).
    //
    // User-overridden adds entries the user has interacted with — pinned
    // (already in scanner set, but listed for completeness) and disabled.
    // Disabled-without-current-match needs explicit inclusion: the scanner
    // doesn't return them since they don't currently match keywords, but the
    // panel needs them on the list so the user can re-enable.
    //
    // Pure scanner-match-no-longer-relevant entries (no override, scanner
    // doesn't currently match) drop from the list — they have no anchor.
    const activatedSet = new Set(result.activatedEntryIds);
    const overriddenIds = entryStateOverrides
      ? Object.entries(entryStateOverrides)
          .filter(([, ov]) => ov.enabled === false || ov.pinned === true)
          .map(([id]) => id)
      : [];
    const allIds = Array.from(new Set([...result.activatedEntryIds, ...overriddenIds]));
    const allEntries =
      allIds.length > 0
        ? await Promise.all(allIds.map((id) => storage.getEntry(id))).then((entries) => entries.filter(Boolean))
        : [];

    // Independent keyword-match check. The scanner short-circuits on
    // `entry.constant`, so for CONST and pinned-promoted-to-constant entries
    // we never learn whether the keywords would have matched. For the
    // multi-pill UI ("show every reason this entry is here"), we need that
    // info regardless of the constant short-circuit. Run a simple
    // case-insensitive substring check over the same scan text.
    //
    // Trade-offs: we don't honour each entry's regex/whole-words/case-
    // sensitive options or secondary-keys/selective-logic. Real generation
    // uses the proper scanner — this check is purely for UI hints. Semantic-
    // only matches (no keyword in text, vector similarity above threshold)
    // also won't trigger this; the dot's emerald state still indicates
    // injection in those cases.
    const scanTextForKeywordCheck = scanMessages
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n")
      .toLowerCase();
    const keywordMatchSet = new Set<string>();
    for (const e of allEntries) {
      const id = (e as Record<string, unknown>).id as string;
      const rawKeys = (e as Record<string, unknown>).keys;
      let keys: string[] = [];
      try {
        keys = typeof rawKeys === "string" ? JSON.parse(rawKeys) : ((rawKeys as string[]) ?? []);
      } catch {
        /* ignore */
      }
      if (keys.length === 0) continue;
      for (const key of keys) {
        const k = String(key).trim().toLowerCase();
        if (k && scanTextForKeywordCheck.includes(k)) {
          keywordMatchSet.add(id);
          break;
        }
      }
    }

    return {
      entries: allEntries.map((e) => {
        const id = (e as Record<string, unknown>).id as string;
        const content = ((e as Record<string, unknown>).content as string) ?? "";
        const override = entryStateOverrides?.[id];
        const userEnabled = override?.enabled !== false;
        const userPinned = override?.pinned === true;
        // Whether the scanner promoted this entry into its activated set —
        // independent of the user's disable flag. True for CONST, pinned
        // (via constant promotion in processLorebooks), and keyword/semantic
        // matches. Drives the dot colour together with userEnabled.
        const scannerActivated = activatedSet.has(id);
        // Whether any of this entry's keys appear as substrings in the chat
        // text (or current draft). True INDEPENDENTLY of CONST/pinned status,
        // so the M pill can light up alongside C or P. See keywordMatchSet
        // construction above for trade-offs.
        const keywordMatched = keywordMatchSet.has(id);
        // "Will inject in next generation": scanner activated it AND user
        // hasn't disabled it. During real generation, processLorebooks's
        // own filter applies the same logic; this field mirrors it for UI.
        const isInjecting = userEnabled && scannerActivated;
        return {
          id,
          name: (e as Record<string, unknown>).name,
          content,
          keys: (e as Record<string, unknown>).keys,
          lorebookId: (e as Record<string, unknown>).lorebookId,
          order: (e as Record<string, unknown>).order,
          constant: (e as Record<string, unknown>).constant,
          userEnabled,
          userPinned,
          scannerActivated,
          keywordMatched,
          isInjecting,
          // Per-entry token estimate (chars/4) — lets the client show
          // tokens-actually-injecting rather than tokens-of-everything.
          tokens: Math.ceil(content.length / 4),
        };
      }),
      totalTokens: result.totalTokensEstimate,
      totalEntries: result.totalEntries,
    };
  });

  // ── Vectorize: generate embeddings for all entries in a lorebook ──

  app.post<{ Params: { id: string } }>("/:id/vectorize", async (req, reply) => {
    const body = req.body as { connectionId: string; model: string };
    if (!body.connectionId || !body.model) {
      return reply.status(400).send({ error: "connectionId and model are required" });
    }

    const connStorage = createConnectionsStorage(app.db);
    const conn = await connStorage.getWithKey(body.connectionId);
    if (!conn) return reply.status(404).send({ error: "Connection not found" });

    const entries = await storage.listEntries(req.params.id);
    if (!entries.length) return { vectorized: 0 };

    // Use dedicated embedding base URL if configured, otherwise the connection's base URL
    const embedBaseUrl = conn.embeddingBaseUrl
      ? (conn.embeddingBaseUrl as string).replace(/\/+$/, "")
      : (conn.baseUrl as string);
    const provider = createLLMProvider(
      conn.provider as string,
      embedBaseUrl,
      conn.apiKey as string,
      conn.maxContext,
      conn.openrouterProvider,
      conn.maxTokensOverride,
    );

    // Build text for each entry: combine name, keys, and content
    const texts = (entries as Array<Record<string, unknown>>).map((e) => {
      const keys = Array.isArray(e.keys) ? (e.keys as string[]).join(", ") : "";
      return `${e.name ?? ""}${keys ? ` [${keys}]` : ""}\n${e.content ?? ""}`.trim();
    });

    // Batch embed (most APIs support multiple texts per call)
    const BATCH_SIZE = 50;
    let vectorized = 0;
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batchTexts = texts.slice(i, i + BATCH_SIZE);
      const batchEntries = entries.slice(i, i + BATCH_SIZE);
      const embeddings = await provider.embed(batchTexts, body.model);
      for (let j = 0; j < batchEntries.length; j++) {
        const entry = batchEntries[j] as Record<string, unknown>;
        if (embeddings[j]) {
          await storage.updateEntryEmbedding(entry.id as string, embeddings[j]!);
          vectorized++;
        }
      }
    }

    return { vectorized, total: entries.length };
  });
}
