// ──────────────────────────────────────────────
// Active World Info panel — the chat-side preview of which lorebook
// entries are about to reach the next prompt, with per-chat overrides
// (eye toggle for disable, pin for sticky-active) and a pencil icon
// that opens the full entry editor in a modal.
//
// Lives in its own file (rather than alongside Author's Notes) so
// fork-mergeability stays manageable: every line of behaviour added
// to this panel sits here, where upstream's `git merge` won't touch
// it. Upstream's path for World Info is the simpler `WorldInfoPanel`
// inside ChatRoleplayPanels.tsx — when fork-rebased, that simpler
// component is removed and consumers are pointed at this file.
// ──────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Globe, Loader2, PenLine, Pencil, Pin, PinOff, RefreshCw, Save, X } from "lucide-react";
import { api } from "../../lib/api-client";
import { useChatStore } from "../../stores/chat.store";
import { useChat, useUpdateChatMetadata } from "../../hooks/use-chats";
import {
  lorebookKeys,
  useActiveLorebookEntries,
  type ActiveLorebookEntry,
  type ActiveLorebookScan,
} from "../../hooks/use-lorebooks";
import { LorebookEntryQuickEditModal } from "../modals/LorebookEntryQuickEditModal";

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
  const enabled = entry.userEnabled;
  const pinned = entry.userPinned;
  const injecting = entry.isInjecting;
  // Visual signals (orthogonal):
  //   dot colour       = injecting (will reach the prompt)
  //   strikethrough    = user has explicitly disabled
  //   row opacity 50%  = on the list but not injecting (disabled OR no
  //                       current activation rule firing — pinned-then-
  //                       disabled is an example of the latter)
  //   pill (CONST/PINNED) = why the entry is on the list at all

  return (
    <div
      className={`group cursor-pointer rounded-lg bg-[var(--secondary)] p-2 text-xs transition-colors hover:bg-[var(--accent)] ${
        injecting ? "" : "opacity-50"
      }`}
      onClick={() => setExpanded((prev) => !prev)}
    >
      {/* Top line: status dot · name · pill · order */}
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${injecting ? "bg-emerald-400" : "bg-[var(--muted-foreground)]/50"}`}
        />
        <span
          className={`truncate font-medium text-[var(--foreground)]/80 ${enabled ? "" : "line-through decoration-[var(--muted-foreground)]/60"}`}
        >
          {entry.name}
        </span>
        {/* Reason pills — every applicable condition shown independently.
            C: globally constant in the lorebook editor.
            P: user-pinned for this chat.
            M: a keyword appears in the chat (or current draft).
            Multiple may light at once (e.g. C + P when a CONST entry has
            been pinned for "if I remove the constant flag later"). */}
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
          {entry.keywordMatched && (
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

      {/* Keys preview (existing) */}
      {entry.keys.length > 0 && (
        <p className="mt-0.5 truncate text-[0.625rem] text-[var(--muted-foreground)]">
          Keys: {entry.keys.slice(0, 5).join(", ")}
          {entry.keys.length > 5 && ` +${entry.keys.length - 5}`}
        </p>
      )}

      {/* Second line: per-entry controls. Always visible. Inactive states
          (unpinned, enabled-default) are muted at rest so the resting list
          stays quiet for scanning; the row's hover state lifts them to full
          opacity so it's clear they're interactive. Active overrides
          (pinned, disabled-by-user) keep their colour regardless of hover —
          they're meaningful at a glance, not just on focus. */}
      <div className="mt-1 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(entry);
          }}
          title="Edit this entry (name, content, keys, enabled, constant) — affects every chat using this lorebook"
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
          title={
            enabled
              ? "Disable in this chat (won't affect other chats or the lorebook)"
              : "Re-enable in this chat"
          }
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
  // a "regen" button. The draft is captured from the store at mount and
  // held stable for the panel's lifetime; if the user types more after
  // opening the panel, the original draft is used until manual regen.
  // Recomputed when chatId changes (different chat, different draft).
  const initialDraft = useMemo(
    () => (useChatStore.getState().inputDrafts.get(chatId) ?? "").trim(),
    [chatId],
  );

  const { data, isLoading, isFetching } = useActiveLorebookEntries(chatId, true, initialDraft);
  const { data: chat } = useChat(chatId);
  const updateMeta = useUpdateChatMetadata();
  const qc = useQueryClient();
  const [regenWithDraftBusy, setRegenWithDraftBusy] = useState(false);
  const [lastRegenUsedDraft, setLastRegenUsedDraft] = useState(initialDraft.length > 0);

  // Read overrides — drives the in-flight update payload below. The server
  // already merges overrides into each entry's userEnabled/userPinned/
  // isInjecting fields, so the client doesn't need to re-derive them.
  const existingMeta =
    typeof chat?.metadata === "string"
      ? JSON.parse(chat.metadata as unknown as string)
      : ((chat?.metadata as Record<string, unknown> | undefined) ?? {});
  type OverrideEntry = { ephemeral?: number | null; enabled?: boolean; pinned?: boolean };
  const existingOverrides = (existingMeta.entryStateOverrides as Record<string, OverrideEntry>) ?? {};

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
  const rawEntries = data?.entries ?? [];
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

  // Counts driven by isInjecting: the number that will actually reach the
  // prompt, not just the number on the panel list.
  const injectingCount = entries.filter((e) => e.isInjecting).length;
  const onListNotInjecting = entries.length - injectingCount;
  const injectingTokens = entries.reduce((sum, e) => sum + (e.isInjecting ? e.tokens : 0), 0);

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

  const [editTarget, setEditTarget] = useState<{ lorebookId: string; entryId: string } | null>(null);
  const handleEdit = (entry: ActiveLorebookEntry) => {
    setEditTarget({ lorebookId: entry.lorebookId, entryId: entry.id });
  };

  const handleRegen = async () => {
    // Read the chat's CURRENT draft (may have changed since panel opened).
    // The query is keyed by `initialDraft`; we update its cache directly
    // rather than re-keying. If the draft changed, this scan reflects the
    // newer text, but the keyed query still represents the panel session's
    // anchor scan. Subsequent staleness-based refetches will use initialDraft.
    const draft = (useChatStore.getState().inputDrafts.get(chatId) ?? "").trim();
    setRegenWithDraftBusy(true);
    try {
      const url = draft
        ? `/lorebooks/scan/${chatId}?prepend=${encodeURIComponent(draft)}`
        : `/lorebooks/scan/${chatId}`;
      const result = await api.get<ActiveLorebookScan>(url);
      qc.setQueryData([...lorebookKeys.all, "active", chatId, initialDraft], result);
      setLastRegenUsedDraft(draft.length > 0);
    } finally {
      setRegenWithDraftBusy(false);
    }
  };

  const regenSpinning = isFetching || regenWithDraftBusy;

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
        <p className="py-3 text-center text-xs text-[var(--muted-foreground)]">No active entries for this chat</p>
      ) : (
        <>
          <p className="mb-2 text-[0.625rem] text-[var(--muted-foreground)]">
            {injectingCount} injecting
            {onListNotInjecting > 0 && <> • {onListNotInjecting} on list</>}
            {" • "}
            ~{injectingTokens.toLocaleString()} tokens
            {lastRegenUsedDraft && (
              <span className="ml-1 text-amber-400/80" title="Scan includes your typed-but-unsent message">
                · with draft
              </span>
            )}
          </p>
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
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        lorebookId={editTarget?.lorebookId ?? null}
        entryId={editTarget?.entryId ?? null}
      />
    </>
  );
}

