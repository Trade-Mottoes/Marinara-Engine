# fork/tooling — operator scripts and Claude session notes

This is a dedicated branch (orphan, no shared history with `pd/main` or the
codebase branches) that backs up the local-only tooling and operator notes
used to maintain the Trade-Mottoes fork of Marinara-Engine.

It exists so these files have a remote backup without polluting either the
upstream-mirror `main` or any of the `feat/*` / `fix/*` / `refactor/*` branches.

## Contents

```
scripts/
  rebuild-integrations.sh   Wipes test/general and rebuilds it from pd/main
                            plus the listed bench/fork branches. Run after
                            fetching upstream or editing any branch.
  snapshot-data.sh          Point-in-time snapshots of the chat DB + media.
                            Commands: snap [label], restore <name>,
                            restore-latest / rl, list, prune [keep-N], teardown.
  publish-tooling.sh        Helper that syncs the tooling files from the
                            main worktree into this one and commits.
                            Run from the main worktree.

claude/
  session-handover.md       State of the world for the next Claude session.
  marinara-pr-workflow.md   The PR-prep SOP (identity, comment-strip,
                            squash, force-push, draft).
  feature-ideas.md          Backlog of v2 ideas captured during sessions.
  test-fixtures/
    lorebook-test.sh        Clean-room lorebook + summary-pair fixture.
    lorebook-test.md        Test queries with expected answers.
    verify-lore.sh          Watch ~/marinara-debug/ and report whether
                            <lore> reached the next prompt.
```

Excluded by `.gitignore`: `.claude/` (Claude Code's per-project state) and
the snapshot output dir (lives at `~/marinara-snapshots/` by default).

## Working pattern

The files **live untracked in the main Marinara-Engine worktree** so they're
visible regardless of which branch is checked out. This branch is purely a
backup mirror, not the canonical edit surface.

To **sync changes** from the main worktree to this branch:

```bash
# From the main Marinara-Engine worktree:
./scripts/publish-tooling.sh
```

That script copies the live files in, commits, and pushes. It does NOT touch
your main worktree's branch state.

To **bootstrap on a fresh clone** of the fork:

```bash
# Clone the fork
git clone git@github-tm:Trade-Mottoes/Marinara-Engine.git
cd Marinara-Engine

# Pull the tooling branch into a sibling worktree
git fetch origin fork/tooling
git worktree add ../Marinara-tooling fork/tooling

# Copy tooling files into the main worktree (untracked there)
cp ../Marinara-tooling/scripts/rebuild-integrations.sh scripts/
cp ../Marinara-tooling/scripts/snapshot-data.sh scripts/
cp -r ../Marinara-tooling/claude .
chmod +x scripts/rebuild-integrations.sh scripts/snapshot-data.sh
chmod +x claude/test-fixtures/*.sh
```

## Why orphan, not a regular branch off pd/main?

A regular branch off `pd/main` would carry the entire codebase, drift behind
upstream over time, and risk merge confusion. The orphan branch holds only
the tooling files — small, focused, never needs rebasing.
