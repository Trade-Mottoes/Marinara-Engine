// ──────────────────────────────────────────────
// Author's Notes — composer
//
// Reads chat metadata in either shape (new entries array or legacy
// single-string) and produces the text block to inject at depth N.
//
// Entries take precedence when present: enabled non-empty entries
// are sorted by `order` and joined with a blank line between. The
// legacy `authorNotes` string is the fallback so chats that haven't
// been touched in the new UI keep working bit-identically.
// ──────────────────────────────────────────────
import type { AuthorsNoteEntry } from "@marinara-engine/shared";

export function composeAuthorNotes(meta: Record<string, unknown> | undefined | null): string {
  if (!meta) return "";

  // Storage key is still `authorNoteFragments` for back-compat — see
  // shared/types/author-notes.ts for the rationale.
  const entriesRaw = meta.authorNoteFragments;
  if (Array.isArray(entriesRaw) && entriesRaw.length > 0) {
    const composed = entriesRaw
      .filter(isEnabledNonEmptyEntry)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((e) => e.content.trim())
      .join("\n\n");
    if (composed) return composed;
    // Entries existed but none enabled / non-empty — fall through to
    // legacy in case the user has a stashed string they haven't migrated.
  }

  const legacy = meta.authorNotes;
  if (typeof legacy === "string") return legacy.trim();
  return "";
}

function isEnabledNonEmptyEntry(value: unknown): value is AuthorsNoteEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<AuthorsNoteEntry>;
  return (
    typeof e.id === "string" &&
    typeof e.content === "string" &&
    e.content.trim().length > 0 &&
    e.enabled === true
  );
}
