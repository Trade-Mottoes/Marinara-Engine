#!/usr/bin/env bash
# Publish the live tooling files from the main Marinara-Engine worktree
# into the fork/tooling worktree, then commit and push.
#
# Run this from the main Marinara-Engine worktree (anywhere inside it):
#   ./scripts/publish-tooling.sh ["commit message"]
#
# Does NOT touch your current branch state — the tooling-branch updates
# happen in a sibling worktree at ../Marinara-tooling.
#
# Idempotent: if there are no changes, exits 0 without committing.

set -euo pipefail

MAIN_WORKTREE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLING_WORKTREE="${MAIN_WORKTREE%/Marinara-Engine}/Marinara-tooling"

if [[ ! -d "$TOOLING_WORKTREE" ]]; then
  echo "Tooling worktree not found at: $TOOLING_WORKTREE" >&2
  echo "" >&2
  echo "First-time bootstrap:" >&2
  echo "  cd $MAIN_WORKTREE" >&2
  echo "  git fetch origin fork/tooling" >&2
  echo "  git worktree add ../Marinara-tooling fork/tooling" >&2
  exit 1
fi

if [[ ! -f "$MAIN_WORKTREE/scripts/rebuild-integrations.sh" ]]; then
  echo "scripts/rebuild-integrations.sh not found in main worktree." >&2
  echo "Are you running from the right directory?" >&2
  exit 1
fi

# Copy tooling files. cp -p preserves mode/timestamps so file diffs reflect
# real content changes only.
cp -p "$MAIN_WORKTREE/scripts/rebuild-integrations.sh"  "$TOOLING_WORKTREE/scripts/"
cp -p "$MAIN_WORKTREE/scripts/snapshot-data.sh"         "$TOOLING_WORKTREE/scripts/"
cp -p "$MAIN_WORKTREE/scripts/publish-tooling.sh"       "$TOOLING_WORKTREE/scripts/"

mkdir -p "$TOOLING_WORKTREE/claude/test-fixtures"
cp -p "$MAIN_WORKTREE/claude/session-handover.md"        "$TOOLING_WORKTREE/claude/"
cp -p "$MAIN_WORKTREE/claude/marinara-pr-workflow.md"    "$TOOLING_WORKTREE/claude/"
cp -p "$MAIN_WORKTREE/claude/feature-ideas.md"           "$TOOLING_WORKTREE/claude/"
cp -p "$MAIN_WORKTREE/claude/test-fixtures/lorebook-test.sh" "$TOOLING_WORKTREE/claude/test-fixtures/"
cp -p "$MAIN_WORKTREE/claude/test-fixtures/lorebook-test.md" "$TOOLING_WORKTREE/claude/test-fixtures/"
cp -p "$MAIN_WORKTREE/claude/test-fixtures/verify-lore.sh"   "$TOOLING_WORKTREE/claude/test-fixtures/"

# Commit + push (only if anything actually changed).
cd "$TOOLING_WORKTREE"
if [[ -z "$(git status --porcelain)" ]]; then
  echo "No changes to publish."
  exit 0
fi

git add -A
MSG="${1:-update tooling: $(date -u +%Y-%m-%dT%H:%MZ)}"
git commit -m "$MSG"
git push origin fork/tooling
echo ""
echo "✅ Published. Updated files:"
git diff HEAD~1 HEAD --name-only | sed 's/^/  /'
