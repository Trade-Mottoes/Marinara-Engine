# Feature ideas (post-v1 wishlist)

Loose notes on directions that came up in conversation but weren't implemented.
Not promises, not a roadmap — context for future sessions.

---

## End Scene Dialog v2 — make the dialog actually earn its space

Triggered by John's observation that the v1 scene-transcript textarea is a
phantom limb: 7 rows can't meaningfully review or edit a 50-message scene,
and the user already has the whole thing visible on the chat page behind
the dialog.

### Replace the transcript area with real value

**Stats / context** (top of dialog, always visible):

- Scene length: `N messages · M words · ~K tokens`
- Duration: "2h 14m · 3 characters spoke"
- Token-budget meter: `~5,200 input / 8,192 cap` with a visual bar so the
  user can see headroom
- Auto-classification chip: "This scene is **medium**" (small / medium /
  large / epic) — feeds into the presets below

**Guidance / presets** (replaces the freed transcript area):

- Length presets: brief / medium / extended / unconstrained. Each is a
  different instructions block. Click to apply, then optionally edit the
  loaded text. Auto-select based on the scene-length classification on
  first open.
- "Focus on" chips: emotional beats / decisions made / character
  revelations / world details — clicking injects specific lines into the
  instructions block.

### Second-pass refinement

After first generation, on the Result tab (or a new third tab):

- "Refine" textarea: free-text "what would you change?" → server takes
  prior summary + your nudge as additional context → produces new
  summary. Different code path from regenerate-from-scratch.
- Quick-fix buttons: "more concise", "add X detail you missed", "fix
  tone", "expand the ending".
- Diff view between passes so you can see what actually changed.

### Transcript as escape hatch, not default

Hide it from the main panel. Stash behind a collapsible like the system
prompt is now:

```
▶ Scene transcript (advanced — edit only if you need to redact)
```

Available for the rare "I need to NOT pass this part to the model" case.

### Architectural notes

- `/api/scene/conclude/preview` already supports any combination of
  overrides — most of the v2 surface is just populating the dialog with
  smarter content.
- The compose response could be extended with `stats: { ... }` to feed
  the new top section without extra round-trips.
- Second-pass refinement is the one structural addition: add a
  `priorSummary?: string` and `refinementInstruction?: string` to the
  request, server includes both in the LLM call as additional context.

---

## Replace numeric "depth" with semantic intent

Triggered by John pushing back that he has no intuition for what `depth`
actually does to the chat — "it's adding a very nuanced, LLM idea into a
fricking story". He's right; depth is an implementer concept leaking
through to end users, and there's no UX value in making them tune it
numerically.

**The cleanup**: replace numeric depth fields with a semantic intent
picker, applied across Author's Notes (incl. fragments), lorebook
entries, and any other place we currently expose `depth: number`.

```
Influence the next reply       → depth 0-1
Recent context                 → depth 2-4
Background detail              → depth 4-8
Ambient world / tone           → depth 8+
```

Implementation shape:

- Storage stays numeric (shared across upstream + fork; no migration risk).
- UI maps intent ↔ depth via a small lookup. Default falls in the
  middle of each band.
- An "advanced" toggle exposes the underlying number for power users
  who want surgical control. Hidden by default.
- Same picker in Author's Notes fragments AND lorebook entry editor
  (the LorebookEntryEditor we already extracted into its own file).

Should land **after** the base Author's Notes fragments feature — easier
to apply once the data shape is settled. Lorebook side is a separate
pass.

---
