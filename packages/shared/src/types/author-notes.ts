// ──────────────────────────────────────────────
// Author's Notes — Fragments
//
// Replaces (well, supplements) the single-string `authorNotes` chat
// metadata field with an ordered list of toggleable fragments. At
// generation time, enabled fragments compose into the same injection
// string the legacy field would have produced. Lets users keep a stack
// of in-flight ideas around with quick on/off control rather than
// cutting and pasting one note into the box at a time.
//
// Storage: chat.metadata.authorNoteFragments (alongside legacy
// authorNotes string for backwards compat — composer prefers fragments
// when present, falls back to the string when not).
// ──────────────────────────────────────────────

export interface AuthorNoteFragment {
  /** Stable identifier — lets the UI key list rows and the server
   *  diff fragments without ambiguity. */
  id: string;
  /** Free-text content. Trimmed at compose time; empty content is
   *  filtered out regardless of the enabled flag. */
  content: string;
  /** When false, fragment is retained but skipped at compose time —
   *  the "I'll need this in a minute" parking lot. */
  enabled: boolean;
  /** Sort key. Lower numbers compose first. The UI keeps these
   *  contiguous (0..n-1) but the composer just sorts ascending. */
  order: number;
}
