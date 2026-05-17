// ──────────────────────────────────────────────
// LorebookEntryEditor — public API for the entry-edit form
//
// Reusable entry-edit form for any consumer that wants to edit a single
// lorebook entry. Owns no state of its own — caller provides the entry
// object and all updates flow through the standard useUpdateLorebookEntry
// hook inside the form, with autosave on blur + a short debounce. Used by:
//
//   - LorebookEditor.tsx route page (rendered inline by LorebookEntryRow
//     when an entry's row is expanded)
//   - LorebookEntryQuickEditModal.tsx (pencil-icon affordance in the
//     Active World Info panel; opens a modal containing this editor)
//
// This file is currently a thin re-export of the function-local
// `ExpandedDrawer` component inside LorebookEntryRow.tsx. The form and
// its dependencies (FieldGroup, KeysEditor, FilterPills, helper functions,
// status constants, autosave machinery) are shared with LorebookEntryRow's
// collapsed-state UI, so co-locating them in one file is the right call.
// This file exists to give external consumers (the modal) a clean import
// boundary with a descriptive public name.
//
// Phase B of the feat/world-info-interactive v1.6.0 reconciliation —
// see ~/me/MyBrain/Projects/Marinara-Engine/2026-05-17 Phase B+C wire-up.md
// for the per-decision rationale.
// ──────────────────────────────────────────────

export { ExpandedDrawer as LorebookEntryEditor } from "./LorebookEntryRow";
