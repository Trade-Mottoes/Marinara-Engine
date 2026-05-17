// ──────────────────────────────────────────────
// Active World Info panel — chat-side preview of which lorebook entries
// are about to reach the next prompt, with per-chat overrides (eye toggle
// for disable, pin for sticky-active). Composes with upstream's
// budget-skip notice (rendered in ChatRoleplayPanels.tsx for the legacy
// panel — this file replaces that consumer, but the budget data is
// still surfaced in a notice below the list).
//
// Lives in its own file (rather than alongside Author's Notes) so
// fork-mergeability stays manageable: every line of behaviour added
// to this panel sits here, where upstream's `git merge` won't touch
// it. Upstream's simpler `WorldInfoPanel` inside ChatRoleplayPanels.tsx
// is left in place (dead code from our perspective) — the consumer
// (`ActiveWorldInfoButton.tsx`) lazily imports from this file instead.
//
// Phase A scope (this commit):
//   ✓ Per-chat pin (P pill, sky 📌)
//   ✓ Per-chat disable (eye/eye-off + amber strikethrough)
//   ✓ C / P / M reason pills
//   ✓ Regenerate button (re-scan, with draft when present)
//   ✓ Token count = isInjecting subset only
//   ✓ Stable display order across re-scans (positions sticky per chatId)
//   ✓ Always-visible action icons, muted at rest
//   ✓ Budget-skip notice (from upstream #814)
//
// Phase C wiring (2026-05-17): pencil-icon button on each row opens the
// LorebookEntryQuickEditModal. Modal reuses the route-page entry-edit form
// via the LorebookEntryEditor public-API alias added in Phase B.
// ──────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  X,
} from "lucide-react";
import { useChatStore } from "../../../stores/chat.store";
import { useChat, useUpdateChatMetadata } from "../../../hooks/use-chats";
import {
  useActiveLorebookEntries,
  type ActiveLorebookEntry,
  type BudgetSkippedLorebookEntry,
} from "../../../hooks/use-lorebooks";
import { LorebookEntryQuickEditModal } from "../../modals/LorebookEntryQuickEditModal";

// ────────────────────────────────────────────────────────────────────
// Budget-skip notice (from upstream #814). Inlined here so this panel
// is a true drop-in replacement for the legacy WorldInfoPanel without
// pulling helpers from ChatRoleplayPanels.tsx (which would re-introduce
// a merge surface we explicitly chose to avoid).
// ────────────────────────────────────────────────────────────────────

function formatBudgetName(blockedBy: BudgetSkippedLorebookEntry["blockedBy"]) {
  if (blockedBy === "lorebook") return "lorebook budget";
  if (blockedBy === "chat") return "chat budget";
  return "lorebook and chat budgets";
}

function formatBudgetCap(entry: BudgetSkippedLorebookEntry) {
  if (entry.blockedBy === "lorebook") {
    return `${entry.lorebookUsedTokens.toLocaleString()} / ${entry.lorebookBudget.toLocaleString()}`;
  }
  if (entry.blockedBy === "chat") {
    return `${entry.chatUsedTokens.toLocaleString()} / ${entry.chatBudget.toLocaleString()}`;
  }
  const lorebookPart = `${entry.lorebookUsedTokens.toLocaleString()} / ${entry.lorebookBudget.toLocaleString()} lorebook`;
  const chatPart = `${entry.chatUsedTokens.toLocaleString()} / ${entry.chatBudget.toLocaleString()} chat`;
  return `${lorebookPart}, ${chatPart}`;
}

function BudgetSkippedEntryRow({ entry }: { entry: BudgetSkippedLorebookEntry }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      className="w-full rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-left text-xs transition-colors hover:bg-amber-500/15"
      onClick={() => setExpanded((prev) => !prev)}
    >
      <div className="flex items-center gap-1.5">
        {expanded ? <ChevronDown size="0.75rem" /> : <ChevronRight size="0.75rem" />}
        <span className="min-w-0 flex-1 truncate font-medium text-amber-200">{entry.name}</span>
        <span className="shrink-0 text-[0.625rem] text-amber-200/70">~{entry.estimatedTokens.toLocaleString()}</span>
      </div>
      <p className="mt-0.5 truncate pl-5 text-[0.625rem] text-amber-100/70">
        {entry.lorebookName} blocked by {formatBudgetName(entry.blockedBy)}
      </p>
      {expanded && (
        <div className="mt-1.5 space-y-1 border-t border-amber-500/20 pt-1.5 pl-5 text-[0.625rem] leading-relaxed text-amber-50/75">
          <p>Matched: {entry.matchedKeys.length > 0 ? entry.matchedKeys.slice(0, 5).join(", ") : "No key recorded"}</p>
          <p>Entry estimate: ~{entry.estimatedTokens.toLocaleString()} tokens</p>
          <p>Budget used before entry: {formatBudgetCap(entry)}</p>
        </div>
      )}
    </button>
  );
}

function BudgetSkippedEntriesNotice({ entries }: { entries: BudgetSkippedLorebookEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;
  return (
    <div className="mb-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-xs text-amber-50/85">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-1.5 text-left text-[0.625rem] font-medium uppercase tracking-wide text-amber-200/90 transition-colors hover:text-amber-100"
      >
        {expanded ? <ChevronDown size="0.75rem" /> : <ChevronRight size="0.75rem" />}
        <AlertTriangle size="0.75rem" />
        <span>
          {entries.length} entr{entries.length === 1 ? "y" : "ies"} skipped — budget full
        </span>
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1.5">
          {entries.map((entry) => (
            <BudgetSkippedEntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Single-entry row with per-chat override controls
// ────────────────────────────────────────────────────────────────────

function WorldInfoEntryRow({
  entry,
  onToggleEnabled,
  onTogglePinned,
  onEdit,
  toggleBusy,
}: {
  entry: ActiveLorebookEntry;
  onToggleEnabled: (entryId: string, nextEnabled: boolean) => void;
  onTogglePinned: (entryId: string, nextPinned: boolean) => void;
  onEdit: (entry: ActiveLorebookEntry) => void;
  toggleBusy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const enabled = entry.userEnabled !== false;
  const pinned = entry.userPinned === true;
  const injecting = entry.isInjecting === true;
  const matched = entry.keywordMatched === true;
  // Visual signals (orthogonal):
  //   dot colour      = injecting (will reach the prompt)
  //   strikethrough   = user has explicitly disabled
  //   row opacity 50% = on the list but not injecting (disabled OR no
  //                     current activation rule firing — pinned-then-
  //                     disabled is an example of the latter)
  //   pill (C/P/M)    = every reason the entry is on the list at all

  return (
    <div
      className={`group cursor-pointer rounded-lg bg-[var(--secondary)] p-2 text-xs transition-colors hover:bg-[var(--accent)] ${
        injecting ? "" : "opacity-50"
      }`}
      onClick={() => setExpanded((prev) => !prev)}
    >
      {/* Top line: status dot · name · pills · order */}
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            injecting ? "bg-emerald-400" : "bg-[var(--muted-foreground)]/50"
          }`}
        />
        <span
          className={`truncate font-medium text-[var(--foreground)]/80 ${
            enabled ? "" : "line-through decoration-[var(--muted-foreground)]/60"
          }`}
        >
          {entry.name}
        </span>
        {/* Reason pills — every applicable condition shown independently.
            C: globally constant in the lorebook editor.
            P: user-pinned for this chat.
            M: a keyword appears in the chat (or current draft / AN / Summary).
            Multiple may light at once (e.g. C + P when a CONST entry has
            also been pinned for "if I remove the constant flag later"). */}
        <span className="flex shrink-0 items-center gap-0.5">
          {entry.constant && (
            <span
              title="C — Constant: always injects globally (set in the lorebook editor)"
              className="rounded bg-amber-400/15 px-1 py-0.5 text-[0.5rem] font-bold text-amber-400"
            >
              C
            </span>
          )}
          {pinned && (
            <span
              title="P — Pinned for this chat (eye toggle still wins)"
              className="rounded bg-sky-400/15 px-1 py-0.5 text-[0.5rem] font-bold text-sky-400"
            >
              P
            </span>
          )}
          {matched && (
            <span
              title="M — Match: a keyword from this entry appears in the chat or your draft"
              className="rounded bg-[var(--muted-foreground)]/15 px-1 py-0.5 text-[0.5rem] font-bold text-[var(--muted-foreground)]"
            >
              M
            </span>
          )}
        </span>
        <span className="ml-auto shrink-0 text-[0.625rem] text-[var(--muted-foreground)]">#{entry.order}</span>
      </div>

      {/* Keys preview */}
      {entry.keys.length > 0 && (
        <p className="mt-0.5 truncate text-[0.625rem] text-[var(--muted-foreground)]">
          Keys: {entry.keys.slice(0, 5).join(", ")}
          {entry.keys.length > 5 && ` +${entry.keys.length - 5}`}
        </p>
      )}

      {/* Per-entry controls. Always visible; inactive states (unpinned, enabled-
          default) are muted at rest so the resting list stays quiet for scanning,
          and the row's hover state lifts them to full opacity. Active overrides
          (pinned, user-disabled) keep their colour regardless of hover. */}
      <div className="mt-1 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(entry);
          }}
          title="Edit this entry (name, content, keys, all fields) — affects every chat using this lorebook"
          className="shrink-0 rounded-md p-1 text-[var(--muted-foreground)] opacity-50 transition-all hover:bg-[var(--background)]/40 hover:text-[var(--foreground)] group-hover:opacity-100"
        >
          <Pencil size="0.875rem" />
        </button>
        <button
          type="button"
          disabled={toggleBusy}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePinned(entry.id, !pinned);
          }}
          title={
            entry.constant
              ? pinned
                ? "Unpin (no immediate effect — entry is globally CONST)"
                : "Pin (no immediate effect — entry is globally CONST, but the pin will keep it active here if you remove the CONST flag later)"
              : pinned
                ? "Unpin from this chat"
                : "Pin in this chat (always inject)"
          }
          className={`shrink-0 rounded-md p-1 transition-all hover:bg-[var(--background)]/40 hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50 ${
            pinned
              ? "text-sky-400 opacity-100"
              : "text-[var(--muted-foreground)] opacity-50 group-hover:opacity-100"
          }`}
        >
          {pinned ? <Pin size="0.875rem" /> : <PinOff size="0.875rem" />}
        </button>
        <button
          type="button"
          disabled={toggleBusy}
          onClick={(e) => {
            e.stopPropagation();
            onToggleEnabled(entry.id, !enabled);
          }}
          title={enabled ? "Disable in this chat (won't affect other chats or the lorebook)" : "Re-enable in this chat"}
          className={`shrink-0 rounded-md p-1 transition-all hover:bg-[var(--background)]/40 hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50 ${
            enabled
              ? "text-[var(--muted-foreground)] opacity-50 group-hover:opacity-100"
              : "text-amber-400 opacity-100"
          }`}
        >
          {enabled ? <Eye size="0.875rem" /> : <EyeOff size="0.875rem" />}
        </button>
      </div>

      {/* Expanded content view */}
      {expanded && (
        <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap border-t border-[var(--border)] pt-1.5 text-[0.6875rem] leading-relaxed text-[var(--muted-foreground)]">
          {entry.content || "(empty)"}
        </p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Panel
// ────────────────────────────────────────────────────────────────────

type OverrideEntry = { ephemeral?: number | null; enabled?: boolean; pinned?: boolean };

export function WorldInfoPanel({
  chatId,
  isMobile,
  onClose,
}: {
  chatId: string;
  isMobile: boolean;
  onClose: () => void;
}) {
  // Capture the chat's input draft once at panel-open. The scan endpoint
  // accepts an optional `?prepend=` so the panel can preview what would
  // activate if this draft were sent — without forcing the user to click
  // a "regen" button. Captured from the store at mount and held stable for
  // the panel's lifetime; further typing requires manual regen.
  // Recomputed when chatId changes.
  const initialDraft = useMemo(
    () => (useChatStore.getState().inputDrafts.get(chatId) ?? "").trim(),
    [chatId],
  );

  const { data, isLoading, isFetching, refetch } = useActiveLorebookEntries(chatId, true, initialDraft);
  const { data: chat } = useChat(chatId);
  const updateMeta = useUpdateChatMetadata();
  const qc = useQueryClient();
  const [lastRegenUsedDraft, setLastRegenUsedDraft] = useState(initialDraft.length > 0);

  // Force a fresh scan on every panel open. Cheap consumers (the toolbar
  // count) keep a 30s staleTime; this panel wants current truth — Author's
  // Notes / Summary edits in another popover won't trigger a refetch via
  // the query key, so we invalidate here.
  useEffect(() => {
    qc.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey;
        return Array.isArray(k) && k[0] === "lorebooks" && k[1] === "active" && k[2] === chatId;
      },
    });
  }, [chatId, qc]);

  // Read overrides for the in-flight update payload. The server already
  // merges overrides into each entry's userEnabled/userPinned/isInjecting
  // fields, so the client doesn't re-derive — but mutations need the full
  // map to patch.
  const existingMeta = useMemo(() => {
    if (typeof chat?.metadata === "string") {
      try {
        return JSON.parse(chat.metadata) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return (chat?.metadata as Record<string, unknown> | undefined) ?? {};
  }, [chat?.metadata]);
  const existingOverrides = useMemo(() => {
    const raw = existingMeta.entryStateOverrides ?? existingMeta.lorebookEntryStateOverrides;
    return (raw && typeof raw === "object" ? (raw as Record<string, OverrideEntry>) : {}) as Record<string, OverrideEntry>;
  }, [existingMeta]);

  // Stable display order. The server returns entries in scanner order, which
  // can shift if a previously-pinned entry is unpinned (it leaves the active
  // set, gets re-added on a later scan, and lands at a different position).
  // Pinning the first-seen position keeps the visual stable as the user
  // toggles; the order map resets when the chatId changes.
  const orderRef = useRef<{ chatId: string; positions: Map<string, number> }>({
    chatId,
    positions: new Map(),
  });
  if (orderRef.current.chatId !== chatId) {
    orderRef.current = { chatId, positions: new Map() };
  }
  // Memoise the raw entries reference so the order-tracking side effect and
  // the sort below don't run on every render. The same `data?.entries`
  // reference is stable across renders within a single TanStack Query cache
  // hit; without this, `[] ?? data?.entries` produces a fresh array each
  // time, breaking memoisation and re-firing the position-tracking loop.
  const rawEntries = useMemo(() => data?.entries ?? [], [data?.entries]);
  for (const e of rawEntries) {
    if (!orderRef.current.positions.has(e.id)) {
      orderRef.current.positions.set(e.id, orderRef.current.positions.size);
    }
  }
  const entries = useMemo(
    () =>
      [...rawEntries].sort(
        (a, b) =>
          (orderRef.current.positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (orderRef.current.positions.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      ),
    [rawEntries],
  );

  const skippedEntries = data?.budgetSkippedEntries ?? [];

  // Counts driven by isInjecting: the number that will actually reach the
  // prompt, not just the number on the panel list. Server returns isInjecting
  // for every entry; the panel can also see entries that are "on the list
  // but not injecting" (e.g. user-disabled, matched-but-disabled).
  const injectingCount = entries.filter((e) => e.isInjecting === true).length;
  const onListNotInjecting = entries.length - injectingCount;
  const injectingTokens = entries.reduce(
    (sum, e) => sum + (e.isInjecting === true ? (e.tokens ?? 0) : 0),
    0,
  );

  const patchOverride = (entryId: string, patch: Partial<OverrideEntry>) => {
    const nextOverrides: Record<string, OverrideEntry> = {
      ...existingOverrides,
      [entryId]: { ...(existingOverrides[entryId] ?? {}), ...patch },
    };
    updateMeta.mutate(
      { id: chatId, entryStateOverrides: nextOverrides },
      {
        onSuccess: () => {
          // Invalidate matches all variants of this chat's scan (with or
          // without prepend). Predicate-based invalidate handles both keys.
          qc.invalidateQueries({
            predicate: (q) => {
              const k = q.queryKey;
              return Array.isArray(k) && k[0] === "lorebooks" && k[1] === "active" && k[2] === chatId;
            },
          });
        },
      },
    );
  };

  const handleToggle = (entryId: string, nextEnabled: boolean) => {
    patchOverride(entryId, { enabled: nextEnabled });
  };

  const handlePin = (entryId: string, nextPinned: boolean) => {
    patchOverride(entryId, { pinned: nextPinned });
  };

  // Phase C — pencil-icon opens the quick-edit modal. We track lorebookId
  // alongside entryId because the modal needs both to fetch the entry and
  // wire updates. Both go null when the modal closes; the modal's `open`
  // prop is derived from both being non-null.
  const [editTarget, setEditTarget] = useState<{ lorebookId: string; entryId: string } | null>(null);
  const handleEdit = (entry: ActiveLorebookEntry) => {
    setEditTarget({ lorebookId: entry.lorebookId, entryId: entry.id });
  };
  const handleCloseEdit = () => {
    setEditTarget(null);
    // Refresh the panel after edit closes — the user may have changed keys,
    // CONST flag, or content, which can change what's activating.
    qc.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey;
        return Array.isArray(k) && k[0] === "lorebooks" && k[1] === "active" && k[2] === chatId;
      },
    });
  };

  const handleRegen = async () => {
    // Read the chat's CURRENT draft (may have changed since panel opened).
    // The query is keyed by initialDraft; the refetch uses that anchor.
    // If the draft changed, we manually invalidate the keyed query so the
    // next fetch pulls the new draft.
    const draft = (useChatStore.getState().inputDrafts.get(chatId) ?? "").trim();
    if (draft !== initialDraft) {
      // Different draft — invalidate so the query refetches with the new key.
      qc.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey;
          return Array.isArray(k) && k[0] === "lorebooks" && k[1] === "active" && k[2] === chatId;
        },
      });
    }
    await refetch();
    setLastRegenUsedDraft(draft.length > 0);
  };

  const regenSpinning = isFetching;

  return (
    <>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
        <Globe size="0.75rem" />
        Active World Info
        <button
          onClick={handleRegen}
          disabled={regenSpinning}
          title="Re-scan. Includes your typed-but-unsent message in this chat if any."
          className="ml-auto rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size="0.75rem" className={regenSpinning ? "animate-spin" : ""} />
        </button>
        {isMobile && (
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          >
            <X size="0.75rem" />
          </button>
        )}
      </h3>
      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-[var(--muted-foreground)]">
          <Loader2 size="0.75rem" className="animate-spin" />
          Scanning entries...
        </div>
      ) : entries.length === 0 ? (
        <>
          <BudgetSkippedEntriesNotice entries={skippedEntries} />
          <p className="py-3 text-center text-xs text-[var(--muted-foreground)]">No active entries for this chat</p>
        </>
      ) : (
        <>
          <p className="mb-2 text-[0.625rem] text-[var(--muted-foreground)]">
            {injectingCount} injecting
            {onListNotInjecting > 0 && <> • {onListNotInjecting} on list</>}
            {" • "}~{injectingTokens.toLocaleString()} tokens
            {lastRegenUsedDraft && (
              <span className="ml-1 text-amber-400/80" title="Scan includes your typed-but-unsent message">
                · with draft
              </span>
            )}
          </p>
          <BudgetSkippedEntriesNotice entries={skippedEntries} />
          <div className="space-y-1.5">
            {entries.map((entry) => (
              <WorldInfoEntryRow
                key={entry.id}
                entry={entry}
                onToggleEnabled={handleToggle}
                onTogglePinned={handlePin}
                onEdit={handleEdit}
                toggleBusy={updateMeta.isPending}
              />
            ))}
          </div>
        </>
      )}
      <LorebookEntryQuickEditModal
        lorebookId={editTarget?.lorebookId ?? null}
        entryId={editTarget?.entryId ?? null}
        onClose={handleCloseEdit}
      />
    </>
  );
}

