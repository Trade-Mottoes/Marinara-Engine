// ──────────────────────────────────────────────
// Lorebook Entry — quick edit modal
// ──────────────────────────────────────────────
// Wraps the shared LorebookEntryEditor in a Modal shell so users can
// edit a lorebook entry without leaving the chat. Reuses the same form
// component the route-level LorebookEditor uses — no duplicated UI.
//
// Save semantics: explicit Save in the modal footer commits via
// useUpdateLorebookEntry. Cancel / Escape / backdrop discard. Save
// gates on `isDirty` so the user knows when changes are pending.
//
// Note: this edits the GLOBAL lorebook entry (changes affect every
// chat using this lorebook). Per-chat overrides (eye/pin toggles in
// the World Info panel) are unaffected.

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { LorebookEntry } from "@marinara-engine/shared";
import { Modal } from "../ui/Modal";
import { LorebookEntryEditor } from "../lorebooks/LorebookEntryEditor";
import { useLorebookEntry, useUpdateLorebookEntry } from "../../hooks/use-lorebooks";

interface Props {
  open: boolean;
  onClose: () => void;
  lorebookId: string | null;
  entryId: string | null;
}

export function LorebookEntryQuickEditModal({ open, onClose, lorebookId, entryId }: Props) {
  const { data: serverEntry } = useLorebookEntry(lorebookId, entryId);
  const updateEntry = useUpdateLorebookEntry();

  const [draft, setDraft] = useState<Partial<LorebookEntry> | null>(null);

  // Initialise the draft from the server entry on first load (or when
  // the entryId changes — modal reopened on a different entry).
  useEffect(() => {
    if (!serverEntry) return;
    if (draft && draft.id === serverEntry.id) return;
    // Schema stores enabled / constant / locked / etc. as text "true"/"false";
    // the editor expects booleans. Normalise once on load.
    const norm = (v: unknown): boolean => v === true || v === "true";
    setDraft({
      ...serverEntry,
      enabled: norm(serverEntry.enabled),
      constant: norm(serverEntry.constant),
      selective: norm(serverEntry.selective),
      matchWholeWords: norm(serverEntry.matchWholeWords),
      caseSensitive: norm(serverEntry.caseSensitive),
      useRegex: norm(serverEntry.useRegex),
      locked: norm(serverEntry.locked),
      preventRecursion: norm(serverEntry.preventRecursion),
    });
  }, [serverEntry, draft]);

  // Reset on close so the next open re-fetches/re-initialises.
  const handleClose = () => {
    setDraft(null);
    onClose();
  };

  const handleChange = (patch: Partial<LorebookEntry>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSave = () => {
    if (!lorebookId || !entryId || !draft) return;
    updateEntry.mutate(
      {
        lorebookId,
        entryId,
        name: draft.name,
        content: draft.content,
        keys: draft.keys,
        secondaryKeys: draft.secondaryKeys,
        enabled: draft.enabled,
        constant: draft.constant,
        selective: draft.selective,
        selectiveLogic: draft.selectiveLogic,
        matchWholeWords: draft.matchWholeWords,
        caseSensitive: draft.caseSensitive,
        useRegex: draft.useRegex,
        position: draft.position,
        depth: draft.depth,
        order: draft.order,
        role: draft.role,
        sticky: draft.sticky,
        cooldown: draft.cooldown,
        delay: draft.delay,
        ephemeral: draft.ephemeral,
        group: draft.group,
        tag: draft.tag,
        locked: draft.locked,
        preventRecursion: draft.preventRecursion,
      },
      { onSuccess: () => handleClose() },
    );
  };

  // Dirty-detect by stringifying both sides — cheap given the form size.
  // Field set kept in sync with the patch payload above.
  const isDirty = (() => {
    if (!draft || !serverEntry) return false;
    const norm = (v: unknown): boolean => v === true || v === "true";
    const fields: Array<keyof LorebookEntry> = [
      "name",
      "content",
      "keys",
      "secondaryKeys",
      "selectiveLogic",
      "position",
      "depth",
      "order",
      "role",
      "sticky",
      "cooldown",
      "delay",
      "ephemeral",
      "group",
      "tag",
    ];
    for (const f of fields) {
      if (JSON.stringify(draft[f]) !== JSON.stringify(serverEntry[f])) return true;
    }
    const boolFields: Array<keyof LorebookEntry> = [
      "enabled",
      "constant",
      "selective",
      "matchWholeWords",
      "caseSensitive",
      "useRegex",
      "locked",
      "preventRecursion",
    ];
    for (const f of boolFields) {
      if (draft[f] !== norm(serverEntry[f])) return true;
    }
    return false;
  })();

  return (
    <Modal open={open} onClose={handleClose} title="Edit lorebook entry" width="max-w-3xl">
      {!draft ? (
        <div className="flex items-center gap-2 py-6 text-xs text-[var(--muted-foreground)]">
          <Loader2 size="0.875rem" className="animate-spin" />
          Loading entry…
        </div>
      ) : (
        <div className="flex h-[70vh] flex-col">
          <div className="flex-1 overflow-hidden">
            <LorebookEntryEditor
              entryForm={draft}
              onChange={handleChange}
              onSave={handleSave}
              saving={updateEntry.isPending}
              headerless
            />
          </div>

          <div className="flex items-center justify-end gap-1.5 border-t border-[var(--border)]/40 px-1 pt-3">
            <button
              onClick={handleClose}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isDirty || updateEntry.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
            >
              {updateEntry.isPending ? (
                <Loader2 size="0.75rem" className="animate-spin" />
              ) : (
                <Save size="0.75rem" />
              )}
              Save
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
