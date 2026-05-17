// ──────────────────────────────────────────────
// Author's Notes panel — fragments edition
//
// Replaces the upstream single-textarea Author's Notes with an ordered
// list of toggleable fragments. Active fragments compose into the same
// injection block at the same depth — server-side composer in
// services/author-notes/compose.ts handles both the legacy
// `authorNotes` string and the new `authorNoteFragments` array, so
// chats untouched by this UI keep working bit-identically.
//
// Lives in its own file (rather than alongside upstream's panel) so
// fork-mergeability stays manageable: changes upstream make to its
// own AuthorNotesPanel can't conflict with this file. ChatRoleplay-
// Surface's lazy-import path points consumers here.
// ──────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Eye, EyeOff, PenLine, Plus, Trash2, X } from "lucide-react";
import type { AuthorNoteFragment } from "@marinara-engine/shared";
import { useUpdateChatMetadata } from "../../../hooks/use-chats";

interface AuthorNotesPanelProps {
  chatId: string;
  chatMeta: Record<string, any>;
  isMobile: boolean;
  onClose: () => void;
}

export function AuthorNotesPanel({ chatId, chatMeta, isMobile, onClose }: AuthorNotesPanelProps) {
  const updateMeta = useUpdateChatMetadata();

  // Hydrate fragments from chat metadata, with one-shot migration of any
  // legacy single-string `authorNotes` into a single enabled fragment so
  // the user doesn't lose what was already typed there.
  const initialFragments = useMemo(
    () => hydrateFragments(chatMeta),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId],
  );

  const [fragments, setFragments] = useState<AuthorNoteFragment[]>(initialFragments);
  const [depthStr, setDepthStr] = useState(String((chatMeta.authorNotesDepth as number) ?? 4));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => collectInitiallyExpanded(initialFragments));

  // Refs for the unmount-flush pattern (popover dismissals trigger unmount
  // before onBlur of an in-progress textarea would fire — without flushing,
  // the user's last keystroke is lost).
  const latestRef = useRef<{ fragments: AuthorNoteFragment[]; depth: number }>({
    fragments: initialFragments,
    depth: parseInt(depthStr, 10) || 4,
  });
  latestRef.current = { fragments, depth: parseInt(depthStr, 10) || 4 };

  const baselineRef = useRef({
    fragments: initialFragments,
    depth: parseInt(depthStr, 10) || 4,
  });

  const mutateRef = useRef(updateMeta.mutate);
  mutateRef.current = updateMeta.mutate;

  // Sync state when chatMeta changes externally (e.g. another tab updated
  // the chat). Only fires when we're not actively editing — the baselineRef
  // stays put if the user has unsaved changes.
  useEffect(() => {
    const externalFragments = hydrateFragments(chatMeta);
    const externalDepth = (chatMeta.authorNotesDepth as number) ?? 4;
    setFragments(externalFragments);
    setDepthStr(String(externalDepth));
    baselineRef.current = { fragments: externalFragments, depth: externalDepth };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMeta.authorNoteFragments, chatMeta.authorNotes, chatMeta.authorNotesDepth]);

  // Flush-on-unmount: catches in-flight content edits the user hadn't blurred
  // out of yet when the popover dismissed.
  useEffect(() => {
    const capturedChatId = chatId;
    return () => {
      const { fragments: f, depth: d } = latestRef.current;
      const base = baselineRef.current;
      if (!fragmentsEqual(f, base.fragments) || d !== base.depth) {
        mutateRef.current({ id: capturedChatId, authorNoteFragments: f, authorNotesDepth: d });
      }
    };
  }, [chatId]);

  // ── Persistence helpers ──

  const persist = useCallback(
    (next: AuthorNoteFragment[], nextDepth?: number) => {
      const depth = nextDepth ?? (parseInt(depthStr, 10) || 4);
      updateMeta.mutate({ id: chatId, authorNoteFragments: next, authorNotesDepth: depth });
      baselineRef.current = { fragments: next, depth };
    },
    [chatId, depthStr, updateMeta],
  );

  // ── Operations ──

  const addFragment = () => {
    const id = generateFragmentId();
    const next: AuthorNoteFragment[] = [...fragments, { id, content: "", enabled: true, order: fragments.length }];
    setFragments(next);
    setExpandedIds((prev) => new Set([...prev, id]));
    persist(next);
  };

  const deleteFragment = (id: string) => {
    const next = renumber(fragments.filter((f) => f.id !== id));
    setFragments(next);
    persist(next);
  };

  const toggleEnabled = (id: string) => {
    const next = fragments.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f));
    setFragments(next);
    persist(next);
  };

  const moveFragment = (id: string, direction: "up" | "down") => {
    const idx = fragments.findIndex((f) => f.id === id);
    if (idx < 0) return;
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= fragments.length) return;
    const next = [...fragments];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    const renumbered = renumber(next);
    setFragments(renumbered);
    persist(renumbered);
  };

  const updateContent = (id: string, content: string) => {
    setFragments((prev) => prev.map((f) => (f.id === id ? { ...f, content } : f)));
  };

  const commitContent = (id: string) => {
    // On blur, persist whatever the local state is for this row.
    persist(latestRef.current.fragments);
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
    persist(fragments, nextDepth);
  };

  const enabledCount = fragments.filter((f) => f.enabled && f.content.trim()).length;
  const disabledCount = fragments.length - enabledCount;

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
        Fragments are composed (in order) and injected at the chosen depth. Disable a fragment to keep it around
        without injecting.
      </p>

      {fragments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--border)] py-3 text-center text-[0.625rem] text-[var(--muted-foreground)]/70">
          No fragments yet. Add one to start.
        </p>
      ) : (
        <div className="space-y-1.5">
          {fragments.map((f, i) => (
            <FragmentRow
              key={f.id}
              fragment={f}
              expanded={expandedIds.has(f.id)}
              isFirst={i === 0}
              isLast={i === fragments.length - 1}
              onToggleExpanded={() => toggleExpanded(f.id)}
              onToggleEnabled={() => toggleEnabled(f.id)}
              onMoveUp={() => moveFragment(f.id, "up")}
              onMoveDown={() => moveFragment(f.id, "down")}
              onChangeContent={(content) => updateContent(f.id, content)}
              onCommit={() => commitContent(f.id)}
              onDelete={() => deleteFragment(f.id)}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          onClick={addFragment}
          className="flex items-center gap-1 rounded-md bg-[var(--secondary)] px-2 py-1 text-[0.625rem] font-medium text-[var(--foreground)]/80 transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
        >
          <Plus size="0.75rem" />
          Add fragment
        </button>
        {fragments.length > 0 && (
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
// FragmentRow
// ──────────────────────────────────────────────

interface FragmentRowProps {
  fragment: AuthorNoteFragment;
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

function FragmentRow({
  fragment,
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
}: FragmentRowProps) {
  const enabled = fragment.enabled;
  const preview = fragment.content.trim().split("\n")[0]?.slice(0, 60) ?? "";
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
          {showPlaceholder ? "(empty fragment — click to write)" : preview}
          {!showPlaceholder && fragment.content.length > 60 && "…"}
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
          title="Delete fragment"
        >
          <Trash2 size="0.75rem" />
        </button>
      </div>

      {/* Editor — visible when expanded */}
      {expanded && (
        <div className="border-t border-[var(--border)]/40 p-1.5">
          <textarea
            value={fragment.content}
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

function hydrateFragments(meta: Record<string, any>): AuthorNoteFragment[] {
  const raw = meta?.authorNoteFragments;
  if (Array.isArray(raw)) {
    return raw
      .filter((f) => f && typeof f === "object" && typeof f.id === "string" && typeof f.content === "string")
      .map((f, i) => ({
        id: f.id,
        content: f.content,
        enabled: f.enabled !== false,
        order: typeof f.order === "number" ? f.order : i,
      }))
      .sort((a, b) => a.order - b.order);
  }
  // Migration path: legacy single-string lifts into one enabled fragment.
  // We don't write this back until the user actually edits — they could
  // reopen on an unmodified upstream client and still see their text.
  const legacy = meta?.authorNotes;
  if (typeof legacy === "string" && legacy.trim()) {
    return [{ id: generateFragmentId(), content: legacy, enabled: true, order: 0 }];
  }
  return [];
}

function collectInitiallyExpanded(fragments: AuthorNoteFragment[]): Set<string> {
  // Auto-expand if there's exactly one fragment so the user can see the
  // content without an extra click. Otherwise start collapsed for scanning.
  if (fragments.length === 1) return new Set([fragments[0].id]);
  return new Set();
}

function renumber(fragments: AuthorNoteFragment[]): AuthorNoteFragment[] {
  return fragments.map((f, i) => ({ ...f, order: i }));
}

function fragmentsEqual(a: AuthorNoteFragment[], b: AuthorNoteFragment[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.id !== y.id || x.content !== y.content || x.enabled !== y.enabled || x.order !== y.order) return false;
  }
  return true;
}

function generateFragmentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `frag-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
