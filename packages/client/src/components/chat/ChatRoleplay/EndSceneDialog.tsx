// ──────────────────────────────────────────────
// End Scene Dialog
//
// Replaces the click-and-pray atomic /scene/conclude flow with a
// preview/accept dialog: user sees and can edit the prompts, picks a
// model, adjusts maxTokens, generates, regenerates if unsatisfied,
// only commits when happy with the summary.
//
// Two tabs:
//   Configure — connection picker, maxTokens/temperature, system prompt
//               (collapsible, default closed), scene transcript, instructions.
//   Result    — generated summary fills the space; "Generating…" while pending.
// Generate auto-switches to the Result tab so the output gets the room.
//
// Server backend: POST /api/scene/conclude/preview (compose + generate)
// and POST /api/scene/conclude/commit (side-effects only, no LLM call).
// ──────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { LOCAL_SIDECAR_CONNECTION_ID } from "@marinara-engine/shared";
import type {
  SceneConcludePreviewRequest,
  SceneConcludePreviewResponse,
  SceneConcludeCommitRequest,
  SceneConcludeCommitResponse,
} from "@marinara-engine/shared";
import { api } from "../../../lib/api-client";
import { cn } from "../../../lib/utils";
import { Modal } from "../../ui/Modal";
import { useChatStore } from "../../../stores/chat.store";
import { chatKeys } from "../../../hooks/use-chats";
import { useConnections } from "../../../hooks/use-connections";

interface EndSceneDialogProps {
  open: boolean;
  onClose: () => void;
  sceneChatId: string | null;
}

interface ConnectionRow {
  id: string;
  name: string;
  provider: string;
  model: string;
}

type Tab = "configure" | "result";

export function EndSceneDialog({ open, onClose, sceneChatId }: EndSceneDialogProps) {
  const qc = useQueryClient();
  const setActiveChatId = useChatStore((s) => s.setActiveChatId);
  const { data: connectionsRaw } = useConnections();
  const connections = (connectionsRaw as ConnectionRow[] | undefined) ?? [];

  // Form state — populated from the compose call on open.
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [sceneTranscript, setSceneTranscript] = useState<string>("");
  const [userInstructions, setUserInstructions] = useState<string>("");
  const [maxTokens, setMaxTokens] = useState<number>(8192);
  const [temperature, setTemperature] = useState<number>(0.8);
  // null = "use the default chain"; explicit string = override.
  const [connectionOverride, setConnectionOverride] = useState<string | null>(null);

  // UI state.
  const [activeTab, setActiveTab] = useState<Tab>("configure");
  const [systemPromptOpen, setSystemPromptOpen] = useState<boolean>(false);

  // Output / status state.
  const [summary, setSummary] = useState<string>("");
  const [resolvedConnectionId, setResolvedConnectionId] = useState<string>("");
  const [resolvedModel, setResolvedModel] = useState<string>("");
  const [inputTokenEstimate, setInputTokenEstimate] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track which scene we composed for, so reopens for a different scene reset.
  const composedForRef = useRef<string | null>(null);

  // On open (or scene change while open): fetch compose to populate fields.
  useEffect(() => {
    if (!open || !sceneChatId) return;
    if (composedForRef.current === sceneChatId) return;

    composedForRef.current = sceneChatId;
    setSummary("");
    setError(null);
    setActiveTab("configure");
    setSystemPromptOpen(false);
    setComposing(true);

    (async () => {
      try {
        const res = await api.post<SceneConcludePreviewResponse>("/scene/conclude/preview", {
          sceneChatId,
          compose: true,
        } satisfies SceneConcludePreviewRequest);
        setSystemPrompt(res.systemPrompt);
        setSceneTranscript(res.sceneTranscript);
        setUserInstructions(res.userInstructions);
        setMaxTokens(res.maxTokens);
        setTemperature(res.temperature);
        setResolvedConnectionId(res.connectionId);
        setResolvedModel(res.model);
        setInputTokenEstimate(res.inputTokenEstimate ?? null);
        setConnectionOverride(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load scene context");
      } finally {
        setComposing(false);
      }
    })();
  }, [open, sceneChatId]);

  // Reset our "composed for" tracker when the dialog closes.
  useEffect(() => {
    if (!open) composedForRef.current = null;
  }, [open]);

  const handleGenerate = async () => {
    if (!sceneChatId) return;
    setError(null);
    // Switch to Result tab immediately — the user wants room for the output
    // and the natural context-shift from "I'm tweaking inputs" to "let me see".
    setActiveTab("result");
    setGenerating(true);
    try {
      const res = await api.post<SceneConcludePreviewResponse>("/scene/conclude/preview", {
        sceneChatId,
        systemPrompt,
        sceneTranscript,
        userInstructions,
        maxTokens,
        temperature,
        connectionId: connectionOverride,
      } satisfies SceneConcludePreviewRequest);
      setSummary(res.summary ?? "");
      setResolvedConnectionId(res.connectionId);
      setResolvedModel(res.model);
      setInputTokenEstimate(res.inputTokenEstimate ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleAccept = async () => {
    if (!sceneChatId || !summary.trim()) return;
    setError(null);
    setCommitting(true);
    try {
      const res = await api.post<SceneConcludeCommitResponse>("/scene/conclude/commit", {
        sceneChatId,
        summary,
      } satisfies SceneConcludeCommitRequest);

      qc.invalidateQueries({ queryKey: chatKeys.all });
      qc.invalidateQueries({ queryKey: chatKeys.messages(sceneChatId) });
      qc.invalidateQueries({ queryKey: chatKeys.messages(res.originChatId) });

      setActiveChatId(res.originChatId);
      toast.success("Scene concluded — summary added as a memory", { icon: "📖" });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to commit scene summary");
    } finally {
      setCommitting(false);
    }
  };

  const busy = composing || generating || committing;

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="End Scene" width="max-w-3xl">
      {composing ? (
        <div className="flex items-center gap-2 py-8 text-xs text-[var(--muted-foreground)]">
          <Loader2 size="0.875rem" className="animate-spin" />
          Loading scene context…
        </div>
      ) : (
        <div className="flex h-[36rem] max-h-full flex-col">
          {/* Tabs */}
          <div className="flex shrink-0 border-b border-[var(--border)]/40">
            <TabButton active={activeTab === "configure"} onClick={() => setActiveTab("configure")}>
              Configure
            </TabButton>
            <TabButton active={activeTab === "result"} onClick={() => setActiveTab("result")}>
              Result
              {generating && <Loader2 size="0.625rem" className="ml-1.5 animate-spin" />}
              {!generating && summary && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              )}
            </TabButton>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          )}

          {/* ── Configure tab ── */}
          {activeTab === "configure" && (
            <div className="mt-4 flex flex-1 flex-col gap-4">
              {/* Connection / maxTokens / temperature row */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[0.625rem] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                    Connection
                  </span>
                  <select
                    value={connectionOverride ?? ""}
                    onChange={(e) => setConnectionOverride(e.target.value || null)}
                    disabled={busy}
                    className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2 py-1 text-xs text-[var(--foreground)] outline-none transition-colors focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
                  >
                    <option value="">Default (agent chain → {resolvedConnectionId || "?"})</option>
                    <option value={LOCAL_SIDECAR_CONNECTION_ID}>Local Model (sidecar)</option>
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.provider}:{c.model}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[0.625rem] text-[var(--muted-foreground)]/70">
                    Resolved: {resolvedConnectionId || "—"} ({resolvedModel || "?"})
                  </span>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[0.625rem] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Max output tokens
                    </span>
                    <input
                      type="number"
                      min={64}
                      max={32768}
                      step={64}
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(Math.max(64, parseInt(e.target.value, 10) || 64))}
                      disabled={busy}
                      className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2 py-1 text-xs text-[var(--foreground)] outline-none transition-colors focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
                    />
                    <span className="mt-1 block text-[0.625rem] text-[var(--muted-foreground)]/70">
                      Safety net only.
                    </span>
                  </label>

                  <label className="block">
                    <span className="text-[0.625rem] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Temperature
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={0.05}
                      value={temperature}
                      onChange={(e) => setTemperature(Math.max(0, Math.min(2, parseFloat(e.target.value) || 0)))}
                      disabled={busy}
                      className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2 py-1 text-xs text-[var(--foreground)] outline-none transition-colors focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
                    />
                    {inputTokenEstimate !== null && (
                      <span className="mt-1 block text-[0.625rem] text-[var(--muted-foreground)]/70">
                        Input ~{inputTokenEstimate.toLocaleString()} toks
                      </span>
                    )}
                  </label>
                </div>
              </div>

              {/* System prompt — collapsible */}
              <div>
                <button
                  type="button"
                  onClick={() => setSystemPromptOpen((prev) => !prev)}
                  disabled={busy}
                  className="flex items-center gap-1 text-[0.625rem] font-medium uppercase tracking-wide text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] disabled:cursor-not-allowed"
                >
                  {systemPromptOpen ? <ChevronDown size="0.75rem" /> : <ChevronRight size="0.75rem" />}
                  System prompt
                  {!systemPromptOpen && (
                    <span className="ml-1 normal-case text-[var(--muted-foreground)]/60">(click to edit)</span>
                  )}
                </button>
                {systemPromptOpen && (
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    disabled={busy}
                    rows={6}
                    className="mt-1.5 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2.5 py-2 font-mono text-[0.6875rem] leading-relaxed text-[var(--foreground)] outline-none transition-colors focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
                  />
                )}
              </div>

              {/* Scene transcript */}
              <label className="block">
                <span className="text-[0.625rem] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  Scene transcript
                </span>
                <textarea
                  value={sceneTranscript}
                  onChange={(e) => setSceneTranscript(e.target.value)}
                  disabled={busy}
                  rows={7}
                  className="mt-1 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2.5 py-2 font-mono text-[0.6875rem] leading-relaxed text-[var(--foreground)] outline-none transition-colors focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
                />
              </label>

              {/* Instructions */}
              <label className="block">
                <span className="text-[0.625rem] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  Instructions
                </span>
                <textarea
                  value={userInstructions}
                  onChange={(e) => setUserInstructions(e.target.value)}
                  disabled={busy}
                  rows={6}
                  className="mt-1 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2.5 py-2 font-mono text-[0.6875rem] leading-relaxed text-[var(--foreground)] outline-none transition-colors focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
                />
              </label>

              {/* Footer */}
              <div className="mt-auto flex items-center justify-end gap-1.5 border-t border-[var(--border)]/40 pt-3">
                <button
                  onClick={onClose}
                  disabled={busy}
                  className="rounded-lg px-3 py-1 text-[0.625rem] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1 text-[0.625rem] font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 disabled:shadow-none disabled:active:scale-100"
                >
                  {generating ? (
                    <Loader2 size="0.625rem" className="animate-spin" />
                  ) : summary ? (
                    <RefreshCw size="0.625rem" />
                  ) : (
                    <Sparkles size="0.625rem" />
                  )}
                  {generating ? "Generating…" : summary ? "Regenerate" : "Generate"}
                </button>
              </div>
            </div>
          )}

          {/* ── Result tab ── */}
          {activeTab === "result" && (
            <div className="mt-4 flex flex-1 flex-col gap-3">
              <div className="flex flex-1 flex-col rounded-lg bg-[var(--secondary)] p-4">
                {generating ? (
                  <div className="m-auto flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                    <Loader2 size="0.875rem" className="animate-spin" />
                    Generating summary…
                  </div>
                ) : summary ? (
                  <>
                    <div className="flex-1 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-[var(--foreground)]">
                      {summary}
                    </div>
                    <div className="mt-2 shrink-0 border-t border-[var(--border)]/30 pt-2 text-[0.625rem] text-[var(--muted-foreground)]/70">
                      {summary.split(/\s+/).filter(Boolean).length} words ·{" "}
                      {resolvedConnectionId} ({resolvedModel}) · edit further on the chat once accepted
                    </div>
                  </>
                ) : (
                  <div className="m-auto text-center text-xs text-[var(--muted-foreground)]">
                    No summary yet.
                    <br />
                    Switch to <strong className="text-[var(--foreground)]">Configure</strong> and click Generate.
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-1.5 border-t border-[var(--border)]/40 pt-3">
                <button
                  onClick={onClose}
                  disabled={busy}
                  className="rounded-lg px-3 py-1 text-[0.625rem] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setActiveTab("configure")}
                  disabled={busy}
                  className="rounded-lg px-3 py-1 text-[0.625rem] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-50"
                >
                  ← Back to Configure
                </button>
                <button
                  onClick={handleAccept}
                  disabled={busy || !summary.trim()}
                  className={cn(
                    "flex items-center gap-1 rounded-lg bg-gradient-to-r from-emerald-400 to-teal-500 px-3 py-1 text-[0.625rem] font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98]",
                    "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100",
                  )}
                >
                  {committing ? <Loader2 size="0.625rem" className="animate-spin" /> : <Save size="0.625rem" />}
                  Accept &amp; End Scene
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center px-4 py-2 text-xs font-medium transition-colors",
        active
          ? "border-b-2 border-amber-400 text-[var(--foreground)]"
          : "border-b-2 border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
      )}
    >
      {children}
    </button>
  );
}
