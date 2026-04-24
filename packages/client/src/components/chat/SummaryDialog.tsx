// ──────────────────────────────────────────────
// Summary Dialog — view/edit/generate the rolling chat summary
// Rendered inside a shared Modal (see SummaryButton in ChatRoleplaySurface).
// ──────────────────────────────────────────────
import { useEffect, useState } from "react";
import { Loader2, Save, Sparkles } from "lucide-react";
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

  // Explicit save semantics. `isDirty` is the single source of truth for
  // "user has pending edits" — it gates the prop-sync effect (so an external
  // refetch doesn't clobber typing) and controls the Save button's disabled
  // state. Closing via X / backdrop / Escape / Cancel discards edits.
  const isDirty = draft !== propsSummary;

  // Sync draft from props only when NOT dirty — lets external edits (other
  // tab, chat-summary agent) land on first view, while respecting pending
  // user edits. To discard local edits and accept the server value, use
  // the Cancel button.
  useEffect(() => {
    if (isDirty) return;
    setDraft(propsSummary);
    // isDirty intentionally omitted — we only want to react to prop changes,
    // and its value is read imperatively via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsSummary]);

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
          // already persisted it (append semantics), so no client-side save
          // is needed — the next prop sync will match and clear isDirty.
          setDraft(data.summary);
        },
      },
    );
  };

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
    // Revert any pending edits before closing. Prevents the "did my draft
    // just get lost?" surprise — explicit intent.
    setDraft(propsSummary);
    onClose();
  };

  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const charCount = draft.length;
  const effectiveContextSize = Math.max(5, Math.min(200, parseInt(contextSizeStr, 10) || 50));
  const saveDisabled = !isDirty || isGenerating || updateMeta.isPending;

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
          Injected into every prompt at the chat-summary marker.
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
          Appends a new paragraph covering the last {effectiveContextSize} messages to the summary above. Saves
          immediately.
        </p>
      </div>

      {/* Footer actions — compact Cancel + gradient Save, matching the
          minimal aesthetic of the original SummaryPopover and the Lorebook
          family of edit surfaces. Save is deliberately small and gradient-
          branded rather than using --primary, to stay consistent with the
          amber Generate button above and the app-wide convention for
          "summary / lorebook / AI content" action buttons. */}
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
