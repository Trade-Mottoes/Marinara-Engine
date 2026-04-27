// ──────────────────────────────────────────────
// Types for the scene-conclude preview / commit flow.
//
// Two endpoints, both under POST /api/scene/conclude/* :
//   - /preview : assemble the prompts and (optionally) run the LLM, returning
//                a candidate summary plus the prompts/params actually used.
//                No side effects; the scene stays "active".
//   - /commit  : take a finalised summary text, inject it as a narrator message
//                in the origin conversation, store it on each character's
//                memories, and mark the scene "concluded". No LLM call.
//
// This pair replaces the atomic generate-and-commit shape of upstream's
// /api/scene/conclude with a two-step preview/accept flow that lets the user
// see (and edit) the prompt, pick the model, adjust maxTokens, regenerate,
// and only commit when satisfied.
// ──────────────────────────────────────────────

/** Request body for POST /api/scene/conclude/preview. */
export interface SceneConcludePreviewRequest {
  /** The scene (roleplay) chat to summarise. */
  sceneChatId: string;
  /**
   * Override the system prompt the server would have assembled. When
   * omitted the server uses its default template (with character / persona
   * context inlined).
   */
  systemPrompt?: string;
  /**
   * Override the scene transcript portion of the user-role prompt. When
   * omitted the server reconstructs the transcript from chat messages.
   * Split out from `userInstructions` so the dialog can show the two
   * concerns as separate textareas — instructions don't get swamped by
   * the transcript when the scene is large.
   */
  sceneTranscript?: string;
  /**
   * Override the instruction block that follows the transcript ("write
   * up to five paragraphs", "past tense", etc.). When omitted the server
   * uses its default block.
   */
  userInstructions?: string;
  /**
   * Override the connection used. Otherwise resolution falls through the
   * standard utility-task chain (chat-summary agent → default-for-agents
   * → scene chat's connection). May be the LOCAL_SIDECAR_CONNECTION_ID
   * sentinel.
   */
  connectionId?: string | null;
  /** Override the model name within the resolved connection. */
  model?: string;
  /**
   * Output token ceiling. Acts as a safety net, not a target — length is
   * driven by the prompt's instructions. Default is generous (8192) so
   * thinking-capable models have headroom.
   */
  maxTokens?: number;
  /** Sampling temperature. Default 0.8 (matches upstream's conclude). */
  temperature?: number;
  /**
   * When true, assemble and return the prompts but skip the LLM call.
   * Used to populate the dialog on first open without burning a generation.
   */
  compose?: boolean;
}

/** Response from POST /api/scene/conclude/preview. */
export interface SceneConcludePreviewResponse {
  /** The generated narrative summary, or null when compose=true. */
  summary: string | null;
  /** The system prompt that was used (assembled or echoed override). */
  systemPrompt: string;
  /** The scene transcript that was used (assembled or echoed override). */
  sceneTranscript: string;
  /** The instruction block that was used (assembled or echoed override). */
  userInstructions: string;
  /** Connection ID resolved by the chain (after agent fallback). */
  connectionId: string;
  /** Model name used for the call. */
  model: string;
  /** maxTokens used for the call. */
  maxTokens: number;
  /** Temperature used for the call. */
  temperature: number;
  /** Rough token estimate of the assembled input prompt. UI hint only. */
  inputTokenEstimate?: number;
}

/** Request body for POST /api/scene/conclude/commit. */
export interface SceneConcludeCommitRequest {
  /** The scene (roleplay) chat to mark concluded. Must be in "active" state. */
  sceneChatId: string;
  /**
   * The finalised summary text — typically generated via /preview but the
   * server doesn't enforce that. Whatever string is sent gets injected into
   * the origin conversation and stored on character memories.
   */
  summary: string;
}

/** Response from POST /api/scene/conclude/commit. */
export interface SceneConcludeCommitResponse {
  /** ID of the narrator message injected into the origin conversation. */
  narratorMessageId: string;
  /** The origin conversation chat ID, for navigation back. */
  originChatId: string;
}
