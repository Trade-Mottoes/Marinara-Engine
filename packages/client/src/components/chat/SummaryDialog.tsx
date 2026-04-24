// ──────────────────────────────────────────────
// Summary surfaces — peek (read-only, allows Generate) + dialog (editor).
// Rendered by SummaryButton in ChatRoleplaySurface.
// ──────────────────────────────────────────────
import { useEffect, useState } from "react";
import { Loader2, PenLine, Save, ScrollText, Sparkles, X } from "lucide-react";
import { useGenerateSummary, useIsSummaryGenerating, useUpdateChatMetadata } from "../../hooks/use-chats";
import { cn } from "../../lib/utils";

// ════════════════════════════════════════════════════════════════════════════
// SummaryPeek — read-only preview with Generate access
// ════════════════════════════════════════════════════════════════════════════

interface SummaryPeekProps {
  chatId: string;
  summary: string | null;
  contextSize: number;
  onContextSizeChange: (size: number) => void;
  onEdit: () => void;
  onClose: () => void;
  isMobile: boolean;
}

/**
 * Transient popover for the chat summary. Intent: quick peek at what's
 * there, with the ability to fire a Generate without committing to a full
 * edit session. Editing happens in SummaryDialog (reached via the Edit
 * button). Because this surface does no mutation to local state, the
 * outside-click / Escape dismissal that would lose typing in an editor is
 * harmless here.
 */
export function SummaryPeek({
  chatId,
  summary,
  contextSize,
  onContextSizeChange,
  onEdit,
  onClose,
  isMobile,
}: SummaryPeekProps) {
  const text = (summary ?? "").trim();
  const [contextSizeStr, setContextSizeStr] = useState(String(contextSize || 50));
  const generateSummary = useGenerateSummary();
  const isGenerating = useIsSummaryGenerating(chatId) || generateSummary.isPending;

  const effectiveContextSize = Math.max(5, Math.min(200, parseInt(contextSizeStr, 10) || 50));

  const handleGenerate = () => {
    if (isGenerating) return;
    generateSummary.mutate({ chatId, contextSize });
  };

  return (
    <>
      {/* Header: title · context size · Generate · (mobile close) */}
      <div className="mb-2 flex items-center gap-1.5">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
          <ScrollText size="0.75rem" className="text-amber-400" />
          Chat Summary
        </h3>
        <div className="ml-auto flex items-center gap-1.5">
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
            title="How many recent messages to feed the generator"
            className="w-12 rounded-md border border-[var(--border)] bg-[var(--secondary)] px-1.5 py-0.5 text-center text-[0.625rem] text-[var(--foreground)] outline-none transition-colors [appearance:textfield] focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-1 rounded-md bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-0.5 text-[0.625rem] font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 disabled:shadow-none disabled:active:scale-100"
          >
            {isGenerating ? (
              <Loader2 size="0.625rem" className="animate-spin" />
            ) : (
              <Sparkles size="0.625rem" />
            )}
            {isGenerating ? "Generating…" : "Generate"}
          </button>
          {isMobile && (
            <button
              onClick={onClose}
              className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
            >
              <X size="0.75rem" />
            </button>
          )}
        </div>
      </div>

      {/* In-flight banner — compact, reassures the user that closing is safe. */}
      {isGenerating && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[0.625rem] text-amber-200">
          <Loader2 size="0.625rem" className="animate-spin" />
          Running in background; result will appear here.
        </div>
      )}

      {/* Body: read-only summary or empty state */}
      {text ? (
        <div className="mb-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-[var(--secondary)] px-2.5 py-2 text-xs leading-relaxed text-[var(--foreground)]/90">
          {text}
        </div>
      ) : (
        <p className="mb-2 rounded-lg bg-[var(--secondary)]/50 py-4 text-center text-xs italic text-[var(--muted-foreground)]">
          No summary yet. Generate one above or click Edit to write it.
        </p>
      )}

      {/* Footer: small Edit button. Muted on purpose — Generate is the
          visual primary action in the peek; Edit is a mode transition. */}
      <div className="flex justify-end border-t border-[var(--border)]/40 pt-2">
        <button
          onClick={onEdit}
          className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[0.625rem] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
        >
          <PenLine size="0.625rem" />
          Edit
        </button>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SummaryDialog — committed editor. Generate lives in the peek, not here.
// ════════════════════════════════════════════════════════════════════════════

interface SummaryDialogProps {
  chatId: string;
  summary: string | null;
  onClose: () => void;
}

export function SummaryDialog({ chatId, summary, onClose }: SummaryDialogProps) {
  const propsSummary = summary ?? "";
  const [draft, setDraft] = useState(propsSummary);
  const updateMeta = useUpdateChatMetadata();
  const generateSummary = useGenerateSummary();

  // Explicit save semantics. `isDirty` gates the prop-sync effect (so external
  // refetches don't clobber typing) and controls the Save button.
  const isDirty = draft !== propsSummary;

  useEffect(() => {
    if (isDirty) return;
    setDraft(propsSummary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsSummary]);

  // A generation triggered from the peek may complete while the dialog is
  // open. When it does, React Query invalidates chat detail → propsSummary
  // updates → the effect above syncs draft (because not dirty). If the user
  // IS dirty, they keep their edits and can choose to Save or Cancel to
  // pick up the new server value.
  const isGenerating = useIsSummaryGenerating(chatId) || generateSummary.isPending;

  const handleSave = () => {
    if (!isDirty || isGenerating) return;
    updateMeta.mutate(
      { id: chatId, summary: draft.trim() ? draft : null },
      {
        onSuccess: () => onClose(),
      },
    );
  };

  const handleCancel = () => {
    setDraft(propsSummary); // revert
    onClose();
  };

  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const charCount = draft.length;
  const saveDisabled = !isDirty || isGenerating || updateMeta.isPending;

  return (
    <div className="space-y-4">
      {/* Banner when a background generation is in flight. Editing is
          disabled here because the server appends on completion, which
          would overwrite anything typed in the meantime. */}
      {isGenerating && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          <Loader2 size="0.875rem" className="mt-0.5 shrink-0 animate-spin" />
          <div className="space-y-0.5">
            <p className="font-medium">Generating a new summary…</p>
            <p className="text-[0.6875rem] text-amber-200/80">
              Editing is disabled until this finishes. You can close this dialog — generation will continue in the
              background.
            </p>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="summary-text" className="text-xs font-medium text-[var(--foreground)]">
            Summary
            {isDirty && !isGenerating && (
              <span className="ml-2 text-[0.625rem] font-normal text-[var(--muted-foreground)]">· unsaved changes</span>
            )}
          </label>
          <span className="text-[0.625rem] tabular-nums text-[var(--muted-foreground)]">
            {wordCount.toLocaleString()} words · {charCount.toLocaleString()} chars
          </span>
        </div>
        <textarea
          id="summary-text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a summary of this chat."
          rows={10}
          readOnly={isGenerating}
          aria-busy={isGenerating}
          className={cn(
            "w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 text-xs leading-relaxed text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus:ring-2 focus:ring-[var(--ring)]",
            isGenerating && "cursor-not-allowed opacity-60",
          )}
        />
        <p className="text-[0.625rem] text-[var(--muted-foreground)]/70">
          Injected into every prompt at the chat-summary marker. Use Generate from the peek view to append an
          AI-written paragraph.
        </p>
      </div>

      {/* Footer — compact Cancel + gradient Save, matching the original's
          minimal aesthetic and the Summary/Lorebook/AI family. */}
      <div className="flex items-center justify-end gap-1.5 border-t border-[var(--border)]/40 pt-3">
        <button
          onClick={handleCancel}
          className="rounded-lg px-2.5 py-1 text-[0.625rem] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saveDisabled}
          className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 py-1 text-[0.625rem] font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100"
        >
          {updateMeta.isPending ? (
            <Loader2 size="0.625rem" className="animate-spin" />
          ) : (
            <Save size="0.625rem" />
          )}
          Save
        </button>
      </div>
    </div>
  );
}
