// ──────────────────────────────────────────────
// Author's Notes — entries
//
// Replaces (well, supplements) the single-string `authorNotes` chat
// metadata field with an ordered list of toggleable note entries. At
// generation time, enabled entries compose into the same injection
// string the legacy field would have produced. Lets users keep a stack
// of in-flight ideas around with quick on/off control rather than
// cutting and pasting one note into the box at a time.
//
// Storage: chat.metadata.authorNoteEntries, alongside upstream's
// legacy authorNotes string for backwards compat — composer prefers
// entries when present, falls back to the string when not.
// ──────────────────────────────────────────────

export interface AuthorsNoteEntry {
  /** Stable identifier — lets the UI key list rows and the server
   *  diff entries without ambiguity. */
  id: string;
  /** Free-text content. Trimmed at compose time; empty content is
   *  filtered out regardless of the enabled flag. */
  content: string;
  /** When false, entry is retained but skipped at compose time —
   *  the "I'll need this in a minute" parking lot. */
  enabled: boolean;
  /** Sort key. Lower numbers compose first. The UI keeps these
   *  contiguous (0..n-1) but the composer just sorts ascending. */
  order: number;
}
