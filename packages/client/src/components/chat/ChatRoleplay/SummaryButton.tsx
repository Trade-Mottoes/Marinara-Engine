import { createPortal } from "react-dom";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Loader2, ScrollText } from "lucide-react";
import { cn } from "../../../lib/utils";
import { Modal } from "../../ui/Modal";
import { useUIStore } from "../../../stores/ui.store";
import { useIsSummaryGenerating } from "../../../hooks/use-chats";

const SummaryDialog = lazy(async () => {
  const module = await import("./SummaryDialog");
  return { default: module.SummaryDialog };
});

const SummaryPeek = lazy(async () => {
  const module = await import("./SummaryDialog");
  return { default: module.SummaryPeek };
});

/**
 * Three-state Chat Summary affordance, mirroring AuthorNotesButton:
 * closed → peek (read-only popover, Generate access) → edit (Modal dialog).
 * Peek is transient; Generate is safe from it because it fires against
 * server state. Edit is a committed session with Save/Cancel.
 */
export function SummaryButton({
  chatId,
  summary,
  summaryContextSize,
  onContextSizeChange,
}: {
  chatId: string | null;
  summary: string | null;
  summaryContextSize: number;
  onContextSizeChange: (size: number) => void;
}) {
  const [view, setView] = useState<"closed" | "peek" | "edit">("closed");
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const compact = useUIStore((s) => s.centerCompact);
  const isGenerating = useIsSummaryGenerating(chatId);

  // Outside-click closes the peek (uses `click`, matches AuthorNotesButton).
  useEffect(() => {
    if (view !== "peek" || isMobile) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setView("closed");
    };
    document.addEventListener("click", handle);
    return () => document.removeEventListener("click", handle);
  }, [view, isMobile]);

  // Escape closes the peek. Modal owns Escape for the edit state.
  useEffect(() => {
    if (view !== "peek") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setView("closed");
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [view]);

  if (!chatId) return null;

  const isOpen = view !== "closed";
  const peekOpen = view === "peek";
  const editOpen = view === "edit";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setView((v) => (v === "closed" ? "peek" : "closed"))}
        className={cn(
          "relative flex items-center justify-center rounded-full border backdrop-blur-md transition-all",
          compact ? "p-1" : "p-1.5",
          isOpen
            ? "bg-foreground/15 border-foreground/20 text-foreground/90"
            : summary
              ? "bg-foreground/10 border-foreground/25 text-foreground/80 hover:bg-foreground/15 hover:text-foreground"
              : "bg-foreground/5 border-foreground/10 text-foreground/60 hover:bg-foreground/10 hover:text-foreground",
          isGenerating && "ring-2 ring-amber-400/60",
        )}
        title={isGenerating ? "Chat Summary (generating…)" : "Chat Summary"}
        aria-busy={isGenerating}
      >
        <ScrollText size="0.875rem" />
        {isGenerating && (
          <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
          </span>
        )}
      </button>

      {/* Peek — read-only popover with Generate access. Transient by design. */}
      {peekOpen &&
        (isMobile ? (
          createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4 max-md:pt-[max(1rem,env(safe-area-inset-top))]"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div className="absolute inset-0 bg-black/30" onClick={() => setView("closed")} />
              <div
                className="relative max-h-[calc(100dvh-4rem)] w-full max-w-sm overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xl shadow-black/40 animate-message-in"
                onClick={(e) => e.stopPropagation()}
              >
                <Suspense
                  fallback={
                    <div className="flex items-center gap-2 py-4 text-xs text-[var(--muted-foreground)]">
                      <Loader2 size="0.75rem" className="animate-spin" />
                      Loading summary…
                    </div>
                  }
                >
                  <SummaryPeek
                    chatId={chatId}
                    summary={summary}
                    contextSize={summaryContextSize}
                    onContextSizeChange={onContextSizeChange}
                    onEdit={() => setView("edit")}
                    onClose={() => setView("closed")}
                    isMobile={isMobile}
                  />
                </Suspense>
              </div>
            </div>,
            document.body,
          )
        ) : (
          <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xl shadow-black/40 animate-message-in">
            <Suspense
              fallback={
                <div className="flex items-center gap-2 py-4 text-xs text-[var(--muted-foreground)]">
                  <Loader2 size="0.75rem" className="animate-spin" />
                  Loading summary…
                </div>
              }
            >
              <SummaryPeek
                chatId={chatId}
                summary={summary}
                contextSize={summaryContextSize}
                onContextSizeChange={onContextSizeChange}
                onEdit={() => setView("edit")}
                onClose={() => setView("closed")}
                isMobile={isMobile}
              />
            </Suspense>
          </div>
        ))}

      {/* Edit — committed editing session in the shared Modal. */}
      <Modal open={editOpen} onClose={() => setView("closed")} title="Chat Summary" width="max-w-lg">
        <Suspense
          fallback={
            <div className="flex items-center gap-2 py-4 text-xs text-[var(--muted-foreground)]">
              <Loader2 size="0.75rem" className="animate-spin" />
              Loading summary…
            </div>
          }
        >
          <SummaryDialog chatId={chatId} summary={summary} onClose={() => setView("closed")} />
        </Suspense>
      </Modal>
    </div>
  );
}
