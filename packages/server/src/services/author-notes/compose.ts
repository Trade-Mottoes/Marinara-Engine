// ──────────────────────────────────────────────
// Author's Notes — composer
//
// Reads chat metadata in either shape (new fragments array or legacy
// single-string) and produces the text block to inject at depth N.
//
// Fragments take precedence when present: enabled non-empty fragments
// are sorted by `order` and joined with a blank line between. The
// legacy `authorNotes` string is the fallback so chats that haven't
// been touched in the new UI keep working bit-identically.
// ──────────────────────────────────────────────
import type { AuthorNoteFragment } from "@marinara-engine/shared";

export function composeAuthorNotes(meta: Record<string, unknown> | undefined | null): string {
  if (!meta) return "";

  const fragmentsRaw = meta.authorNoteFragments;
  if (Array.isArray(fragmentsRaw) && fragmentsRaw.length > 0) {
    const composed = fragmentsRaw
      .filter(isEnabledNonEmptyFragment)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((f) => f.content.trim())
      .join("\n\n");
    if (composed) return composed;
    // Fragments existed but none enabled / non-empty — fall through to
    // legacy in case the user has a stashed string they haven't migrated.
  }

  const legacy = meta.authorNotes;
  if (typeof legacy === "string") return legacy.trim();
  return "";
}

function isEnabledNonEmptyFragment(value: unknown): value is AuthorNoteFragment {
  if (!value || typeof value !== "object") return false;
  const f = value as Partial<AuthorNoteFragment>;
  return (
    typeof f.id === "string" &&
    typeof f.content === "string" &&
    f.content.trim().length > 0 &&
    f.enabled === true
  );
}
