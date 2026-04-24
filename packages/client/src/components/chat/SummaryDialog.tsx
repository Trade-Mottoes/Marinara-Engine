// ──────────────────────────────────────────────
// Summary Dialog — view/edit/generate the rolling chat summary
// Rendered inside a shared Modal (see SummaryButton in ChatRoleplaySurface).
// ──────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useGenerateSummary, useIsSummaryGenerating, useUpdateChatMetadata } from "../../hooks/use-chats";
import { cn } from "../../lib/utils";

interface SummaryDialogProps {
  chatId: string;
  summary: string | null;
  contextSize: number;
  onContextSizeChange: (size: number) => void;
  onClose: () => void;
}

export function SummaryDialog({ chatId, summary, contextSize, onContextSizeChange, onClose }: SummaryDialogProps) {
  const propsSummary = summary ?? "";
  const [draft, setDraft] = useState(propsSummary);
  const [contextSizeStr, setContextSizeStr] = useState(String(contextSize || 50));
  const updateMeta = useUpdateChatMetadata();
  const generateSummary = useGenerateSummary();

  // ── Race-proof autosave (matches AuthorNotesPanel) ──────────────────────
  // Tracks the last value we persisted so a server round-trip echo doesn't
  // clobber in-flight typing.
  const lastSavedRef = useRef(propsSummary);
  // Live ref so the unmount cleanup sees the freshest draft.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  // Stable mutate handle for the unmount path.
  const mutateRef = useRef(updateMeta.mutate);
  useEffect(() => {
    mutateRef.current = updateMeta.mutate;
  });

  // Sync from props only when an external change genuinely differs from the
  // last value we saved. Lets external edits (other tab, agent) land while
  // protecting current keystrokes from being overwritten by our own echoes.
  useEffect(() => {
    if (propsSummary !== lastSavedRef.current) {
      setDraft(propsSummary);
      lastSavedRef.current = propsSummary;
    }
  }, [propsSummary]);

  // Debounced autosave.
  useEffect(() => {
    if (draft === lastSavedRef.current) return;
    const t = setTimeout(() => {
      lastSavedRef.current = draft;
      mutateRef.current({ id: chatId, summary: draft.trim() ? draft : null });
    }, 400);
    return () => clearTimeout(t);
  }, [draft, chatId]);

  // Safety net: flush any pending edit when the dialog unmounts before the
  // debounce timer fires (closing via X / backdrop / Escape / Done).
  useEffect(() => {
    return () => {
      const live = draftRef.current;
      if (live !== lastSavedRef.current) {
        lastSavedRef.current = live;
        mutateRef.current({ id: chatId, summary: live.trim() ? live : null });
      }
    };
  }, [chatId]);

  // ── Generate ────────────────────────────────────────────────────────────
  // Cross-component signal: true whenever ANY pending generate-summary mutation
  // exists for this chat — so reopening the dialog after closing during a
  // generation correctly reflects ongoing work. `generateSummary.isPending`
  // alone would only be true for the mutation owned by this dialog instance.
  const isGenerating = useIsSummaryGenerating(chatId) || generateSummary.isPending;

  const handleGenerate = () => {
    if (isGenerating) return;
    generateSummary.mutate(
      { chatId, contextSize },
      {
        onSuccess: (data) => {
          // Replace the draft with the freshly generated summary. The server
          // already persisted it, so update lastSavedRef to suppress a
          // redundant follow-up write from the autosave effect. If this
          // dialog was closed before completion the writes are no-ops, and
          // React Query's cache invalidation will refresh `summary` on the
          // next mount via the prop-sync effect above.
          setDraft(data.summary);
          lastSavedRef.current = data.summary;
        },
      },
    );
  };

  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const charCount = draft.length;
  const effectiveContextSize = Math.max(5, Math.min(200, parseInt(contextSizeStr, 10) || 50));

  return (
    <div className="space-y-4">
      {/* In-flight generation banner — shown on dialog open/reopen while a
          mutation is still running. Edits are disabled here because the
          server-side handler appends to chat metadata on completion, which
          would overwrite anything typed in the meantime. */}
      {isGenerating && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          <Loader2 size="0.875rem" className="mt-0.5 shrink-0 animate-spin" />
          <div className="space-y-0.5">
            <p className="font-medium">Generating a new summary…</p>
            <p className="text-[0.6875rem] text-amber-200/80">
              Editing is disabled until this finishes. You can close this dialog — generation will continue in the
              background and the result will appear here when you reopen it.
            </p>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="summary-text" className="text-xs font-medium text-[var(--foreground)]">
            Summary
          </label>
          <span className="text-[0.625rem] tabular-nums text-[var(--muted-foreground)]">
            {wordCount.toLocaleString()} words · {charCount.toLocaleString()} chars
          </span>
        </div>
        <textarea
          id="summary-text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a summary of this chat, or generate one from recent messages."
          rows={10}
          readOnly={isGenerating}
          aria-busy={isGenerating}
          className={cn(
            "w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-xs leading-relaxed text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--ring)]",
            isGenerating && "cursor-not-allowed opacity-60",
          )}
        />
        <p className="text-[0.625rem] text-[var(--muted-foreground)]/70">
          Auto-saves as you type. Injected into every prompt at the chat-summary marker.
        </p>
      </div>

      {/* Generate */}
      <div className="space-y-2 border-t border-[var(--border)]/40 pt-3">
        <label className="text-xs font-medium text-[var(--foreground)]">
          Auto-generate from recent messages
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={5}
            max={200}
            value={contextSizeStr}
            onChange={(e) => setContextSizeStr(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => {
              const clamped = effectiveContextSize;
              setContextSizeStr(String(clamped));
              onContextSizeChange(clamped);
            }}
            disabled={isGenerating}
            className="w-16 rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2 py-1 text-center text-xs text-[var(--foreground)] outline-none transition-colors [appearance:textfield] focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="flex-1 text-[0.6875rem] text-[var(--muted-foreground)]">recent messages</span>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
              "bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-sm",
              "hover:shadow-md active:scale-[0.98]",
              "disabled:cursor-wait disabled:opacity-60 disabled:shadow-none disabled:active:scale-100",
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 size="0.75rem" className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles size="0.75rem" />
                Generate
              </>
            )}
          </button>
        </div>
        <p className="text-[0.625rem] text-[var(--muted-foreground)]/70">
          Appends a new paragraph covering the last {effectiveContextSize} messages to the summary above.
        </p>
      </div>

      {/* Footer actions — matches the house pattern used by EditAgentModal etc. */}
      <div className="flex items-center justify-between gap-2 border-t border-[var(--border)]/40 pt-3">
        <span className="text-[0.625rem] text-[var(--muted-foreground)]/60">Auto-saved.</span>
        <button
          onClick={onClose}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-xs font-medium text-[var(--primary-foreground)] transition-all hover:opacity-90"
        >
          Done
        </button>
      </div>
    </div>
  );
}
