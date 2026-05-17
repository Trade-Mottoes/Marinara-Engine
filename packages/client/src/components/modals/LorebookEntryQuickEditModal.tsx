// ──────────────────────────────────────────────
// Modal: Lorebook Entry Quick Edit
//
// Wraps the shared LorebookEntryEditor in a Modal shell so users can
// edit any active lorebook entry without leaving the chat. Triggered
// by the pencil-icon affordance on Active World Info panel rows.
//
// The editor itself owns its form state and autosaves on blur/debounce
// (see LorebookEntryRow.tsx `ExpandedDrawer` for the autosave machinery).
// This modal only owns: the fetch (lorebookId + entryId → LorebookEntry),
// the supporting context (characters + their tags, for the entry's
// character/tag filter pills), and the open/close lifecycle. When the
// user closes the modal, the editor's unmount hook flushes any pending
// changes before it tears down.
//
// IMPORTANT — portal: this modal is opened from inside WorldInfoPanel,
// which lives inside a popover container that uses `animate-message-in`
// (a CSS transform animation). CSS spec says any parent with `transform`
// — even a brief animation frame — creates a new containing block for
// `position: fixed` descendants. Without createPortal, the underlying
// Modal's `fixed inset-0` would be trapped inside the ~320px-wide
// popover instead of covering the viewport, squishing the entry-edit
// form into an unusable rail. Rendering through document.body escapes
// the popover's stacking context entirely. The Modal component itself
// is shared with other consumers that may or may not have this problem;
// portaling here (the affected consumer) is the safer scoped fix.
//
// IMPORTANT — event isolation: the popover that hosts WorldInfoPanel
// (ActiveWorldInfoButton.tsx, upstream) installs a `document.mousedown`
// listener that closes the popover when the click target is outside its
// own container. Now that we've portaled the modal to document.body, any
// click inside the modal is "outside" the popover's container → the
// listener fires → popover closes → our modal unmounts as a side effect.
// User-visible symptom: every click inside the modal dismisses it before
// any field can be edited.
//
// Fix: stop mousedown + click propagation at the modal wrapper so events
// originating inside the modal never reach the document level. React's
// stopPropagation on the synthetic event also stops the native event
// from continuing to bubble, so the document listener never fires for
// modal-internal clicks.
//
// IMPORTANT — backdrop-click-to-close: the underlying Modal component
// has a backdrop-click-to-close mechanism, but it's broken — its overlay
// onClick checks `e.target === overlayRef.current`, but Modal's absolutely-
// positioned backdrop sits on top of the overlay, so backdrop clicks have
// the BACKDROP as their target, not the overlay. The check never matches
// → onClose never fires. This is a bug in the shared Modal component,
// but we fix it scoped here (changing Modal would affect every other
// consumer, some of which may rely on the current — possibly accidental
// — behaviour of "only Escape and X close the modal"). The wrapper's
// onClick does the right thing: if the click landed inside the modal
// panel (matched by the `mari-modal-panel` class on Modal's content div),
// ignore; otherwise — the click hit the backdrop or the overlay edge —
// call onClose. Combined with the stopPropagation requirement, the
// click handler stops propagation AND dismisses on backdrop.
//
// The Modal is given `max-w-3xl` (48rem ≈ 768px) so the entry-edit form
// — which has multi-column filter pill blocks at lg+ breakpoints — has
// room to breathe. The route-page LorebookEditor uses a similar width;
// keeping parity means users get a consistent layout whether they edit
// from the route or via this quick-edit affordance.
//
// Phase C of the feat/world-info-interactive v1.6.0 reconciliation —
// see ~/me/MyBrain/Projects/Marinara-Engine/2026-05-17 Phase B+C wire-up.md
// for the per-decision rationale.
// ──────────────────────────────────────────────
import { useMemo } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { useCharacters } from "../../hooks/use-characters";
import { useLorebookEntry } from "../../hooks/use-lorebooks";
import { LorebookEntryEditor } from "../lorebooks/LorebookEntryEditor";
import type { LorebookEntry } from "@marinara-engine/shared";

interface LorebookEntryQuickEditModalProps {
  /** Lorebook the entry belongs to, or null when no edit is in flight. */
  lorebookId: string | null;
  /** Entry to edit, or null when no edit is in flight. */
  entryId: string | null;
  /** Close handler — called by Modal on Escape, backdrop click, or X. */
  onClose: () => void;
}

export function LorebookEntryQuickEditModal({ lorebookId, entryId, onClose }: LorebookEntryQuickEditModalProps) {
  const open = !!(lorebookId && entryId);
  const { data: entry, isLoading: entryLoading } = useLorebookEntry(lorebookId, entryId);
  const { data: rawCharacters } = useCharacters();

  // Derivation matches LorebookEditor.tsx's route-page derivation so the
  // entry's character + character-tag filter pills behave identically here.
  // Defensive against malformed character data — fall back to "Unknown".
  const characters = useMemo(() => {
    if (!rawCharacters) return [] as Array<{ id: string; name: string; tags: string[] }>;
    return (rawCharacters as Array<{ id: string; data: string | Record<string, unknown> }>).map((c) => {
      try {
        const parsed = typeof c.data === "string" ? JSON.parse(c.data) : c.data;
        const tags = Array.isArray(parsed?.tags) ? parsed.tags.map(String).filter(Boolean) : [];
        return { id: c.id, name: parsed?.name ?? "Unknown", tags };
      } catch {
        return { id: c.id, name: "Unknown", tags: [] };
      }
    });
  }, [rawCharacters]);

  const characterTags = useMemo(
    () => Array.from(new Set(characters.flatMap((character) => character.tags))).sort((a, b) => a.localeCompare(b)),
    [characters],
  );

  if (typeof document === "undefined") return null; // SSR / non-browser guard

  return createPortal(
    // Wrapper has two jobs: (1) stop mousedown/touch propagation to keep
    // the popover open; (2) handle the broken backdrop-click-to-close on
    // click. See the file-level comments for the why. The wrapper has no
    // visual effect; the Modal child renders the actual fixed overlay.
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        // Click bubbled through the modal panel? Leave the modal open;
        // it's a real interaction with a form field, button, etc.
        if ((e.target as HTMLElement).closest(".mari-modal-panel")) return;
        // Otherwise the click hit the backdrop or the overlay's padding.
        // Dismiss — same semantics as Escape and the X button.
        onClose();
      }}
    >
      <Modal open={open} onClose={onClose} title="Edit lorebook entry" width="max-w-3xl">
        {entryLoading || !entry ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--muted-foreground)]">
            <Loader2 size="1rem" className="animate-spin" />
            Loading entry…
          </div>
        ) : (
          <LorebookEntryEditor
            entry={entry as LorebookEntry}
            lorebookId={lorebookId!}
            characters={characters}
            characterTags={characterTags}
          />
        )}
      </Modal>
    </div>,
    document.body,
  );
}
