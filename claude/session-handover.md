# Marinara-Engine — Session Handover

Most recent session: 2026-05-17. The state of the world for the next Claude.

Previous sessions: 2026-05-06/07 (notes-system setup + the prior sync), late Apr 2026 (work logged below the "Critical learnings" header still reflects that earlier work).

## Personal-project layer: MyBrain outer index

Marinara-Engine is one of John's **personal projects**, so the outer index for it lives in his MyBrain vault:

- **Outer index:** `~/me/MyBrain/Projects/Marinara-Engine/README.md`
- **Per-session detail notes:** `~/me/MyBrain/Projects/Marinara-Engine/YYYY-MM-DD <Title>.md` (expansive, capture the why)
- **Cross-project learnings discovered while working on Marinara:** `~/me/MyBrain/Knowledge/<Topic>.md`

The MyBrain layer is the **orientation surface** — what this project is, where its files live, current state, links to detail notes. The deep operational stuff (this file, `marinara-pr-workflow.md`, `feature-ideas.md`, `test-fixtures/lorebook-test.md`) continues to live here in `claude/`. Both layers are in play when working on Marinara: MyBrain when orienting, `claude/` when working.

See `~/.claude/CLAUDE.md` (`## Personal projects (MyBrain vault)` section) for the full convention. **First MyBrain access in a session needs a directory grant** — either request it via the directory-request tool, or John will say to skip it.

When wrapping up a substantive session: write the in-repo handover (this file) AND the MyBrain detail note. Different voices — handover is operational ("next Claude does X"); MyBrain note is reflective ("we did X because Y; A and B were considered and rejected for these reasons"). Overlap is fine.

## Repo orientation

- **Working dir:** `~/ai/dev/Marinara-Engine`
- **Remotes:** `origin` → `Trade-Mottoes/Marinara-Engine` (your fork, anonymous identity); `pd` → `Pasta-Devs/Marinara-Engine` (upstream)
- **Identity guard:** pre-commit hook enforces `trade-mottoes-1g@icloud.com`. Always check `git config --local --get user.email` before any commit.
- **Workflow doc:** `claude/marinara-pr-workflow.md` — the canonical SOP for PR prep.
- **Tooling backup:** orphan branch `fork/tooling` on origin holds scripts and these notes for cross-machine sync (see "Tooling" section below).

## Branch state at end of session

**Sync baseline:** `main` and `pd/main` both at **`c247b2eb`** (post-v1.6.0). Brought forward from `19e0713` on 2026-05-17 — **477 upstream commits in 10 days**, including the v1.6.0 release. Much larger sync than prior cycles.

**Merged upstream (permanent wins):**

- **PR #225** — `fix/lorebooks-ignored-without-preset` ✅ in `pd/main`. Branch removed.
- **PR #245** — `fix/lorebook-scan-skips-empty-chats` ✅ in `pd/main`. Branch removed; commented out of `rebuild-integrations.sh`.
- **PR #239 (upstream)** — landed an alternative author-notes save-race fix that supersedes our `refactor/author-notes-dialog`. Our branch is now redundant; commented out of `rebuild-integrations.sh`.
- **PR #739 (upstream)** — landed a `provider.maxTokensOverrideValue ?? 1024` graft in scene summary maxTokens. **Different bug** than our `fix/scene-summary-respects-agent-defaults`; the two compose cleanly. Our branch absorbed the graft during this sync's merge resolution.

**Retired this session:**

- **`refactor/summary-dialog`** — RETIRED 2026-05-17. Upstream's PR #938 ("Feat/summary popover metadata") reshaped the same chat-Summary surface; combined with the prior #239 supersession of the paired author-notes refactor, marginal value of our peek-then-edit Modal architecture is too low to justify rebuilding on top of #938. Commented out of `rebuild-integrations.sh` with rationale. **Action: close PR #213 at leisure.**

**Rebuilt-and-baked 2026-05-17 (full backlog cleared):**

The entire deferred + recurring-conflict backlog was rebased or rebuilt against current `pd/main`. Every active branch is now baked. Final rebuild from `pd/main` merges all 11 branches with one tiny 4-line export-conflict (adjacent additions to `shared/src/index.ts` from two feature branches — unavoidable, takes 30 seconds to resolve).

- **`fix/google-provider-no-candidates-crash`** — REBASED onto current pd/main; resolution baked
- **`fix/agents-panel-enable-toggle`** — REBASED again (had drifted out of date against current pd/main since prior rebase)
- **`fix/scene-summary-respects-agent-defaults`** — REBASED onto current pd/main; resolution baked
- **`fix/character-memories-recency-cap`** — REBUILT from scratch (14-line surgical change re-applied to current `generate.routes.ts`, which has reshuffled significantly)
- **`feat/prompt-debug-dumps`** — REBUILT from scratch; **improvement**: now uses `logger.debug` / `logger.warn` instead of `console.log`/`console.warn` per project's Pino convention
- **`feat/author-note-fragments`** — REBUILT from scratch (no longer rebased on `feat/scene-conclude-preview`; just lives directly on `pd/main` — the previous dependency-rebase workaround was awkward)
- **`feat/world-info-interactive`** — Phase A REBUILT earlier today (per MyBrain detail note `2026-05-17 World Info Phase A rebuild.md`). Phases B (LorebookEntryEditor extraction) and C (pencil quick-edit modal) still deferred to follow-up sessions.

**In flight to upstream:**

- _(none — wait-for-engagement window is open)_

**Open / inactive:**

- **PR #213** — `refactor/author-notes-dialog` — opened but not merged. Now also: `refactor/summary-dialog` retired (no PR was open for it; just close the branch at leisure).

**On bench, all merged into test/general 2026-05-17 (every branch baked on current pd/main):**

```
fix/google-provider-thinking-budget          (high-impact Gemini fix, narrow)
fix/google-provider-no-candidates-crash      (defensive parser hardening — REBASED 2026-05-17)
fix/agents-panel-enable-toggle               (restores UI for enabling agents — REBASED 2026-05-17, retired the recurring conflict)
fix/conversation-default-preset              (stop auto-assigning preset to convo chats)
fix/character-memories-recency-cap           (don't drop memories after midnight — REBUILT 2026-05-17)
fix/sidecar-honour-explicit-maxtokens        (Math.max semantics — see below)
fix/scene-summary-respects-agent-defaults    (utility-task chain + sidecar sentinel — REBASED 2026-05-17)
feat/prompt-debug-dumps                      (opt-in MARINARA_DUMP_PROMPTS diagnostic — REBUILT 2026-05-17, now uses Pino logger)
feat/world-info-interactive                  (REBUILT 2026-05-17 Phase A — pin/disable/pills/regenerate/stable-order)
feat/scene-conclude-preview                  (preview-then-commit End Scene Dialog — additive-file architecture, always-clean)
feat/author-note-fragments                   (ordered toggleable Author's Notes fragments — REBUILT 2026-05-17)
```

**Deferred phases:**
- `feat/world-info-interactive` Phase B (LorebookEntryEditor extraction against current upstream entry shape — ~45-60 min, pure refactor)
- `feat/world-info-interactive` Phase C (pencil-modal glue, ~30 min after Phase B)

**Branch-state notes:**

- The original `fix/conversation-memory-and-sidecar-maxtokens` was **split into three independent branches** in the prior session (preset, memories, sidecar) because the fixes were unrelated and three small focused PRs land cleaner than one bundled.
- `fix/sidecar-honour-explicit-maxtokens` evolved through three semantics on the `Math.min(req, cfg)` line: original buggy `min` → patch v1 `requestedMaxTokens ?? config.maxTokens` (caller wins) → final `Math.max(requestedMaxTokens ?? 0, config.maxTokens)`. The reframe: caller's value is a task-specific **floor** (minimum headroom), user's runtime config is their preferred **ceiling**. Combine with `max()` so neither side silently demotes the other.
- `fix/scene-summary-respects-agent-defaults` (3 commits): scene-conclude's `resolveUtilityConnection` special-cases `LOCAL_SIDECAR_CONNECTION_ID` (mirrors `chats.routes.ts /generate-summary`). Without this, agents configured for "Local Model (sidecar)" caused HTTP 500 from POST /api/scene/conclude with "API connection not found".
- `fix/agents-panel-enable-toggle` was **rebased onto current `pd/main` (12b3ff8) and force-pushed** this session. The recurring-conflict pattern was hitting it on every `rebuild-integrations.sh` run — fixing in-place on test/general didn't survive the next wipe-and-rebuild. Resolution baked into the rebase: `phase: savedPhase` (drops a duplicate `enabled: true` and adopts upstream's savedPhase rename for `text_rewrite` custom agents); take HEAD's imports for `useMemo` and `GripVertical` in `AgentsPanel.tsx`. Now lands clean on every rebuild.

**Local-only (forked features, not for upstream submission):**

```
feat/world-info-interactive       (cab53c9 enhanced WorldInfo + LorebookEntryEditor extraction)
feat/scene-conclude-preview       (preview/edit/commit dialog replacing atomic /scene/conclude)
feat/author-note-fragments        (ordered toggleable Author's Notes fragments)
fork/tooling                      (orphan — scripts + claude/ notes backup)
```

**Fork branch dependencies:**

- `feat/author-note-fragments` is **rebased onto `feat/scene-conclude-preview`** because both branches add an export line at the same spot in `shared/src/index.ts`. Without the rebase the conflict recurred on every `rebuild-integrations.sh` run. After the rebase, `feat/author-note-fragments` carries `feat/scene-conclude-preview`'s commit in its history — when test/general merges them in order, the second merge is conflict-free.

## Tooling

`scripts/` (untracked in main worktree, mirrored on `fork/tooling`):

- **`rebuild-integrations.sh`** — wipes `test/general`, rebuilds from `pd/main` + the listed branches. Run after fetching upstream or editing any branch.
- **`snapshot-data.sh`** — point-in-time snapshots of the chat DB + media. Commands: `snap [label]`, `restore <name>`, `restore-latest` / `rl`, `list`, `prune [keep-N]`, `teardown`. Snapshots at `~/marinara-snapshots/`. Each restore auto-takes a `-prerestore` safety snapshot.
- **`publish-tooling.sh`** — syncs the live tooling files from the main worktree into `fork/tooling`'s sibling worktree (`../Marinara-tooling`), commits, and pushes. Idempotent; exits 0 on no-op.

`claude/test-fixtures/`:

- **`lorebook-test.sh`** — clean-room test fixture. Three chats now:
  - **`[Test] Lore Test (no preset, no agents)`** — sterile lorebook-injection isolation. No messages, no link.
  - **`[Test] Summary Test — convo (linked)`** — conversation-mode chat, no preset, linked to the scene below.
  - **`[Test] Summary Test — scene with steward`** — roleplay-mode chat with 4 seed messages mentioning lorebook keywords. `sceneStatus: "active"`, bidirectionally linked to the convo (so End Scene appears).
  Commands: `setup`, `reset-chat` (clears all 3 + re-seeds scene), `reset` (full teardown+setup), `teardown`, `status`.
- **`lorebook-test.md`** — test plan with expected answers.
- **`verify-lore.sh`** — watches `~/marinara-debug/` for the next fresh prompt dump.

`fork/tooling` (orphan branch on origin):

- Lives in a sibling worktree at `/Users/john/ai/dev/Marinara-tooling/`.
- Carries the scripts above + `claude/*.md` + `claude/test-fixtures/*` + a `README.md` describing the bootstrap recipe.
- `.gitignore` excludes `.claude/` (Claude Code's per-project state — has personal allowlists/hooks).
- Update workflow: edit in main worktree → `./scripts/publish-tooling.sh` → done.

## Critical learnings from THIS session (2026-05-17 — v1.6.0 sync)

### The "small change, massive false-positive conflict" pattern

When upstream's churn rate is high in files our branches touch (in this sync: `generate.routes.ts` got reshuffled by many small commits), git's merge diff can't find clean context anchors. A 10–50-line surgical change in our branch produces a 300–550-line conflict region — the actual disagreements are sparse inside that block, but they're surrounded by hundreds of lines of upstream-only changes that git can't align.

**Why this matters operationally:** resolving 500 lines of mostly-false-positive markers in-place on `test/general` is high-effort low-value. AND the resolution doesn't survive the next rebuild because `test/general` gets wiped. So you'd be paying that cost on every sync.

**The right answer per affected branch: rebuild-and-bake.** Branch from current `pd/main`, re-apply the small change directly to the new file (which now has all of upstream's surrounding changes baked in), force-push. Future merges replay cleanly.

**The wrong place to do it: mid-sync.** Each rebuild-and-bake is its own focused mini-session, with its own force-push authorisation. Doing 3 of them inside a sync session is too much. **Defer them, batch them, schedule them.**

Branches that need rebuild-and-bake as of 2026-05-17:
- `fix/character-memories-recency-cap` (14-line fix, 296-line false-positive conflict)
- `feat/prompt-debug-dumps` (single-commit feature, 557-line false-positive conflict)
- `feat/author-note-fragments` (rebased on `feat/scene-conclude-preview`, 546-line false-positive)
- `feat/world-info-interactive` — different shape (5 files, real conflicts not false-positives), but same disposition: needs dedicated session

### The additive-file architecture pays off (proof point)

`feat/scene-conclude-preview` introduces a substantial new feature (preview-then-commit End Scene Dialog) and **merged with ZERO conflicts** through the v1.6.0 sync. Why: all the new code lives in additive files — `chat/ChatRoleplay/EndSceneDialog.tsx`, `routes/scene-conclude-preview.routes.ts`, `shared/src/types/scene-preview.ts`. The integration with existing files is a one-line lazy import in `ChatArea.tsx` and a one-line route registration in `routes/index.ts`.

**Continue applying this pattern for opinionated UI work.** Whenever feasible: new file under `chat/ChatRoleplay/`, lazy-import from the existing surface. Lazy import = single-line change = no merge conflict.

### `pnpm db:push` doesn't exist

Top-level `CLAUDE.md` mentions `pnpm db:push` as a verification step. **There is no such script.** Schema is applied at server startup via `packages/server/src/db/migrate.ts`. Skip the db:push step; trust startup migration; verify with `pnpm check` only. Worth updating the top-level CLAUDE.md to reflect this, but it's tracked upstream so a fork-only edit isn't appropriate — the right move is either a PR upstream to fix the doc, or a note in this file (here).

### Rebase ours/theirs semantics — easy to invert

During a `git rebase` (NOT `git merge`):
- `git checkout --ours <file>` → take the branch you're rebasing ONTO (upstream HEAD)
- `git checkout --theirs <file>` → take the commit being replayed

This is the OPPOSITE of `git merge` semantics. I inverted it once this sync and briefly thought upstream had merged our fix (it hadn't). **Always sanity-check with `git show <ref>:<file>`** after a `--ours`/`--theirs` resolution before drawing conclusions.

## Critical learnings from prior sessions (2026-05-06 — upstream sync)

### feat/world-info-interactive lost its in-route entry-editor sub-view to upstream

Upstream replaced the "click an entry → navigate to a sub-view" pattern in `LorebookEditor.tsx` with **inline expansion** (`expandedEntryId` state — entries expand in-place rather than swapping the route view). Our branch's `if (editingEntryId && entryForm) return <LorebookEntryEditor … />` block referenced state vars (`editingEntryId`, `entryForm`, `handleSaveEntry`, `handleExitEntry`) that no longer exist on HEAD, so it was dropped during the merge.

What survives:

- `LorebookEntryEditor.tsx` (the extracted ~530-line entry-edit form) **still exists and is still used** — `LorebookEntryQuickEditModal.tsx` wraps it for the WorldInfoPanel pencil-icon modal. So the modal-from-pin UX from `feat/world-info-interactive` continues to work.
- The route-level lorebook page now uses upstream's inline expansion instead of our extracted editor.

What's lost:

- The route-page's "click entry → fullscreen sub-view edit" flow. Replaced by inline expansion.

If you want to restore that flow, you'd need to re-add the state vars (`editingEntryId`, `entryForm`, etc.), the open/close handlers, and a button on `LorebookEntryRow` that triggers them. Probably not worth it — inline expansion is fine for the route page; the modal is what matters for in-chat workflow.

### test/general conflict resolutions baked in this session

- **`scene.routes.ts` (fix/scene-summary-respects-agent-defaults vs upstream try/catch):** combined upstream's `try { … } catch (error) { logger.error … return reply.status(502) }` with the branch's sidecar-aware `model` variable (replacing the out-of-scope `conn.model` in HEAD's logger fields). Dropped `provider: conn.provider` from the structured log because `conn` doesn't exist when `utility.kind === "sidecar"` — kept just `{err, sceneChatId, model}`.
- **`lorebooks.routes.ts` (feat/world-info-interactive vs upstream generationTriggers):** kept BOTH `generationTriggers: resolveScanGenerationTriggers(chat?.mode)` (HEAD) and `entryStateOverrides, includeDisabled: true` (branch). Orthogonal options.
- **`lorebook/index.ts` (feat/world-info-interactive vs upstream generationTriggers):** combined HEAD's `generationTriggers?: string[]` option with branch's `pinned` field on `entryStateOverrides` and the `includeDisabled?: boolean` option. All three live together in the options type now.

### LM Studio Qwen3-VL prompt template gotcha (LM Studio side, not Marinara)

Not Marinara-specific but worth a note for future debugging of local-sidecar / LM Studio errors: **MLX Jinja runtime in LM Studio doesn't faithfully execute all Jinja2 constructs.** Specifically, `messages[::-1]` reverse-slice and namespace mutation inside nested `{%- if %}` blocks can silently fail. Symptom: a template's reverse-walk loop (e.g. Qwen3's `last_query_index` finder) leaves `multi_step_tool=true` and trips a `raise_exception('No user query found in messages.')` even when a user message exists.

Fix on the LM Studio side: delete the raise (preserves vision/tool support), OR swap to the canonical non-VL template (loses vision). User landed on the delete-the-raise option for a Qwen3-VL heretic model and it works.

If a user reports "LM Studio test message works but real chat fails," check whether the conversation starts with an assistant turn (character greeting) — that's the trigger.

## Critical learnings from previous sessions (still relevant)

### Server-side scan / utility-task issues

- **Empty-chat early return hid CONST entries.** `lorebook-scan` had `if (!chatMessages.length) return reply.send({...empty})` — meant CONST entries (which activate by definition, no message needed) didn't appear in the World Info panel until the user sent something. Fixed (now PR'd).
- **Sidecar maxTokens clamp via `Math.min`** truncated every utility task (scene-conclude, day/week summary, agents) to whatever the user had configured for chat snappiness. The fix evolved through several framings; final answer is `Math.max(requestedMaxTokens ?? 0, config.maxTokens)`: caller's value is a task-specific floor, user's config is their preferred ceiling, combine with max.
- **Scene-conclude didn't honour `LOCAL_SIDECAR_CONNECTION_ID`.** `chats.routes.ts /generate-summary` had the special-case; `scene.routes.ts` didn't. Fix folded into `fix/scene-summary-respects-agent-defaults`.
- **Hardcoded prompt-level constraints trump maxTokens.** The scene-conclude prompt said "max 200 words" — bumping maxTokens to 8192 had no effect on output length because the model honoured the prompt instruction. Length is driven by the prompt, not by the token ceiling. The token ceiling is just a safety net.

### Recurrent merge-conflict workaround

- Two fork branches both adding adjacent lines to `shared/src/index.ts` (each adding an `export * from "./types/X.js"`) caused the conflict to recur on every `rebuild-integrations.sh` run.
- **Fix**: rebase the dependent branch on top of the earlier one. The dependent branch's history then contains the earlier branch's commit; when test/general merges them in order, the second merge has nothing to conflict with.
- Watch out for **conflict markers staged into the rebase commit**. If you `git add` after a conflict resolution without verifying the file is marker-free, you can land a commit with `<<<<<<<` literally in the source. Saw this once; landed a follow-up "fix: remove stray conflict markers" commit.

### The orphan-branch pattern for fork tooling

- Tooling files (scripts, claude/) want to be visible on every branch the user works on. Tracking on every branch is misery; tracking on one branch makes them disappear on others.
- Solution: keep them **untracked in the main worktree** (survives checkout) and back them up to an **orphan branch** in a sibling worktree.
- Bootstrap on a fresh clone: `git fetch origin fork/tooling && git worktree add ../Marinara-tooling fork/tooling`, then `cp` the files into the main worktree.

### Fork-mergeability via additive files (still holding)

The pattern's now used for four features:

- `WorldInfoPanel.tsx` (its own file in `chat/ChatRoleplay/`)
- `LorebookEntryEditor.tsx` (extracted from route-level editor)
- `chat/ChatRoleplay/SummaryButton.tsx` + `SummaryDialog.tsx` (refactor/summary-dialog)
- `chat/ChatRoleplay/EndSceneDialog.tsx` (feat/scene-conclude-preview)
- `chat/ChatRoleplay/AuthorNotesPanel.tsx` (feat/author-note-fragments)

For new opinionated UI work: **prefer creating a new file** in `chat/ChatRoleplay/` over editing an existing core file in-place. Surface's lazy-import path becomes the single one-line touch on upstream code.

## Open questions / next moves

### Active focus next session: End Scene Dialog v2

- v1 (committed on `feat/scene-conclude-preview`) gives preview/edit/regenerate/commit. Tabs (Configure / Result), collapsible system prompt, split scene-transcript / instructions. Working and tested.
- **v2 plans live in `claude/feature-ideas.md`** — read that file FIRST when starting the End Scene v2 work. Highlights:
  - Replace the wasted scene-transcript textarea (user already sees the scene behind the dialog) with **stats / context / guidance** (length classification, token-budget meter, length presets, focus chips).
  - **Second-pass refinement** — after generation, free-text "what would you change?" + quick-fix buttons → server takes prior summary + nudge as additional context.
  - Diff view between passes.
- Architecture: `/api/scene/conclude/preview` already takes any combination of overrides. Most v2 surface is just populating the dialog with smarter content. The structural addition is `priorSummary?: string` and `refinementInstruction?: string` on the request.

### PR queue (when wait-for-engagement opens up)

Do them ONE AT A TIME. Recommended order (smallest, most uncontroversial first):

1. `fix/google-provider-thinking-budget` (high-impact Gemini fix; was paired with no-candidates-crash, may need order rethought)
2. `fix/google-provider-no-candidates-crash`
3. `fix/conversation-default-preset` (one-file client fix)
4. `fix/character-memories-recency-cap` (one-file server fix)
5. `fix/sidecar-honour-explicit-maxtokens` (one-file server fix; the `Math.max` reframe)
6. `fix/scene-summary-respects-agent-defaults` (utility-task chain + sidecar sentinel — bigger change)
7. `fix/agents-panel-enable-toggle`
8. `feat/prompt-debug-dumps` (frame as "diagnostic aid", not "I need this")
9. `refactor/summary-dialog` (opinionated; discuss first or skip)

### Architecture tour status

- ✅ Generation pipeline
- ✅ Agent system
- ⚠️ Chat modes (partial — conversation done; group/swipe model + game internals pending)
- ❌ Sidecar / local inference
- ❌ Data model

### Refactor-candidate list (post-bug-fix-PRs)

- Consolidate the three lorebook injection sites in `generate.routes.ts` (PR #225 deferred follow-up).
- The `enabled` flag on `agent_configs` doesn't actually gate generation — generation iterates `agentsStore.list()` and only filters by per-chat `activeAgentIds`, never checking `cfg.enabled`. One-line server fix.
- Day/week summarisation in `generate.routes.ts:714` is gated on `if (!presetId && chatMode === "conversation")` — same kind of "summary task gated wrong" bug as #225 fixed.
- Extract a shared utility-task connection resolver. `chats.routes.ts /generate-summary` and `scene.routes.ts resolveUtilityConnection` both implement the same chain (per-call → chat-summary agent → default-for-agents → chat conn) AND both special-case `LOCAL_SIDECAR_CONNECTION_ID`. Two near-identical copies. Extract to a helper returning `{ kind: "sidecar" } | { kind: "connection", conn, baseUrl }`.
- **Replace numeric "depth" with semantic intent** in Author's Notes (incl. fragments) and lorebook entries. Picker maps "Influence next reply / Recent context / Background detail / Ambient world" to depth bands. Storage stays numeric for upstream compatibility. Details in `claude/feature-ideas.md`.

## How to resume in a new session

Drop this file (and `claude/marinara-pr-workflow.md` for PR prep, `claude/feature-ideas.md` for the End Scene v2 work) into the new session as first-message context.

1. **Verify current state** with these commands at the start:
   ```bash
   git config --local --get user.email                # MUST be trade-mottoes-1g@icloud.com
   git remote -v                                      # confirm origin=Trade-Mottoes, pd=Pasta-Devs
   git fetch pd && git log main..pd/main --oneline    # any new upstream commits since 12b3ff8?
   git branch --list "fix/*" "feat/*" "refactor/*" "fork/*"   # see all branches
   git worktree list                                  # confirm Marinara-tooling worktree exists
   ```
   Baseline at end of previous session: `main` and `pd/main` both at **c247b2eb** (v1.6.0). If `git log main..pd/main` shows substantial commits (~hundreds), an upstream sync is pending — and the false-positive-conflict pattern documented above is very likely to bite. Read "Critical learnings from THIS session" first; consider the rebuild-and-bake budget before starting merges.

2. **Start any commit work with branch-check** (the wrong-branch-commit footgun from earlier sessions):
   ```bash
   git checkout <intended-branch>
   test "$(git branch --show-current)" = "<intended-branch>" || { echo "WRONG BRANCH"; exit 1; }
   ```

3. **For test-fixture work**: follow `claude/test-fixtures/lorebook-test.md`. Three chats now (lorebook isolation + summary-test pair). Run `./claude/test-fixtures/lorebook-test.sh status` to confirm fixtures.

4. **For dev-server with prompt dumps**: `MARINARA_DUMP_PROMPTS=1 LOG_LEVEL=debug pnpm dev:server`. Dumps land in `~/marinara-debug/`. `LOG_LEVEL=debug` also surfaces full LLM prompts/responses through Pino.

5. **Don't push `test/general`.** It's local-only by design.

6. **Force-pushes need explicit user authorisation each time.** The harness blocks them otherwise.

7. **Tooling files**: if working on `scripts/*.sh` or `claude/*.md`, remember to `./scripts/publish-tooling.sh` after to back them up to origin.

## Files to read first in a new session

In rough priority order:

1. `claude/session-handover.md` (this file)
2. `claude/marinara-pr-workflow.md` (the SOP, if doing PR work)
3. `claude/feature-ideas.md` (v2 designs, if doing feature work — especially End Scene v2)
4. `claude/test-fixtures/lorebook-test.md` (test plan)
5. `scripts/rebuild-integrations.sh` (current branches list — defines what test/general carries)
6. `CLAUDE.md` (top-level project notes)

Good luck. Don't commit to test/general.
