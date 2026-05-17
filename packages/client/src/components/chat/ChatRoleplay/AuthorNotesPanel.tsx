// ──────────────────────────────────────────────
// Author's Notes panel — entries edition
//
// Replaces the upstream single-textarea Author's Notes with an ordered
// list of toggleable notes. Active notes compose into the same
// injection block at the same depth — server-side composer in
// services/author-notes/compose.ts handles both the legacy
// `authorNotes` string and the new `authorNoteFragments` array (the
// storage key kept its legacy name to avoid a metadata migration), so
// chats untouched by this UI keep working bit-identically.
//
// Lives in its own file (rather than alongside upstream's panel) so
// fork-mergeability stays manageable: changes upstream make to its
// own AuthorNotesPanel can't conflict with this file. ChatRoleplay-
// Surface's lazy-import path points consumers here.
// ──────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Eye, EyeOff, PenLine, Plus, Trash2, X } from "lucide-react";
import type { AuthorsNoteEntry } from "@marinara-engine/shared";
import { useUpdateChatMetadata } from "../../../hooks/use-chats";

interface AuthorNotesPanelProps {
  chatId: string;
  chatMeta: Record<string, any>;
  isMobile: boolean;
  onClose: () => void;
}

export function AuthorNotesPanel({ chatId, chatMeta, isMobile, onClose }: AuthorNotesPanelProps) {
  const updateMeta = useUpdateChatMetadata();

  // Hydrate entries from chat metadata, with one-shot migration of any
  // legacy single-string `authorNotes` into a single enabled note so
  // the user doesn't lose what was already typed there.
  const initialEntries = useMemo(
    () => hydrateEntries(chatMeta),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId],
  );

  const [entries, setEntries] = useState<AuthorsNoteEntry[]>(initialEntries);
  const [depthStr, setDepthStr] = useState(String((chatMeta.authorNotesDepth as number) ?? 4));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => collectInitiallyExpanded(initialEntries));

  // Refs for the unmount-flush pattern (popover dismissals trigger unmount
  // before onBlur of an in-progress textarea would fire — without flushing,
  // the user's last keystroke is lost).
  const latestRef = useRef<{ entries: AuthorsNoteEntry[]; depth: number }>({
    entries: initialEntries,
    depth: parseInt(depthStr, 10) || 4,
  });
  latestRef.current = { entries, depth: parseInt(depthStr, 10) || 4 };

  const baselineRef = useRef({
    entries: initialEntries,
    depth: parseInt(depthStr, 10) || 4,
  });

  const mutateRef = useRef(updateMeta.mutate);
  mutateRef.current = updateMeta.mutate;

  // Sync state when chatMeta changes externally (e.g. another tab updated
  // the chat). Only fires when we're not actively editing — the baselineRef
  // stays put if the user has unsaved changes.
  useEffect(() => {
    const externalEntries = hydrateEntries(chatMeta);
    const externalDepth = (chatMeta.authorNotesDepth as number) ?? 4;
    setEntries(externalEntries);
    setDepthStr(String(externalDepth));
    baselineRef.current = { entries: externalEntries, depth: externalDepth };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMeta.authorNoteFragments, chatMeta.authorNotes, chatMeta.authorNotesDepth]);

  // Flush-on-unmount: catches in-flight content edits the user hadn't blurred
  // out of yet when the popover dismissed. Applies pipe-split here too so a
  // user who typed "a|b" and dismissed the popover gets the same split they
  // would have gotten by blurring.
  useEffect(() => {
    const capturedChatId = chatId;
    return () => {
      const { entries: e, depth: d } = latestRef.current;
      const split = splitEntriesByPipe(e);
      const base = baselineRef.current;
      if (!entriesEqual(split, base.entries) || d !== base.depth) {
        mutateRef.current({ id: capturedChatId, authorNoteFragments: split, authorNotesDepth: d });
      }
    };
  }, [chatId]);

  // ── Persistence helpers ──

  const persist = useCallback(
    (next: AuthorsNoteEntry[], nextDepth?: number) => {
      const depth = nextDepth ?? (parseInt(depthStr, 10) || 4);
      updateMeta.mutate({ id: chatId, authorNoteFragments: next, authorNotesDepth: depth });
      baselineRef.current = { entries: next, depth };
    },
    [chatId, depthStr, updateMeta],
  );

  // ── Operations ──

  const addNote = () => {
    const id = generateEntryId();
    const next: AuthorsNoteEntry[] = [...entries, { id, content: "", enabled: true, order: entries.length }];
    setEntries(next);
    setExpandedIds((prev) => new Set([...prev, id]));
    persist(next);
  };

  const deleteNote = (id: string) => {
    const next = renumber(entries.filter((e) => e.id !== id));
    setEntries(next);
    persist(next);
  };

  const toggleEnabled = (id: string) => {
    const next = entries.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e));
    setEntries(next);
    persist(next);
  };

  const moveNote = (id: string, direction: "up" | "down") => {
    const idx = entries.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= entries.length) return;
    const next = [...entries];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    const renumbered = renumber(next);
    setEntries(renumbered);
    persist(renumbered);
  };

  const updateContent = (id: string, content: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, content } : e)));
  };

  const commitContent = (_id: string) => {
    // On blur: pipe-split any entry whose content contains "|" before
    // persisting. The blurred entry is the usual trigger but we scan all
    // entries so an unblurred sibling in the same panel can't carry a
    // stale pipe through commit.
    const next = splitEntriesByPipe(latestRef.current.entries);
    if (next !== latestRef.current.entries) setEntries(next);
    persist(next);
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDepthBlur = () => {
    const nextDepth = Math.max(0, parseInt(depthStr, 10) || 0);
    setDepthStr(String(nextDepth));
    persist(entries, nextDepth);
  };

  const enabledCount = entries.filter((e) => e.enabled && e.content.trim()).length;
  const disabledCount = entries.length - enabledCount;

  return (
    <>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
        <PenLine size="0.75rem" />
        Author's Notes
        {isMobile && (
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          >
            <X size="0.75rem" />
          </button>
        )}
      </h3>

      <p className="mb-2 text-[0.625rem] text-[var(--muted-foreground)]">
        Notes are composed (in order) and injected at the chosen depth. Disable a note to keep it around
        without injecting. Type <code className="rounded bg-[var(--accent)]/40 px-1 font-mono">|</code> in a note
        to split it into multiple.
      </p>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] py-3 text-center text-[0.625rem] text-[var(--muted-foreground)]/70">
          No notes yet. Add one to start.
        </p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry, i) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              expanded={expandedIds.has(entry.id)}
              isFirst={i === 0}
              isLast={i === entries.length - 1}
              onToggleExpanded={() => toggleExpanded(entry.id)}
              onToggleEnabled={() => toggleEnabled(entry.id)}
              onMoveUp={() => moveNote(entry.id, "up")}
              onMoveDown={() => moveNote(entry.id, "down")}
              onChangeContent={(content) => updateContent(entry.id, content)}
              onCommit={() => commitContent(entry.id)}
              onDelete={() => deleteNote(entry.id)}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          onClick={addNote}
          className="flex items-center gap-1 rounded-md bg-[var(--secondary)] px-2 py-1 text-[0.625rem] font-medium text-[var(--foreground)]/80 transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
        >
          <Plus size="0.75rem" />
          Add note
        </button>
        {entries.length > 0 && (
          <span className="text-[0.5625rem] text-[var(--muted-foreground)]/70">
            {enabledCount} active{disabledCount > 0 ? ` · ${disabledCount} disabled` : ""}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-[var(--border)]/40 pt-2">
        <span className="shrink-0 text-[0.625rem] text-[var(--muted-foreground)]">Injection Depth</span>
        <input
          type="text"
          inputMode="numeric"
          value={depthStr}
          onChange={(e) => setDepthStr(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={handleDepthBlur}
          className="w-14 rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 text-center text-[0.625rem] text-[var(--foreground)] outline-none transition-colors [appearance:textfield] focus:ring-2 focus:ring-[var(--ring)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <p className="mt-1 text-[0.5625rem] text-[var(--muted-foreground)]/60">
        Depth 0 = end of conversation (strongest pull on the next reply). 4 = four messages from the end (ambient).
      </p>
    </>
  );
}

// ──────────────────────────────────────────────
// EntryRow
// ──────────────────────────────────────────────

interface EntryRowProps {
  entry: AuthorsNoteEntry;
  expanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggleExpanded: () => void;
  onToggleEnabled: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onChangeContent: (content: string) => void;
  onCommit: () => void;
  onDelete: () => void;
}

function EntryRow({
  entry,
  expanded,
  isFirst,
  isLast,
  onToggleExpanded,
  onToggleEnabled,
  onMoveUp,
  onMoveDown,
  onChangeContent,
  onCommit,
  onDelete,
}: EntryRowProps) {
  const enabled = entry.enabled;
  const preview = entry.content.trim().split("\n")[0]?.slice(0, 60) ?? "";
  const showPlaceholder = !preview;

  return (
    <div
      className={`group rounded-lg border border-[var(--border)]/40 bg-[var(--secondary)] text-xs transition-colors ${
        enabled ? "" : "opacity-60"
      }`}
    >
      {/* Header row — always visible */}
      <div className="flex items-center gap-1 p-1.5">
        <button
          type="button"
          onClick={onToggleExpanded}
          className="shrink-0 rounded p-0.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          title={expanded ? "Collapse" : "Expand to edit"}
        >
          {expanded ? <ChevronDown size="0.75rem" /> : <ChevronRight size="0.75rem" />}
        </button>

        <button
          type="button"
          onClick={onToggleEnabled}
          className={`shrink-0 rounded p-0.5 transition-colors hover:bg-[var(--accent)] ${
            enabled ? "text-emerald-400" : "text-[var(--muted-foreground)]"
          }`}
          title={enabled ? "Disable (keep but don't inject)" : "Enable"}
        >
          {enabled ? <Eye size="0.75rem" /> : <EyeOff size="0.75rem" />}
        </button>

        <button
          type="button"
          onClick={onToggleExpanded}
          className={`flex-1 cursor-pointer truncate text-left ${
            showPlaceholder
              ? "italic text-[var(--muted-foreground)]/60"
              : enabled
                ? "text-[var(--foreground)]/85"
                : "text-[var(--muted-foreground)] line-through decoration-[var(--muted-foreground)]/60"
          }`}
        >
          {showPlaceholder ? "(empty note — click to write)" : preview}
          {!showPlaceholder && entry.content.length > 60 && "…"}
        </button>

        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="shrink-0 rounded p-0.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-30"
          title="Move up"
        >
          <ArrowUp size="0.75rem" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="shrink-0 rounded p-0.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-30"
          title="Move down"
        >
          <ArrowDown size="0.75rem" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 rounded p-0.5 text-[var(--muted-foreground)] opacity-50 transition-colors hover:bg-[var(--accent)] hover:text-red-400 group-hover:opacity-100"
          title="Delete note"
        >
          <Trash2 size="0.75rem" />
        </button>
      </div>

      {/* Editor — visible when expanded */}
      {expanded && (
        <div className="border-t border-[var(--border)]/40 p-1.5">
          <textarea
            value={entry.content}
            onChange={(e) => onChangeContent(e.target.value)}
            onBlur={onCommit}
            placeholder="e.g. Reveal that the visitor is secretly on a deadline."
            rows={3}
            className="w-full resize-y rounded-md border border-[var(--border)]/40 bg-[var(--background)]/40 px-2 py-1.5 text-[0.6875rem] leading-relaxed text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-foreground)]/60 focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function hydrateEntries(meta: Record<string, any>): AuthorsNoteEntry[] {
  const raw = meta?.authorNoteFragments;
  if (Array.isArray(raw)) {
    return raw
      .filter((e) => e && typeof e === "object" && typeof e.id === "string" && typeof e.content === "string")
      .map((e, i) => ({
        id: e.id,
        content: e.content,
        enabled: e.enabled !== false,
        order: typeof e.order === "number" ? e.order : i,
      }))
      .sort((a, b) => a.order - b.order);
  }
  // Migration path: legacy single-string lifts into one enabled note.
  // We don't write this back until the user actually edits — they could
  // reopen on an unmodified upstream client and still see their text.
  const legacy = meta?.authorNotes;
  if (typeof legacy === "string" && legacy.trim()) {
    return [{ id: generateEntryId(), content: legacy, enabled: true, order: 0 }];
  }
  return [];
}

function collectInitiallyExpanded(entries: AuthorsNoteEntry[]): Set<string> {
  // Auto-expand if there's exactly one note so the user can see the
  // content without an extra click. Otherwise start collapsed for scanning.
  if (entries.length === 1) return new Set([entries[0].id]);
  return new Set();
}

function renumber(entries: AuthorsNoteEntry[]): AuthorsNoteEntry[] {
  return entries.map((e, i) => ({ ...e, order: i }));
}

// Scan entries and split any whose content contains "|" into siblings
// inserted directly after the source. Each piece is trimmed (spaces around a
// typed pipe are almost always accidental) and fully-empty pieces are
// dropped, so trailing/leading/doubled pipes don't leave empty notes.
// New entries inherit the source's `enabled` flag — splitting shouldn't
// silently change what gets injected. Returns the original array reference
// when no split was needed, so callers can short-circuit cheaply.
function splitEntriesByPipe(entries: AuthorsNoteEntry[]): AuthorsNoteEntry[] {
  let changed = false;
  const expanded: AuthorsNoteEntry[] = [];
  for (const e of entries) {
    if (!e.content.includes("|")) {
      expanded.push(e);
      continue;
    }
    changed = true;
    const pieces = e.content
      .split("|")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (pieces.length === 0) {
      expanded.push({ ...e, content: "" });
      continue;
    }
    expanded.push({ ...e, content: pieces[0] });
    for (let i = 1; i < pieces.length; i++) {
      expanded.push({ id: generateEntryId(), content: pieces[i], enabled: e.enabled, order: 0 });
    }
  }
  return changed ? renumber(expanded) : entries;
}

function entriesEqual(a: AuthorsNoteEntry[], b: AuthorsNoteEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.id !== y.id || x.content !== y.content || x.enabled !== y.enabled || x.order !== y.order) return false;
  }
  return true;
}

function generateEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
