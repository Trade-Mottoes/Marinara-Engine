# Marinara-Engine PR Workflow — Claude Code Handoff

**Author:** John (working as `Trade-Mottoes` on GitHub)
**Repo:** `~/ai/dev/Marinara-Engine` (the TM clone — `origin` points at `Trade-Mottoes/Marinara-Engine`)
**Status (as of late Apr 2026):**

- **#213** (`refactor/author-notes-dialog`) — submitted, NOT merged. Upstream took a different fix (#239) for the same save-race bug. The refactor branch's content is now redundant. Can be deleted at leisure.
- **#225** (`fix/lorebooks-ignored-without-preset`) — ✅ **MERGED upstream**. Permanently in `pd/main`; removed from integration script.
- Eight branches still on the bench (six bug-fixes + one tooling + one feature). Open one at a time.

This note is the standing operating procedure for handling each remaining branch.

---

## Background / context

The TM fork (`Trade-Mottoes/Marinara-Engine`) was created to contribute anonymously. Identity hygiene was sorted out in a previous session:

- All commits on all branches in this clone are authored by `Trade-Mottoes <trade-mottoes-1g@icloud.com>`.
- A pre-commit hook at `.git/hooks/pre-commit` enforces the email — any commit from this repo with a different identity will be refused.
- SSH alias `github-tm` is set up so `origin` (`git@github-tm:Trade-Mottoes/Marinara-Engine.git`) authenticates as Trade-Mottoes.
- `pd` remote points at upstream (`Pasta-Devs/Marinara-Engine`); `ja` remote points at the old (now-retired or to-be-retired) JA clone for reference only.

**Always verify identity before any commit:**

```bash
git config --local --get user.email   # MUST be: trade-mottoes-1g@icloud.com
```

If that returns anything else, STOP and ask the user. Do not commit.

---

## The eight remaining branches (PRs not yet opened)

Each is currently sitting on TM with TM-authored commits, ready for a PR-prep pass:

1. `refactor/summary-dialog` — paired refactor with author-notes; same peek/edit pattern applied to chat summaries.
2. `fix/agents-panel-enable-toggle` — restores UI path to enable/disable agents.
3. `fix/conversation-memory-and-sidecar-maxtokens` — three commits about conversation memory, default presets, and local sidecar maxTokens handling.
4. `fix/google-provider-thinking-budget` — Gemini thinking tokens no longer silently consume the caller's `maxTokens` budget.
5. `fix/google-provider-no-candidates-crash` — non-streaming Gemini response parser no longer crashes when `candidates` is absent.
6. `fix/scene-summary-respects-agent-defaults` — scene/conclude respecting default-for-agents, plus skipping disabled chat-summary agent.
7. `fix/lorebook-scan-skips-empty-chats` — scan endpoint had an early return for chats with zero messages, hiding CONST entries until the user sent something. Three-line fix: drop the early return.
8. `feat/prompt-debug-dumps` — opt-in `MARINARA_DUMP_PROMPTS=1` env flag that writes each fully-assembled prompt to `~/marinara-debug/`. Off by default; zero overhead when unset. Useful as a diagnostic across all the bug-fix work.

**Local-only / not for PR submission:**

- `feat/world-info-interactive` — large UI feature branch (Active World Info panel rewrite with pin/disable per-chat overrides, MATCH/PINNED/CONST letter pills, draft-aware regen, inline entry-edit modal, plus extractions of `WorldInfoPanel` and `LorebookEntryEditor` into dedicated files). Single squashed commit (`cab53c9`) sitting on top of `pd/main`. The maintainer's vision for this area isn't likely to align — keep this in the fork and live with the rebase tax. The architectural pieces (component extractions, separate file for `WorldInfoPanel`) make fork-merge sustainable.

(`fix/lorebooks-ignored-without-preset` was item 7 — opened as PR #225.)

**Do them one at a time.** Wait for the maintainer to respond to PR #213 before opening more — their engagement style on the first PR informs how many to send and how detailed to make subsequent descriptions. Don't queue PRs in parallel.

---

## Per-branch workflow

For each branch, the workflow is:

1. **Sync with upstream** (in case PD has moved on)
2. **Review the commits' content** with John, decide what's PR-worthy
3. **Strip justification comments** from the source files (keep present-invariant comments, drop historical rationale)
4. **Verify the build** with `pnpm lint && pnpm build`
5. **Squash** into one commit with a clean fix-style commit message
6. **Force-push** to TM
7. **Verify on GitHub** — one TM-authored commit, correct files, no surprises
8. **John opens the PR in his browser** (TM-logged-in profile) — Claude Code drafts the title and description for him to paste

### Step 1 — Sync with upstream

```bash
cd ~/ai/dev/Marinara-Engine

# Make sure we know about any new upstream activity
git fetch pd

# Are we behind?
git log main..pd/main --oneline   # if non-empty, PD has moved on

# If behind, fast-forward main and push
git checkout main
git merge --ff-only pd/main
git push origin main
```

If the fast-forward produces conflicts (which it shouldn't because main is just a mirror), STOP and ask John.

### Step 2 — Review commits with John

```bash
git checkout <branch-name>
git log main..HEAD --format='%h %an <%ae>%n%s%n%n%b'
git diff main..HEAD --stat
```

Show John the commits and the files changed. Confirm:
- All commits are TM-authored
- The set of changed files makes sense for the stated fix
- Nothing accidental got swept in

If a branch has multiple commits, that's fine — they'll be squashed into one in step 5.

### Step 3 — Strip justification comments

This is judgement work, not mechanical. Read each component file in the branch's diff and identify:

**KEEP comments that describe live invariants** future maintainers need:
- "Sync draft from props only when NOT dirty — lets external edits land on first view while respecting pending user edits."
- "isDirty intentionally excluded — effect runs on external prop changes only." (paired with eslint-disable)

**REMOVE comments that justify the fix against the old behaviour** — those belong in the commit message, not the source:
- Long blocks explaining why a refactor was needed
- "This was previously X, now it's Y because..." narratives
- Comments that say "mirrors SummaryDialog" or "matches the pattern used elsewhere" — describe what the code does, not its lineage
- JSDoc that re-litigates an architectural decision
- Inline JSX comments that describe what the next block does in obvious terms

**REMOVE stale comments** that contradict the current code (e.g. "committed editing with autosave" when the code now uses Save/Cancel).

**REPLACE long JSDoc blocks** with one-line summaries:
- Bad: 6-line block explaining the component's role in the architecture
- Good: `/** Read-only preview of X. Hands off to Y for edits. */`

For eslint-disable lines, always add a brief reason:
- Bad: `// eslint-disable-next-line react-hooks/exhaustive-deps`
- Good: `// isDirty intentionally excluded — effect runs on external prop changes only.\n// eslint-disable-next-line react-hooks/exhaustive-deps`

Show John the proposed strips before applying them — he has strong views on this and will catch ones that should stay.

### Step 4 — Verify the build

```bash
pnpm lint && pnpm build
```

If either fails, STOP. Surface the error, don't try to "fix" it without John.

### Step 5 — Squash into one commit

Stage and commit the comment strip first:

```bash
git add <files-modified>
git commit -m "chore: strip justification comments pre-squash"
```

The pre-commit hook will reject it if identity is wrong — that's the safety net working.

Then squash everything on the branch into one commit:

```bash
git reset --soft main
git commit -F - <<'EOF'
fix(<area>): <one-line summary of what bug is fixed>

Repro: <how to trigger the bug as a user>

Root cause: <brief technical explanation>

Fix: <what the change does, in 1-3 paragraphs or a bulleted list>

User-visible result: <what changes from the user's perspective>
EOF
```

The commit message template is loose — for small single-file fixes a one-paragraph message is fine. The author-notes commit was unusually long because the architectural change warranted it. Don't pad messages to look impressive; match length to substance.

Verify exactly one commit:

```bash
git log main..HEAD --format='%h %an <%ae>%n%s%n'
```

### Step 6 — Force-push

```bash
git push --force-with-lease origin <branch-name>
```

`--force-with-lease` (not `--force`) — refuses the push if someone else has pushed since your last fetch. Belt-and-braces for a solo fork but the right habit.

### Step 7 — Verify on GitHub

Ask John to load `https://github.com/Trade-Mottoes/Marinara-Engine/commits/<branch-name>` in his TM browser profile and confirm:
- One commit, TM-authored, TM avatar (not grey unknown)
- Commit message renders correctly
- File changes match expectation

### Step 8 — Draft the PR submission

Claude Code drafts; John submits in browser.

**PR title:** match the commit message subject (e.g. `fix(client): X` or `refactor(client): Y`).

**PR description template:**

```markdown
## The bug
<vivid problem statement — what does the user experience>

**Repro:** <step-by-step>

## Root cause
<technical explanation of why it happens>

## Fix
<what was changed, structured as bullets if multiple components touched>

## User-visible result
<what's better now>

## Testing
- `pnpm lint && pnpm build` pass.
- <any manual verification steps>
```

For trivial single-line fixes, a short PR description is fine — one paragraph stating bug + cause + fix.

**Crucial reminder for John:** when opening the PR via `https://github.com/Trade-Mottoes/Marinara-Engine/pull/new/<branch-name>`, double-check:
- **base repository:** `Pasta-Devs/Marinara-Engine` (NOT Trade-Mottoes)
- **base branch:** `main`
- **head:** Trade-Mottoes/Marinara-Engine, branch name

The default behaviour usually gets this right but it's been wrong before in similar setups. Worth eyeballing.

Also: leave "Allow edits from maintainers" CHECKED.

---

## Things to absolutely not do

- **Do not push to `ja`** — that's the old JA clone, retired but still there for reference.
- **Do not run `git filter-repo`** without explicit go-ahead from John. The history is already clean; only run it if something has gone wrong with identity.
- **Do not open multiple PRs in parallel** — wait for #213 verdict.
- **Do not commit if `git config --local --get user.email` returns anything other than `trade-mottoes-1g@icloud.com`.** The pre-commit hook should catch this but verify before committing anyway.
- **Do not edit `~/.gitconfig`** — all identity setup is local to this repo.

---

## Stylistic preferences (John)

- **Prose paragraphs preferred over bullet-heavy structure** in PR descriptions. Bullets are for genuine lists.
- **Vivid problem statements** — "Whether the save takes is in the lap of the gods" landed well in #213; humour and concrete user pain beat dry technical descriptions.
- **Frame as user harm, not architectural opinion** — "users lose work" beats "the pattern is wrong" when arguing for a UX change.
- **Concise commit messages for simple fixes**, longer only when an architectural change genuinely needs explanation.
- **Don't editorialise in code comments.** John's stance: once the fix is merged, the code "just is" — comments that justify history don't belong.

---

## Future refactor candidates (post-bug-fix-PRs)

These are larger, lower-priority refactors that the bug-fix work has surfaced. Don't open them as PRs while the seven branches above are still in flight — they'd dilute reviewer attention. Worth queuing for after the bug-fixes land.

### Consolidate the three lorebook injection sites

`generate.routes.ts` currently has three near-identical inline copies of "scan lorebooks → splice `<lore>` system message → inject depth entries":

1. Conversation mode (~line 1912)
2. Roleplay/visual-novel preset-less mode (~line 1950, added by `fix/lorebooks-ignored-without-preset`)
3. Game mode (~line 2743)

The `fix/lorebooks-ignored-without-preset` PR deliberately keeps the third copy inline rather than refactor, to keep the bug-fix narrow. Once that PR lands, a follow-up should extract the three into a single `injectLorebookContent(finalMessages, ctx, options)` helper. Each call site differs only in *where* the `<lore>` block is inserted (before first user message vs appended to system prompt) and that's expressible as a config option. The preset-driven path uses the assembler and stays as-is.

This is also a good moment to standardise behaviour across modes — the conversation and roleplay copies splice as a system message; the game copy appends to the GM system prompt. Picking one consistent strategy would reduce surprise.

---

## Reference: the author-notes PR (#213) for tone/style

The first PR is at `https://github.com/Pasta-Devs/Marinara-Engine/pull/213`. Use it as a reference for:
- PR description structure
- Commit message length and tone for substantive changes
- The peek/edit framing if `refactor/summary-dialog` is the next branch (since they're paired)

---

## If anything goes wrong

The recoverable state is: `git reflog` shows everything, JA clone still exists locally, TM remote can be force-pushed. Any single mistake on a branch is fixable by:

```bash
git reflog                            # find the SHA before the mistake
git reset --hard <sha>                # restore branch to that state
git push --force-with-lease origin <branch>   # update remote to match
```

If the mistake is bigger or unclear, STOP and ask John before doing anything irreversible. The cost of a careful pause is minutes; the cost of a contaminated branch is much more.
