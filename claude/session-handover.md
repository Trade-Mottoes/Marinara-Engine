# Marinara-Engine — Session Handover

Most recent session: late Apr 2026. The state of the world for the next Claude.

## Repo orientation

- **Working dir:** `~/ai/dev/Marinara-Engine`
- **Remotes:** `origin` → `Trade-Mottoes/Marinara-Engine` (your fork, anonymous identity); `pd` → `Pasta-Devs/Marinara-Engine` (upstream)
- **Identity guard:** pre-commit hook enforces `trade-mottoes-1g@icloud.com`. Always check `git config --local --get user.email` before any commit.
- **Workflow doc:** `claude/marinara-pr-workflow.md` — the canonical SOP for PR prep.

## Branch state at end of session

**Merged upstream (permanent wins):**

- **PR #225** — `fix/lorebooks-ignored-without-preset` ✅ in `pd/main`. Branch removed from integration script.

**Open / inactive:**

- **PR #213** — `refactor/author-notes-dialog` — opened but not merged. Upstream landed a different save-race fix (#239). Our branch's content is now redundant. Can be deleted at leisure.

**On bench (not yet PR'd, ready when you are):**

```
fix/google-provider-thinking-budget          (high-impact Gemini fix, narrow)
fix/google-provider-no-candidates-crash      (defensive parser hardening)
fix/agents-panel-enable-toggle               (restores UI for enabling agents)
fix/conversation-memory-and-sidecar-maxtokens (3 separate fixes)
fix/scene-summary-respects-agent-defaults    (utility-task connection routing)
fix/lorebook-scan-skips-empty-chats          (3-line fix, easy win)
refactor/summary-dialog                      (paired with author-notes refactor)
feat/prompt-debug-dumps                      (opt-in diagnostic, debug aid)
```

**Local-only (forked feature, not for upstream submission):**

- **`feat/world-info-interactive`** — single squashed commit `cab53c9` on top of fresh `pd/main`. Carries:
  - Enhanced Active World Info panel (pin/disable per-chat overrides, C/P/M letter pills, draft-aware regen, inline entry-edit modal)
  - `WorldInfoPanel.tsx` extracted to its own file (fork-mergeability)
  - `LorebookEntryEditor.tsx` extracted as reusable form (~530 lines pulled out of `LorebookEditor.tsx`)
  - Server-side scan endpoint enhancements (union of activated + overridden, `isInjecting` / `scannerActivated` / `keywordMatched` flags)

## Tooling built this session

`scripts/`:
- **`rebuild-integrations.sh`** — wipes `test/general`, rebuilds from `pd/main` + the listed branches. Run after fetching upstream or editing any branch. Auto-switches off the integration branch before delete to avoid the obvious foot-gun.
- **`snapshot-data.sh`** — point-in-time snapshots of the chat DB + media (~140MB each, vs 10GB before). Commands: `snap [label]`, `restore <name>`, `restore-latest` / `rl`, `list`, `prune [keep-N]`, `teardown`. Snapshots live at `~/marinara-snapshots/`. Each restore auto-takes a `-prerestore` safety snapshot.

`claude/test-fixtures/`:
- **`lorebook-test.sh`** — clean-room test fixture (4 lorebook entries with invented vocabulary so the model can't fake answers, one Test Steward character, one preset-less roleplay chat). Commands: `setup`, `reset-chat` (clear messages, keep fixtures — fast inner loop), `reset` (full teardown+setup), `teardown`, `status`. **Important**: SQLite CLI doesn't enforce FKs by default; the script enables `PRAGMA foreign_keys = ON` and does explicit dependency-ordered deletes.
- **`lorebook-test.md`** — test plan with expected answers (currency=glints, ruler=Marshal Brunnig, etc.).
- **`verify-lore.sh`** — watches `~/marinara-debug/` for the next fresh prompt dump and reports whether `<lore>` reached the prompt. Eliminates the stale-file confusion of `ls -t`.

## Critical learnings from this session

### Wrong-branch commits

I committed to `test/general` instead of `feat/world-info-interactive` **four times** in this session because the rebuild script switches branches at the end. Mitigation in this session was a `test "$(git branch --show-current)" = "feat/..."` guard before each commit. **For the next session**: either bake that guard into a wrapper script, OR teach the rebuild script to switch back to the calling branch after rebuild. Treat any commit on `test/general` (which is meant to be ephemeral) as suspicious.

### The rebase tax is real but tractable

When upstream merged #225 + #239, the `feat/world-info-interactive` branch's history (which carried our redundant save-race fix as its base) couldn't replay cleanly. Recovery path used:

1. `git rebase --abort` to back out of partial state
2. `git tag feat-pre-rebase HEAD` to snapshot the desired tree
3. `git reset --hard pd/main`
4. `git checkout feat-pre-rebase -- <files>` to overlay the additive files
5. Manual surgery on `ChatRoleplayPanels.tsx` (take pd/main's, remove our `WorldInfoPanel` + helpers)
6. Surgical edit of one-line lazy-import path in `ChatRoleplaySurface.tsx`
7. Single squashed commit, `git push --force-with-lease`

Granular history was lost; fork-purpose accepts that. The squash is much cheaper to maintain going forward.

### Fork-mergeability via additive files

Two extractions performed for the explicit purpose of making future upstream merges painless:

- `WorldInfoPanel.tsx` — the entire enhanced panel lives in its own file. Upstream's `ChatRoleplayPanels.tsx` (Author's Notes only) can evolve freely without touching our work.
- `LorebookEntryEditor.tsx` — the form body extracted from the route-level `LorebookEditor.tsx`. Both the route and the new modal use the same component; future upstream changes to the form layout auto-apply to both contexts.

Pattern for the next session: any new opinionated UI work, **prefer creating a new file** over editing an existing core file in-place.

## Open questions / next moves

- **Open the bug-fix PRs.** All eight bench branches are PR-ready. Recommended order (smallest, most uncontroversial first):
  1. `fix/lorebook-scan-skips-empty-chats` (3 lines)
  2. `fix/google-provider-thinking-budget` (the high-impact Gemini fix; was paired with no-candidates-crash, may need order rethought)
  3. `fix/google-provider-no-candidates-crash`
  4. `fix/scene-summary-respects-agent-defaults`
  5. `fix/agents-panel-enable-toggle`
  6. `fix/conversation-memory-and-sidecar-maxtokens`
  7. `feat/prompt-debug-dumps` (frame as "diagnostic aid for the next contributor", not "I need this")
  8. `refactor/summary-dialog` (opinionated; discuss first or skip)

- **Wait-for-engagement rule still applies.** Don't queue PRs in parallel. Current open count is 1 (#213, languishing). Open one new PR, watch for response, decide next.

- **Architecture tour status:**
  - ✅ Generation pipeline
  - ✅ Agent system
  - ⚠️ Chat modes (partial — conversation done; group/swipe model + game internals pending)
  - ❌ Sidecar / local inference
  - ❌ Data model
  - The user explicitly wanted to come back to these after the bug-fix work plateaus.

- **Refactor-candidate list (post-bug-fix-PRs):**
  - Consolidate the three lorebook injection sites in `generate.routes.ts` into one helper (the PR #225 commit's deferred follow-up).
  - The `enabled` flag on `agent_configs` doesn't actually gate generation — generation iterates `agentsStore.list()` and only filters by per-chat `activeAgentIds`, never checking `cfg.enabled`. One-line server fix.
  - Day/week summarisation in `generate.routes.ts:714` is gated on `if (!presetId && chatMode === "conversation")` — same kind of "summary task gated wrong" bug as #225 fixed. Bigger refactor.
  - Extract a shared utility-task connection resolver. `chats.routes.ts /generate-summary` and `scene.routes.ts resolveUtilityConnection` both implement the same chain (per-call → chat-summary agent → default-for-agents → chat conn) AND both have to special-case `LOCAL_SIDECAR_CONNECTION_ID`. Two near-identical copies. Extract to a helper that returns `{ kind: "sidecar" } | { kind: "connection", conn, baseUrl }` and have both call sites use it. Noted while folding the sidecar-sentinel fix into `fix/scene-summary-respects-agent-defaults`.

## How to resume in a new session

Drop this file (and `claude/marinara-pr-workflow.md`) into the new session as a first-message context and the new Claude will have everything they need. Specifically:

1. **Verify current state** with these commands at the start:
   ```bash
   git config --local --get user.email                # MUST be trade-mottoes-1g@icloud.com
   git remote -v                                      # confirm origin=Trade-Mottoes, pd=Pasta-Devs
   git fetch pd && git log main..pd/main --oneline    # any new upstream commits?
   git log feat/world-info-interactive --oneline -3   # confirm cab53c9 still on top
   git branch --list "fix/*" "feat/*" "refactor/*"    # see all bench branches
   ```

2. **Start any commit work with branch-check:**
   ```bash
   git checkout <intended-branch>
   test "$(git branch --show-current)" = "<intended-branch>" || { echo "WRONG BRANCH"; exit 1; }
   ```

3. **For test-fixture work**: follow `claude/test-fixtures/lorebook-test.md`. The fixture is in the live DB (run `./claude/test-fixtures/lorebook-test.sh status` to confirm).

4. **For dev-server with prompt dumps**: `MARINARA_DUMP_PROMPTS=1 pnpm dev:server`. Dumps land in `~/marinara-debug/`.

5. **Don't push `test/general`.** It's local-only by design.

6. **Force-pushes need explicit user authorisation each time.** The harness blocks them otherwise.

## Files to read first in a new session

In rough priority order:

1. `claude/session-handover.md` (this file)
2. `claude/marinara-pr-workflow.md` (the SOP)
3. `claude/test-fixtures/lorebook-test.md` (test plan)
4. `scripts/rebuild-integrations.sh` (current branches list — defines what test/general carries)
5. `CLAUDE.md` (top-level project notes)

Good luck. Don't commit to test/general.
