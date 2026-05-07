# Marinara-Engine — Session Handover

Most recent session: 2026-05-07. The state of the world for the next Claude.

Previous session: late Apr 2026 (work logged below the "Critical learnings" header still reflects that earlier work).

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

**Sync baseline:** `main` and `pd/main` both at **`12b3ff8`** (Pasta-Devs PR #485). Brought forward from `19e0713` this session — 157 upstream commits absorbed in one fast-forward.

**Merged upstream (permanent wins):**

- **PR #225** — `fix/lorebooks-ignored-without-preset` ✅ in `pd/main`. Branch removed.
- **PR #245** — `fix/lorebook-scan-skips-empty-chats` ✅ in `pd/main`. Branch removed; commented out of `rebuild-integrations.sh`.
- **PR #239 (upstream)** — landed an alternative author-notes save-race fix that supersedes our `refactor/author-notes-dialog`. Our branch is now redundant; commented out of `rebuild-integrations.sh`.

**In flight to upstream:**

- _(none — wait-for-engagement window is open, queue below is ready to draw from)_

**Open / inactive:**

- **PR #213** — `refactor/author-notes-dialog` — opened but not merged. Upstream landed a different save-race fix (#239). Redundant. Can be closed/deleted at leisure.

**On bench (not yet PR'd, ready when wait-for-engagement window opens):**

```
fix/google-provider-thinking-budget          (high-impact Gemini fix, narrow)
fix/google-provider-no-candidates-crash      (defensive parser hardening)
fix/agents-panel-enable-toggle               (restores UI for enabling agents — REBASED THIS SESSION onto pd/main 12b3ff8, force-pushed origin)
fix/conversation-default-preset              (stop auto-assigning preset to convo chats)
fix/character-memories-recency-cap           (don't drop memories after midnight)
fix/sidecar-honour-explicit-maxtokens        (Math.max semantics — see below)
fix/scene-summary-respects-agent-defaults    (utility-task chain + sidecar sentinel)
refactor/summary-dialog                      (paired with author-notes refactor)
feat/prompt-debug-dumps                      (opt-in diagnostic, debug aid)
```

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

## Critical learnings from THIS session (2026-05-06 — upstream sync)

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
   Baseline at end of previous session: `main` and `pd/main` both at **12b3ff8**. If `git log main..pd/main` shows commits, an upstream sync is pending — see "Critical learnings from THIS session" for the workflow that worked.

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
