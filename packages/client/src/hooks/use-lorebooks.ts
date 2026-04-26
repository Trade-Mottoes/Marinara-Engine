// ──────────────────────────────────────────────
// React Query: Lorebook hooks
// ──────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api-client";
import type { Lorebook, LorebookEntry } from "@marinara-engine/shared";

export const lorebookKeys = {
  all: ["lorebooks"] as const,
  list: () => [...lorebookKeys.all, "list"] as const,
  byCategory: (cat: string) => [...lorebookKeys.all, "category", cat] as const,
  detail: (id: string) => [...lorebookKeys.all, "detail", id] as const,
  entries: (lorebookId: string) => [...lorebookKeys.all, "entries", lorebookId] as const,
  entry: (entryId: string) => [...lorebookKeys.all, "entry", entryId] as const,
  search: (q: string) => [...lorebookKeys.all, "search", q] as const,
};

// ── Lorebooks ──

export function useLorebooks(category?: string) {
  return useQuery({
    queryKey: category ? lorebookKeys.byCategory(category) : lorebookKeys.list(),
    queryFn: () => api.get<Lorebook[]>(category ? `/lorebooks?category=${category}` : "/lorebooks"),
    staleTime: 5 * 60_000,
  });
}

export function useLorebook(id: string | null) {
  return useQuery({
    queryKey: lorebookKeys.detail(id ?? ""),
    queryFn: () => api.get<Lorebook>(`/lorebooks/${id}`),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export function useCreateLorebook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post<Lorebook>("/lorebooks", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lorebookKeys.all });
    },
  });
}

export function useUpdateLorebook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      api.patch<Lorebook>(`/lorebooks/${id}`, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: lorebookKeys.list() });
      qc.invalidateQueries({ queryKey: lorebookKeys.detail(variables.id) });
      qc.invalidateQueries({ queryKey: [...lorebookKeys.all, "active"] });
    },
  });
}

export function useDeleteLorebook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/lorebooks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lorebookKeys.all });
    },
  });
}

// ── Entries ──

export function useLorebookEntries(lorebookId: string | null) {
  return useQuery({
    queryKey: lorebookKeys.entries(lorebookId ?? ""),
    queryFn: () => api.get<LorebookEntry[]>(`/lorebooks/${lorebookId}/entries`),
    enabled: !!lorebookId,
  });
}

export function useLorebookEntry(lorebookId: string | null, entryId: string | null) {
  return useQuery({
    queryKey: lorebookKeys.entry(entryId ?? ""),
    queryFn: () => api.get<LorebookEntry>(`/lorebooks/${lorebookId}/entries/${entryId}`),
    enabled: !!lorebookId && !!entryId,
  });
}

export function useCreateLorebookEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lorebookId, ...data }: { lorebookId: string } & Record<string, unknown>) =>
      api.post<LorebookEntry>(`/lorebooks/${lorebookId}/entries`, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: lorebookKeys.entries(variables.lorebookId) });
      qc.invalidateQueries({ queryKey: [...lorebookKeys.all, "active"] });
    },
  });
}

export function useUpdateLorebookEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lorebookId, entryId, ...data }: { lorebookId: string; entryId: string } & Record<string, unknown>) =>
      api.patch<LorebookEntry>(`/lorebooks/${lorebookId}/entries/${entryId}`, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: lorebookKeys.entries(variables.lorebookId) });
      qc.invalidateQueries({ queryKey: lorebookKeys.entry(variables.entryId) });
      qc.invalidateQueries({ queryKey: [...lorebookKeys.all, "active"] });
    },
  });
}

export function useDeleteLorebookEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lorebookId, entryId }: { lorebookId: string; entryId: string }) =>
      api.delete(`/lorebooks/${lorebookId}/entries/${entryId}`),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: lorebookKeys.entries(variables.lorebookId) });
      qc.invalidateQueries({ queryKey: [...lorebookKeys.all, "active"] });
    },
  });
}

export function useBulkCreateEntries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lorebookId, entries }: { lorebookId: string; entries: unknown[] }) =>
      api.post<LorebookEntry[]>(`/lorebooks/${lorebookId}/entries/bulk`, { entries }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: lorebookKeys.entries(variables.lorebookId) });
      qc.invalidateQueries({ queryKey: [...lorebookKeys.all, "active"] });
    },
  });
}

export function useSearchLorebookEntries(query: string) {
  return useQuery({
    queryKey: lorebookKeys.search(query),
    queryFn: () => api.get<LorebookEntry[]>(`/lorebooks/search/entries?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
  });
}

export interface ActiveLorebookEntry {
  id: string;
  name: string;
  content: string;
  keys: string[];
  lorebookId: string;
  order: number;
  constant: boolean;
  /**
   * The user's per-chat enable choice. False only when explicitly disabled
   * via the eye toggle. Independent of whether the scanner currently matches.
   */
  userEnabled: boolean;
  /**
   * The user's per-chat pin choice. Pinned entries are forced into the
   * scanner's activated set as if they had `constant: true`, so they reach
   * the prompt even when no keyword matches. Disable still wins.
   */
  userPinned: boolean;
  /**
   * Whether the scanner promoted this entry into its activated set,
   * independent of the user's disable flag. True for CONST, pinned (via
   * server-side constant promotion), and keyword/semantic matches. Drives
   * the dot colour (along with userEnabled).
   */
  scannerActivated: boolean;
  /**
   * Whether any of this entry's keys appear as a substring in the chat
   * text (or current draft). Computed INDEPENDENTLY of CONST/pinned, so
   * the M pill can light up alongside C or P. Substring-only — doesn't
   * honour each entry's match-options or secondary-keys logic; that's a
   * UI hint, not a generation signal.
   */
  keywordMatched: boolean;
  /**
   * Whether this entry will actually be in the next generated prompt:
   * `userEnabled && scannerActivated`. The dot colour reflects this
   * directly. An entry can be on the panel list (because of an override)
   * without injecting (e.g. disabled, or pinned-then-disabled).
   */
  isInjecting: boolean;
  /** Estimated token count for this entry's content (chars/4 heuristic). */
  tokens: number;
}

export interface ActiveLorebookScan {
  entries: ActiveLorebookEntry[];
  totalTokens: number;
  totalEntries: number;
}

export function useActiveLorebookEntries(chatId: string | null, enabled = false, prepend = "") {
  // The scan endpoint accepts an optional `?prepend=` query param to scan
  // against a hypothetical user message (the typed-but-unsent draft). When
  // a prepend is supplied to this hook, every fetch — initial mount, manual
  // invalidation after toggle, the staleness-based auto-refresh — uses it.
  // Callers that want a plain history-only scan pass an empty string.
  return useQuery({
    queryKey: [...lorebookKeys.all, "active", chatId, prepend] as const,
    queryFn: () => {
      const url = prepend
        ? `/lorebooks/scan/${chatId}?prepend=${encodeURIComponent(prepend)}`
        : `/lorebooks/scan/${chatId}`;
      return api.get<ActiveLorebookScan>(url);
    },
    enabled: !!chatId && enabled,
    staleTime: 30_000,
  });
}
