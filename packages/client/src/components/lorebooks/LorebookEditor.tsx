// ──────────────────────────────────────────────
// Lorebook Editor — Full-page detail view
// Replaces the chat area when editing a lorebook.
// Tabs: Overview, Entries, Entry Editor
// ──────────────────────────────────────────────
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import {
  useLorebook,
  useUpdateLorebook,
  useLorebookEntries,
  useCreateLorebookEntry,
  useUpdateLorebookEntry,
  useDeleteLorebookEntry,
  useDeleteLorebook,
} from "../../hooks/use-lorebooks";
import { useCharacters } from "../../hooks/use-characters";
import { useConnections } from "../../hooks/use-connections";
import { showConfirmDialog } from "../../lib/app-dialogs";
import { useUIStore } from "../../stores/ui.store";
import {
  ArrowLeft,
  Save,
  BookOpen,
  FileText,
  Plus,
  Trash2,
  Search,
  Settings2,
  Key,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  ChevronRight,
  Globe,
  Users,
  UserRound,
  X,
  ArrowUpDown,
  Hash,
  Sparkles,
  Loader2,
  Check,
  Lock,
  Tag,
  Wand2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { HelpTooltip } from "../ui/HelpTooltip";
import { api } from "../../lib/api-client";
import type { Lorebook, LorebookEntry, LorebookCategory } from "@marinara-engine/shared";
import { LorebookEntryEditor } from "./LorebookEntryEditor";

// ── Types ──
const TABS = [
  { id: "overview", label: "Overview", icon: Settings2 },
  { id: "entries", label: "Entries", icon: FileText },
] as const;
type TabId = (typeof TABS)[number]["id"];

const CATEGORY_OPTIONS: Array<{ value: LorebookCategory; label: string; icon: typeof Globe }> = [
  { value: "world", label: "World", icon: Globe },
  { value: "character", label: "Character", icon: Users },
  { value: "npc", label: "NPC", icon: UserRound },
  { value: "spellbook", label: "Spellbook", icon: Wand2 },
  { value: "uncategorized", label: "Uncategorized", icon: BookOpen },
];

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

type EntrySortKey = "order" | "name-asc" | "name-desc" | "tokens" | "keys" | "newest" | "oldest";

const SORT_OPTIONS: Array<{ value: EntrySortKey; label: string }> = [
  { value: "order", label: "Order" },
  { value: "name-asc", label: "Name A→Z" },
  { value: "name-desc", label: "Name Z→A" },
  { value: "tokens", label: "Tokens ↓" },
  { value: "keys", label: "Keys ↓" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

export function LorebookEditor() {
  const lorebookId = useUIStore((s) => s.lorebookDetailId);
  const closeDetail = useUIStore((s) => s.closeLorebookDetail);
  const { data: rawLorebook, isLoading } = useLorebook(lorebookId);
  const { data: rawEntries } = useLorebookEntries(lorebookId);
  const { data: rawCharacters } = useCharacters();
  const updateLorebook = useUpdateLorebook();
  const deleteLorebook = useDeleteLorebook();
  const createEntry = useCreateLorebookEntry();
  const updateEntry = useUpdateLorebookEntry();
  const deleteEntry = useDeleteLorebookEntry();

  const lorebook = rawLorebook as Lorebook | undefined;
  const entries = useMemo(() => (rawEntries ?? []) as LorebookEntry[], [rawEntries]);
  const characters = useMemo(() => {
    if (!rawCharacters) return [] as Array<{ id: string; name: string }>;
    return (rawCharacters as Array<{ id: string; data: string | Record<string, unknown> }>).map((c) => {
      try {
        const parsed = typeof c.data === "string" ? JSON.parse(c.data) : c.data;
        return { id: c.id, name: parsed?.name ?? "Unknown" };
      } catch {
        return { id: c.id, name: "Unknown" };
      }
    });
  }, [rawCharacters]);

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [lorebookDirty, setLorebookDirty] = useState(false);
  const [entryDirty, setEntryDirty] = useState(false);
  const setEditorDirty = useUIStore((s) => s.setEditorDirty);
  useEffect(() => {
    setEditorDirty(lorebookDirty || entryDirty);
  }, [lorebookDirty, entryDirty, setEditorDirty]);
  const [saving, setSaving] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [entrySearch, setEntrySearch] = useState("");
  const [entrySort, setEntrySort] = useState<EntrySortKey>("order");

  // ── Form state for lorebook overview ──
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState<LorebookCategory>("uncategorized");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formScanDepth, setFormScanDepth] = useState(2);
  const [formTokenBudget, setFormTokenBudget] = useState(2048);
  const [formRecursive, setFormRecursive] = useState(false);
  const [formMaxRecursionDepth, setFormMaxRecursionDepth] = useState(3);
  const [formCharacterId, setFormCharacterId] = useState<string | null>(null);
  const [formTags, setFormTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  // ── Form state for entry editor ──
  const [entryForm, setEntryForm] = useState<Partial<LorebookEntry> | null>(null);
  const loadedLorebookIdRef = useRef<string | null>(null);
  const loadedEntryIdRef = useRef<string | null>(null);

  // Load lorebook data into form
  useEffect(() => {
    if (!lorebook) return;
    const hasSwitchedLorebooks = loadedLorebookIdRef.current !== lorebook.id;
    if (!hasSwitchedLorebooks && lorebookDirty) return;

    setFormName(lorebook.name);
    setFormDescription(lorebook.description);
    setFormCategory(lorebook.category);
    setFormEnabled(lorebook.enabled);
    setFormScanDepth(lorebook.scanDepth);
    setFormTokenBudget(lorebook.tokenBudget);
    setFormRecursive(lorebook.recursiveScanning);
    setFormMaxRecursionDepth(lorebook.maxRecursionDepth ?? 3);
    setFormCharacterId(lorebook.characterId ?? null);
    setFormTags(lorebook.tags ?? []);
    setLorebookDirty(false);
    loadedLorebookIdRef.current = lorebook.id;
  }, [lorebook, lorebookDirty]);

  // Load entry data into form
  useEffect(() => {
    if (!editingEntryId) {
      setEntryForm(null);
      setEntryDirty(false);
      loadedEntryIdRef.current = null;
      return;
    }
    const entry = entries.find((e) => e.id === editingEntryId);
    if (!entry) return;

    const hasSwitchedEntries = loadedEntryIdRef.current !== editingEntryId;
    if (!hasSwitchedEntries && entryDirty) return;

    setEntryForm({ ...entry });
    setEntryDirty(false);
    loadedEntryIdRef.current = editingEntryId;
  }, [editingEntryId, entries, entryDirty]);

  // Filtered + sorted entries
  const filteredEntries = useMemo(() => {
    let result = entries;
    if (entrySearch) {
      const q = entrySearch.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.keys.some((k) => k.toLowerCase().includes(q)) ||
          e.content.toLowerCase().includes(q),
      );
    }
    switch (entrySort) {
      case "name-asc":
        return [...result].sort((a, b) => a.name.localeCompare(b.name));
      case "name-desc":
        return [...result].sort((a, b) => b.name.localeCompare(a.name));
      case "tokens":
        return [...result].sort((a, b) => estimateTokens(b.content) - estimateTokens(a.content));
      case "keys":
        return [...result].sort((a, b) => b.keys.length - a.keys.length);
      case "newest":
        return [...result].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      case "oldest":
        return [...result].sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""));
      case "order":
      default:
        return [...result].sort((a, b) => a.order - b.order);
    }
  }, [entries, entrySearch, entrySort]);

  // ── Handlers ──
  const markLorebookDirty = useCallback(() => setLorebookDirty(true), []);
  const updateEntryForm = useCallback((patch: Partial<LorebookEntry>) => {
    setEntryDirty(true);
    setEntryForm((current) => (current ? { ...current, ...patch } : current));
  }, []);

  // Preserve main scroll position across entry editor sub-view so returning
  // from an entry doesn't reset a long entry list (e.g. 250 entries on mobile).
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const savedScrollTopRef = useRef(0);
  const openEntry = useCallback((entryId: string) => {
    savedScrollTopRef.current = mainScrollRef.current?.scrollTop ?? 0;
    setEditingEntryId(entryId);
  }, []);
  useLayoutEffect(() => {
    if (editingEntryId || !mainScrollRef.current) return;
    mainScrollRef.current.scrollTop = savedScrollTopRef.current;
  }, [editingEntryId, activeTab]);

  const handleSaveLorebook = useCallback(async () => {
    if (!lorebookId) return;
    setSaving(true);
    try {
      await updateLorebook.mutateAsync({
        id: lorebookId,
        name: formName,
        description: formDescription,
        category: formCategory,
        enabled: formEnabled,
        scanDepth: formScanDepth,
        tokenBudget: formTokenBudget,
        recursiveScanning: formRecursive,
        maxRecursionDepth: formMaxRecursionDepth,
        characterId: formCharacterId,
        tags: formTags,
      });
      setLorebookDirty(false);
    } finally {
      setSaving(false);
    }
  }, [
    lorebookId,
    formName,
    formDescription,
    formCategory,
    formEnabled,
    formScanDepth,
    formTokenBudget,
    formRecursive,
    formMaxRecursionDepth,
    formCharacterId,
    formTags,
    updateLorebook,
  ]);

  const handleSaveEntry = useCallback(async () => {
    if (!lorebookId || !editingEntryId || !entryForm) return;
    setSaving(true);
    try {
      await updateEntry.mutateAsync({
        lorebookId,
        entryId: editingEntryId,
        name: entryForm.name,
        content: entryForm.content,
        keys: entryForm.keys,
        secondaryKeys: entryForm.secondaryKeys,
        enabled: entryForm.enabled,
        constant: entryForm.constant,
        selective: entryForm.selective,
        selectiveLogic: entryForm.selectiveLogic,
        matchWholeWords: entryForm.matchWholeWords,
        caseSensitive: entryForm.caseSensitive,
        useRegex: entryForm.useRegex,
        position: entryForm.position,
        depth: entryForm.depth,
        order: entryForm.order,
        role: entryForm.role,
        sticky: entryForm.sticky,
        cooldown: entryForm.cooldown,
        delay: entryForm.delay,
        ephemeral: entryForm.ephemeral,
        group: entryForm.group,
        tag: entryForm.tag,
        locked: entryForm.locked,
        preventRecursion: entryForm.preventRecursion,
      });
      setEntryDirty(false);
    } finally {
      setSaving(false);
    }
  }, [lorebookId, editingEntryId, entryForm, updateEntry]);

  const handleAddEntry = useCallback(async () => {
    if (!lorebookId) return;
    const result = await createEntry.mutateAsync({
      lorebookId,
      name: "New Entry",
      content: "",
      keys: [],
    });
    if (result && typeof result === "object" && "id" in result) {
      setEditingEntryId((result as LorebookEntry).id);
    }
  }, [lorebookId, createEntry]);

  const handleDeleteEntry = useCallback(
    async (entryId: string) => {
      if (!lorebookId) return;
      if (
        !(await showConfirmDialog({
          title: "Delete Entry",
          message: "Delete this lorebook entry?",
          confirmLabel: "Delete",
          tone: "destructive",
        }))
      ) {
        return;
      }
      if (editingEntryId === entryId) setEditingEntryId(null);
      await deleteEntry.mutateAsync({ lorebookId, entryId });
    },
    [lorebookId, editingEntryId, deleteEntry],
  );

  const handleExitEntry = useCallback(async () => {
    if (
      entryDirty &&
      !(await showConfirmDialog({
        title: "Unsaved Changes",
        message: "You have unsaved changes. Discard them and leave this entry?",
        confirmLabel: "Discard",
        tone: "destructive",
      }))
    ) {
      return;
    }
    setEntryDirty(false);
    setEditingEntryId(null);
  }, [entryDirty]);

  const handleClose = useCallback(() => {
    if (lorebookDirty) {
      setShowUnsavedWarning(true);
    } else {
      closeDetail();
    }
  }, [lorebookDirty, closeDetail]);

  const handleDelete = useCallback(async () => {
    if (!lorebookId) return;
    if (
      !(await showConfirmDialog({
        title: "Delete Lorebook",
        message: "Delete this lorebook? All entries will be lost.",
        confirmLabel: "Delete",
        tone: "destructive",
      }))
    ) {
      return;
    }
    await deleteLorebook.mutateAsync(lorebookId);
    closeDetail();
  }, [lorebookId, deleteLorebook, closeDetail]);

  // ── Loading ──
  if (isLoading || !lorebook) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="shimmer h-8 w-48 rounded-xl" />
      </div>
    );
  }

  // ── Entry editor sub-view ──
  if (editingEntryId && entryForm) {
    return (
      <LorebookEntryEditor
        entryForm={entryForm}
        onChange={updateEntryForm}
        onSave={handleSaveEntry}
        saving={saving}
        onExit={handleExitEntry}
      />
    );
  }


  // ── Main editor ──
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Unsaved warning banner */}
      {showUnsavedWarning && (
        <div className="flex items-center gap-3 bg-amber-500/10 px-4 py-2.5 text-xs">
          <AlertTriangle size="0.875rem" className="text-amber-400" />
          <span className="flex-1 text-amber-200">You have unsaved changes</span>
          <button
            onClick={() => setShowUnsavedWarning(false)}
            className="rounded-lg px-3 py-1 text-[0.6875rem] font-medium text-amber-300 ring-1 ring-amber-400/30 transition-colors hover:bg-amber-400/10"
          >
            Keep editing
          </button>
          <button
            onClick={() => {
              setShowUnsavedWarning(false);
              setLorebookDirty(false);
              closeDetail();
            }}
            className="rounded-lg px-3 py-1 text-[0.6875rem] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)]"
          >
            Discard & close
          </button>
          <button
            onClick={async () => {
              await handleSaveLorebook();
              setShowUnsavedWarning(false);
              closeDetail();
            }}
            className="rounded-lg bg-amber-500 px-3 py-1 text-[0.6875rem] font-medium text-white transition-colors hover:bg-amber-600"
          >
            Save & close
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <button onClick={handleClose} className="rounded-lg p-1.5 transition-colors hover:bg-[var(--accent)]">
          <ArrowLeft size="1rem" />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
          <BookOpen size="1.125rem" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{lorebook.name}</h2>
          <p className="truncate text-[0.6875rem] text-[var(--muted-foreground)]">
            {entries.length} entries • {lorebook.category}
          </p>
        </div>
        <button
          onClick={handleSaveLorebook}
          disabled={!lorebookDirty || saving}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2 text-xs font-medium text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50"
        >
          <Save size="0.8125rem" />
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => api.download(`/lorebooks/${lorebookId}/export`)}
          className="rounded-lg p-2 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
          title="Export lorebook"
        >
          <svg width="0.875rem" height="0.875rem" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M10 13V3m0 0l-4 4m4-4l4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="3" y="15" width="14" height="2" rx="1" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={handleDelete}
          className="rounded-lg p-2 text-[var(--destructive)] transition-colors hover:bg-[var(--destructive)]/15"
          title="Delete lorebook"
        >
          <Trash2 size="0.875rem" />
        </button>
      </div>

      {/* Body: Side-tabs + Content */}
      <div className="flex flex-1 overflow-hidden @max-5xl:flex-col">
        {/* Tab Rail */}
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[var(--border)] bg-[var(--card)] p-2 @max-5xl:w-full @max-5xl:flex-row @max-5xl:overflow-x-auto @max-5xl:border-r-0 @max-5xl:border-b @max-5xl:p-1.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all text-left @max-5xl:whitespace-nowrap @max-5xl:px-2.5 @max-5xl:py-1.5",
                  activeTab === tab.id
                    ? "bg-gradient-to-r from-amber-400/15 to-orange-500/15 text-amber-400 ring-1 ring-amber-400/20"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]",
                )}
              >
                <Icon size="0.875rem" />
                {tab.label}
                {tab.id === "entries" && (
                  <span className="ml-auto rounded-full bg-[var(--secondary)] px-1.5 py-0.5 text-[0.625rem] @max-5xl:ml-1">
                    {entries.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Tab Content */}
        <div ref={mainScrollRef} className="flex-1 overflow-y-auto p-6 @max-5xl:p-4">
          <div className="mx-auto max-w-3xl">
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Name */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Name</label>
                  <input
                    value={formName}
                    onChange={(e) => {
                      setFormName(e.target.value);
                      markLorebookDirty();
                    }}
                    className="w-full rounded-xl bg-[var(--secondary)] px-3 py-2.5 text-sm ring-1 ring-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Description</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => {
                      setFormDescription(e.target.value);
                      markLorebookDirty();
                    }}
                    rows={3}
                    className="w-full resize-y rounded-xl bg-[var(--secondary)] px-3 py-2.5 text-sm ring-1 ring-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                </div>

                {/* Tags */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-medium">
                    <Tag size="0.75rem" /> Tags
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {formTags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 rounded-lg bg-amber-400/15 px-2 py-1 text-[0.6875rem] font-medium text-amber-400"
                      >
                        {tag}
                        <button
                          onClick={() => {
                            setFormTags(formTags.filter((t) => t !== tag));
                            markLorebookDirty();
                          }}
                          className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-amber-400/20"
                        >
                          <X size="0.625rem" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newTag.trim()) {
                          e.preventDefault();
                          const t = newTag.trim();
                          if (!formTags.includes(t)) {
                            setFormTags([...formTags, t]);
                            markLorebookDirty();
                          }
                          setNewTag("");
                        }
                      }}
                      placeholder="Add tag…"
                      className="flex-1 rounded-xl bg-[var(--secondary)] px-3 py-2 text-xs ring-1 ring-[var(--border)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                    <button
                      onClick={() => {
                        const t = newTag.trim();
                        if (t && !formTags.includes(t)) {
                          setFormTags([...formTags, t]);
                          markLorebookDirty();
                        }
                        setNewTag("");
                      }}
                      className="rounded-xl bg-[var(--secondary)] px-3 py-2 text-xs font-medium ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--accent)]"
                    >
                      <Plus size="0.75rem" />
                    </button>
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Category</label>
                  <div className="flex gap-2">
                    {CATEGORY_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setFormCategory(opt.value);
                            markLorebookDirty();
                          }}
                          className={cn(
                            "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all",
                            formCategory === opt.value
                              ? "bg-amber-400/15 text-amber-400 ring-1 ring-amber-400/30"
                              : "bg-[var(--secondary)] text-[var(--muted-foreground)] ring-1 ring-[var(--border)] hover:bg-[var(--accent)]",
                          )}
                        >
                          <Icon size="0.8125rem" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Character Link */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1 text-xs font-medium">
                    Linked Character{" "}
                    <HelpTooltip text="When linked to a character, this lorebook will only activate in chats that include that character." />
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={formCharacterId ?? ""}
                      onChange={(e) => {
                        setFormCharacterId(e.target.value || null);
                        markLorebookDirty();
                      }}
                      className="flex-1 rounded-xl bg-[var(--secondary)] px-3 py-2.5 text-sm ring-1 ring-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    >
                      <option value="">None (global)</option>
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {formCharacterId && (
                      <button
                        onClick={() => {
                          setFormCharacterId(null);
                          markLorebookDirty();
                        }}
                        className="rounded-xl bg-[var(--secondary)] p-2.5 text-[var(--muted-foreground)] ring-1 ring-[var(--border)] transition-colors hover:text-[var(--foreground)]"
                        title="Unlink character"
                      >
                        <X size="0.875rem" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Enabled toggle */}
                <div className="flex items-center justify-between rounded-xl bg-[var(--secondary)] px-4 py-3 ring-1 ring-[var(--border)]">
                  <div>
                    <p className="text-xs font-medium">Enabled</p>
                    <p className="text-[0.6875rem] text-[var(--muted-foreground)]">
                      When off, entries in this lorebook won't activate
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setFormEnabled(!formEnabled);
                      markLorebookDirty();
                    }}
                    className="transition-colors"
                  >
                    {formEnabled ? (
                      <ToggleRight size="1.75rem" className="text-amber-400" />
                    ) : (
                      <ToggleLeft size="1.75rem" className="text-[var(--muted-foreground)]" />
                    )}
                  </button>
                </div>

                {/* Scan settings */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 flex items-center gap-1 text-xs font-medium">
                      Scan Depth{" "}
                      <HelpTooltip text="How many recent messages to scan for keyword matches. Higher = searches further back in chat history, but uses more processing." />
                    </label>
                    <input
                      type="number"
                      value={formScanDepth}
                      onChange={(e) => {
                        setFormScanDepth(parseInt(e.target.value) || 0);
                        markLorebookDirty();
                      }}
                      min={0}
                      className="w-full rounded-xl bg-[var(--secondary)] px-3 py-2.5 text-sm ring-1 ring-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-1 text-xs font-medium">
                      Token Budget{" "}
                      <HelpTooltip text="Maximum number of tokens this lorebook can inject per generation. Prevents a lorebook from consuming too much of the context window." />
                    </label>
                    <input
                      type="number"
                      value={formTokenBudget}
                      onChange={(e) => {
                        setFormTokenBudget(parseInt(e.target.value) || 0);
                        markLorebookDirty();
                      }}
                      min={0}
                      className="w-full rounded-xl bg-[var(--secondary)] px-3 py-2.5 text-sm ring-1 ring-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex items-center justify-between rounded-xl bg-[var(--secondary)] px-3 py-2.5 ring-1 ring-[var(--border)]">
                      <span className="mr-2 text-xs">Recursive</span>
                      <button
                        onClick={() => {
                          setFormRecursive(!formRecursive);
                          markLorebookDirty();
                        }}
                      >
                        {formRecursive ? (
                          <ToggleRight size="1.375rem" className="text-amber-400" />
                        ) : (
                          <ToggleLeft size="1.375rem" className="text-[var(--muted-foreground)]" />
                        )}
                      </button>
                    </div>
                    {formRecursive && (
                      <div>
                        <label className="mb-1.5 flex items-center gap-1 text-xs font-medium">
                          Max Depth{" "}
                          <HelpTooltip text="Maximum number of recursive passes. Each pass scans activated entry content for additional keyword matches. Higher values find more connections but use more processing." />
                        </label>
                        <input
                          type="number"
                          value={formMaxRecursionDepth}
                          onChange={(e) => {
                            setFormMaxRecursionDepth(Math.max(1, Math.min(10, parseInt(e.target.value) || 3)));
                            markLorebookDirty();
                          }}
                          min={1}
                          max={10}
                          className="w-20 rounded-xl bg-[var(--secondary)] px-3 py-2.5 text-sm ring-1 ring-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Vectorize (Embeddings) */}
                <VectorizeSection lorebookId={lorebookId!} entryCount={entries.length} />
              </div>
            )}

            {activeTab === "entries" && (
              <div className="space-y-3">
                {/* Search + Sort + Add */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search
                      size="0.8125rem"
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
                    />
                    <input
                      type="text"
                      placeholder="Search entries…"
                      value={entrySearch}
                      onChange={(e) => setEntrySearch(e.target.value)}
                      className="w-full rounded-xl bg-[var(--secondary)] py-2.5 pl-8 pr-3 text-xs ring-1 ring-[var(--border)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                  </div>
                  <div className="relative">
                    <ArrowUpDown
                      size="0.8125rem"
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"
                    />
                    <select
                      value={entrySort}
                      onChange={(e) => setEntrySort(e.target.value as EntrySortKey)}
                      className="h-full appearance-none rounded-xl bg-[var(--secondary)] py-2.5 pl-8 pr-6 text-xs ring-1 ring-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    >
                      {SORT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleAddEntry}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2.5 text-xs font-medium text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
                  >
                    <Plus size="0.8125rem" />
                    Add Entry
                  </button>
                </div>

                {/* Total tokens summary */}
                {filteredEntries.length > 0 && (
                  <div className="flex items-center gap-3 text-[0.6875rem] text-[var(--muted-foreground)]">
                    <span>{filteredEntries.length} entries</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Hash size="0.625rem" />
                      {filteredEntries.reduce((sum, e) => sum + estimateTokens(e.content), 0).toLocaleString()} tokens
                      (est.)
                    </span>
                  </div>
                )}

                {/* Entry list */}
                {filteredEntries.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <FileText size="1.5rem" className="text-[var(--muted-foreground)]" />
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {entrySearch ? "No entries match your search" : "No entries yet — add one to get started"}
                    </p>
                  </div>
                )}

                {filteredEntries.map((entry) => (
                  <div
                    key={entry.id}
                    onClick={() => openEntry(entry.id)}
                    className="group flex cursor-pointer items-center gap-3 rounded-xl bg-[var(--secondary)] p-3 ring-1 ring-[var(--border)] transition-all hover:ring-amber-400/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn("h-2 w-2 rounded-full", entry.enabled ? "bg-emerald-400" : "bg-zinc-500")}
                        />
                        <span className="truncate text-sm font-medium">{entry.name}</span>
                        {entry.constant && (
                          <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[0.5625rem] font-medium text-amber-400">
                            CONST
                          </span>
                        )}
                        {entry.locked && (
                          <span className="rounded bg-sky-400/15 px-1.5 py-0.5 text-[0.5625rem] font-medium text-sky-400">
                            <Lock size="0.5rem" className="inline mr-0.5" />
                            LOCKED
                          </span>
                        )}
                        {entry.tag && (
                          <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[0.5625rem] text-[var(--muted-foreground)]">
                            {entry.tag}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[0.6875rem] text-[var(--muted-foreground)]">
                        <span className="flex items-center gap-1">
                          <Key size="0.625rem" />
                          {entry.keys.length > 0 ? entry.keys.slice(0, 3).join(", ") : "No keys"}
                          {entry.keys.length > 3 && ` +${entry.keys.length - 3}`}
                        </span>
                        <span>•</span>
                        <span>Order {entry.order}</span>
                        <span>•</span>
                        <span>Depth {entry.depth}</span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          <Hash size="0.5625rem" />
                          {estimateTokens(entry.content).toLocaleString()} tk
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEntry(entry.id);
                      }}
                      className="rounded-lg p-1.5 opacity-0 transition-all hover:bg-[var(--destructive)]/15 group-hover:opacity-100 max-md:opacity-100"
                    >
                      <Trash2 size="0.75rem" className="text-[var(--destructive)]" />
                    </button>
                    <ChevronRight size="0.875rem" className="text-[var(--muted-foreground)]" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Vectorize lorebook entries for semantic matching. */
function VectorizeSection({ lorebookId, entryCount }: { lorebookId: string; entryCount: number }) {
  const { data: rawConnections } = useConnections();
  const connections = (rawConnections ?? []) as Array<{ id: string; name: string; embeddingModel?: string }>;
  const embeddingConnections = connections.filter((c) => c.embeddingModel);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [vectorizing, setVectorizing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Auto-select first embedding connection
  useEffect(() => {
    if (!selectedConnectionId && embeddingConnections.length > 0) {
      setSelectedConnectionId(embeddingConnections[0].id);
    }
  }, [embeddingConnections, selectedConnectionId]);

  const handleVectorize = async () => {
    if (!selectedConnectionId) return;
    setVectorizing(true);
    setResult(null);
    try {
      const conn = embeddingConnections.find((c) => c.id === selectedConnectionId);
      const res = await api.post(`/lorebooks/${lorebookId}/vectorize`, {
        connectionId: selectedConnectionId,
        model: conn?.embeddingModel ?? "",
      });
      const data = res as { vectorized: number };
      setResult({ success: true, message: `Vectorized ${data.vectorized} entries` });
    } catch (err) {
      setResult({ success: false, message: err instanceof Error ? err.message : "Vectorization failed" });
    } finally {
      setVectorizing(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles size="0.875rem" className="text-violet-400" />
        <h4 className="text-xs font-semibold">Semantic Search (Embeddings)</h4>
        <HelpTooltip text="Vectorize entries to enable semantic matching. Entries will be found by meaning, not just keywords. Requires a connection with an Embedding Model configured." />
      </div>
      {embeddingConnections.length === 0 ? (
        <p className="text-[0.625rem] text-[var(--muted-foreground)]">
          No connections with an embedding model configured. Set an Embedding Model on a connection first.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <select
              value={selectedConnectionId}
              onChange={(e) => setSelectedConnectionId(e.target.value)}
              className="flex-1 rounded-lg bg-[var(--secondary)] px-2.5 py-1.5 text-xs ring-1 ring-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            >
              {embeddingConnections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.embeddingModel})
                </option>
              ))}
            </select>
            <button
              onClick={handleVectorize}
              disabled={vectorizing || entryCount === 0}
              className="flex items-center gap-1.5 rounded-xl bg-violet-500/15 px-3 py-1.5 text-xs font-medium text-violet-400 ring-1 ring-violet-500/30 transition-all hover:bg-violet-500/25 active:scale-[0.98] disabled:opacity-50"
            >
              {vectorizing ? <Loader2 size="0.75rem" className="animate-spin" /> : <Sparkles size="0.75rem" />}
              Vectorize {entryCount} entries
            </button>
          </div>
          {result && (
            <p
              className={cn(
                "text-[0.625rem] flex items-center gap-1",
                result.success ? "text-emerald-400" : "text-red-400",
              )}
            >
              {result.success ? <Check size="0.625rem" /> : <AlertTriangle size="0.625rem" />}
              {result.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}

