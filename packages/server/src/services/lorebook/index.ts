// ──────────────────────────────────────────────
// Lorebook Service: Orchestrator
// Ties together storage, scanning, and injection.
// ──────────────────────────────────────────────
import type { DB } from "../../db/connection.js";
import type { Lorebook, LorebookEntry } from "@marinara-engine/shared";
import { createLorebooksStorage } from "../storage/lorebooks.storage.js";
import {
  scanForActivatedEntries,
  recursiveScan,
  type ScanMessage,
  type ScanOptions,
  type GameStateForScanning,
  type ActivatedEntry,
} from "./keyword-scanner.js";
import { applyTokenBudget, processActivatedEntries } from "./prompt-injector.js";

export interface LorebookScanResult {
  worldInfoBefore: string;
  worldInfoAfter: string;
  depthEntries: Array<{ content: string; role: "system" | "user" | "assistant"; depth: number; order: number }>;
  totalEntries: number;
  totalTokensEstimate: number;
  activatedEntryIds: string[];
  /** Updated per-chat entry state overrides (ephemeral countdown). Caller should persist to chat metadata. */
  updatedEntryStateOverrides?: Record<string, { ephemeral?: number | null; enabled?: boolean }>;
}

type LorebookFilters = {
  chatId?: string;
  characterIds?: string[];
  activeLorebookIds?: string[];
};

type RelevantLorebook = Pick<
  Lorebook,
  "id" | "enabled" | "scanDepth" | "tokenBudget" | "recursiveScanning" | "maxRecursionDepth" | "characterId" | "chatId"
>;

export function filterRelevantLorebooks(lorebooks: RelevantLorebook[], filters?: LorebookFilters): RelevantLorebook[] {
  const enabledBooks = lorebooks.filter((book) => book.enabled);
  if (!filters) return enabledBooks;

  return enabledBooks.filter((book) => {
    if (filters.activeLorebookIds?.includes(book.id)) return true;
    if (book.characterId && filters.characterIds?.includes(book.characterId)) return true;
    if (book.chatId && book.chatId === filters.chatId) return true;
    return false;
  });
}

export function applyLorebookDefaults(
  entries: LorebookEntry[],
  lorebooksById: ReadonlyMap<string, Pick<Lorebook, "scanDepth">>,
): LorebookEntry[] {
  return entries.map((entry) => {
    if (entry.scanDepth !== null && entry.scanDepth !== undefined) return entry;
    const lorebook = lorebooksById.get(entry.lorebookId);
    if (!lorebook) return entry;
    return {
      ...entry,
      scanDepth: lorebook.scanDepth,
    };
  });
}

export function applyPerLorebookTokenBudgets(
  activatedEntries: ActivatedEntry[],
  lorebooksById: ReadonlyMap<string, Pick<Lorebook, "tokenBudget">>,
): ActivatedEntry[] {
  if (activatedEntries.length === 0) return [];

  const grouped = new Map<string, ActivatedEntry[]>();
  for (const entry of activatedEntries) {
    const list = grouped.get(entry.entry.lorebookId) ?? [];
    list.push(entry);
    grouped.set(entry.entry.lorebookId, list);
  }

  const budgeted: ActivatedEntry[] = [];
  for (const [lorebookId, group] of grouped) {
    const budget = lorebooksById.get(lorebookId)?.tokenBudget ?? 0;
    budgeted.push(...applyTokenBudget(group, budget));
  }

  return budgeted.sort((a, b) => a.injectionOrder - b.injectionOrder);
}

/**
 * Main lorebook processing for a generation request.
 * 1. Fetch all active entries from enabled lorebooks
 * 2. Scan chat messages for keyword matches
 * 3. Process into injectable blocks
 */
export async function processLorebooks(
  db: DB,
  messages: ScanMessage[],
  gameState?: GameStateForScanning | null,
  options?: {
    chatId?: string;
    characterIds?: string[];
    activeLorebookIds?: string[];
    tokenBudget?: number;
    enableRecursive?: boolean;
    /** Pre-computed embedding of the chat context for semantic matching. */
    chatEmbedding?: number[] | null;
    /** Cosine similarity threshold for semantic matching (0-1, default 0.3). */
    semanticThreshold?: number;
    /** Per-chat entry state overrides (from chat metadata). When provided, ephemeral
     *  countdown is tracked here instead of modifying the global entry row.
     *  `pinned: true` forces an entry to activate regardless of scanner result
     *  (a per-chat equivalent of the global `constant` flag). */
    entryStateOverrides?: Record<
      string,
      { ephemeral?: number | null; enabled?: boolean; pinned?: boolean }
    >;
    /** When true, entries marked `enabled: false` in the per-chat overrides
     *  are kept in the result so the UI can display them (greyed/strikethrough)
     *  rather than silently omit them. Generation should leave this false so
     *  disabled entries don't reach the prompt. */
    includeDisabled?: boolean;
  },
): Promise<LorebookScanResult> {
  const storage = createLorebooksStorage(db);

  // Build filters for scoped lorebook selection.
  // When the caller provides options (even with empty arrays), scope to matching
  // lorebooks only. This prevents the "load everything" fallback when the caller
  // explicitly has no context (e.g., the prompt reviewer).
  const filters = options
    ? {
        chatId: options.chatId,
        characterIds: options.characterIds,
        activeLorebookIds: options.activeLorebookIds,
      }
    : undefined;

  const allLorebooks = (await storage.list()) as unknown as Lorebook[];
  const relevantLorebooks = filterRelevantLorebooks(allLorebooks, filters);
  const relevantLorebooksById = new Map(relevantLorebooks.map((lorebook) => [lorebook.id, lorebook]));

  // Fetch active entries (filtered if context provided)
  let allEntries = applyLorebookDefaults(
    (await storage.listActiveEntries(filters)) as unknown as LorebookEntry[],
    relevantLorebooksById,
  );

  // Apply per-chat entry state overrides — an entry that was disabled by ephemeral
  // countdown in *this* chat should be excluded, and ephemeral values should
  // reflect the per-chat remaining count rather than the global default.
  const overrides = options?.entryStateOverrides;
  const includeDisabled = options?.includeDisabled === true;
  if (overrides) {
    allEntries = allEntries
      .filter((e) => {
        const ov = overrides[e.id];
        // If per-chat override explicitly disabled this entry, skip — unless
        // the caller asked for disabled entries to remain (UI scan does this
        // so the panel can render them).
        if (ov && ov.enabled === false && !includeDisabled) return false;
        return true;
      })
      .map((e) => {
        const ov = overrides[e.id];
        if (!ov) return e;
        let entry = e;
        if (ov.ephemeral !== undefined) {
          // Use per-chat ephemeral remaining instead of global value
          entry = { ...entry, ephemeral: ov.ephemeral };
        }
        if (ov.pinned === true) {
          // Pinned entries activate as if `constant: true`. The generation
          // path filters out disabled entries above (line 160), so this only
          // sets constant on entries that will actually inject. The scan path
          // (includeDisabled=true) lets disabled+pinned entries through so the
          // panel can show them as greyed rather than silently dropping them
          // from the list when the user toggles a pinned entry off.
          entry = { ...entry, constant: true };
        }
        return entry;
      });
  }

  if (allEntries.length === 0) {
    return {
      worldInfoBefore: "",
      worldInfoAfter: "",
      depthEntries: [],
      totalEntries: 0,
      totalTokensEstimate: 0,
      activatedEntryIds: [],
    };
  }

  const tokenBudget = options?.tokenBudget ?? 0;

  // Scan for activated entries
  const scanOpts: ScanOptions = {
    scanDepth: 0, // Scan all messages
    gameState: gameState ?? null,
    chatEmbedding: options?.chatEmbedding ?? null,
    semanticThreshold: options?.semanticThreshold,
  };

  // Determine recursion settings from relevant enabled lorebooks only.
  const anyRecursive =
    options?.enableRecursive || relevantLorebooks.some((b: { recursiveScanning: boolean }) => b.recursiveScanning);
  const maxRecursionDepth = relevantLorebooks.reduce(
    (max: number, b: { recursiveScanning: boolean; maxRecursionDepth?: number }) => {
      if (!b.recursiveScanning) return max;
      return Math.max(max, b.maxRecursionDepth ?? 3);
    },
    3,
  );

  let activated: ActivatedEntry[];
  if (anyRecursive) {
    activated = recursiveScan(messages, allEntries, scanOpts, maxRecursionDepth);
  } else {
    activated = scanForActivatedEntries(messages, allEntries, scanOpts);
  }

  const budgetedActivated = applyPerLorebookTokenBudgets(activated, relevantLorebooksById);

  // Decrement ephemeral counters for activated entries.
  // When per-chat overrides are provided, track the countdown in those overrides
  // so each chat has independent ephemeral state. Otherwise fall back to global
  // DB writes (legacy / test-scan behavior, but skip global writes for test scans
  // that don't pass a chatId).
  let updatedOverrides: Record<string, { ephemeral?: number | null; enabled?: boolean }> | undefined;

  if (overrides) {
    // Per-chat tracking: write to overrides, leave global entry untouched
    updatedOverrides = { ...overrides };
    for (const a of budgetedActivated) {
      if (a.entry.ephemeral !== null && a.entry.ephemeral > 0) {
        const remaining = a.entry.ephemeral - 1;
        updatedOverrides[a.entry.id] = {
          ...updatedOverrides[a.entry.id],
          ephemeral: remaining,
          ...(remaining <= 0 ? { enabled: false } : {}),
        };
      }
    }
  } else if (options?.chatId) {
    // Legacy path: first call for this chat (no overrides yet) — initialise per-chat overrides
    updatedOverrides = {};
    for (const a of budgetedActivated) {
      if (a.entry.ephemeral !== null && a.entry.ephemeral > 0) {
        const remaining = a.entry.ephemeral - 1;
        updatedOverrides[a.entry.id] = {
          ephemeral: remaining,
          ...(remaining <= 0 ? { enabled: false } : {}),
        };
      }
    }
  }
  // When neither overrides nor chatId is present (e.g. test scan), do nothing —
  // don't modify global state or return overrides.

  // Process into injectable content
  const result = processActivatedEntries(budgetedActivated, tokenBudget);

  return {
    ...result,
    activatedEntryIds: budgetedActivated.map((a) => a.entry.id),
    ...(updatedOverrides ? { updatedEntryStateOverrides: updatedOverrides } : {}),
  };
}
