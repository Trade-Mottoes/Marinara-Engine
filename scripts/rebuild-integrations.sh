#!/usr/bin/env bash
set -euo pipefail

BRANCHES=(
  fix/google-provider-thinking-budget
  fix/google-provider-no-candidates-crash
  fix/agents-panel-enable-toggle
  fix/conversation-default-preset
  fix/character-memories-recency-cap
  fix/sidecar-honour-explicit-maxtokens
  fix/scene-summary-respects-agent-defaults
# fix/lorebooks-ignored-without-preset — MERGED UPSTREAM as PR #225 (now in pd/main)
  fix/lorebook-scan-skips-empty-chats
# refactor/author-notes-dialog — redundant with upstream's #239 (f15a9d5)
  refactor/summary-dialog
  feat/prompt-debug-dumps
  feat/world-info-interactive
  feat/scene-conclude-preview
  feat/author-note-fragments

)

INTEGRATION=test/general
UPSTREAM_REMOTE=pd
BASE="${UPSTREAM_REMOTE}/main"

git fetch "$UPSTREAM_REMOTE"

# `git branch -D` can't delete the branch we're currently on. Switch to
# main first so the delete + recreate works cleanly.
git checkout main 2>/dev/null || true
git branch -D "$INTEGRATION" 2>/dev/null || true
git checkout -b "$INTEGRATION" "$BASE"

for branch in "${BRANCHES[@]}"; do
  echo "━━━ Merging $branch ━━━"
  if ! git merge --no-ff --no-edit "$branch"; then
    echo "CONFLICT on $branch — resolve, then: git commit && re-run from next branch"
    echo ""
    echo "If conflicts recur on rebuilds, consider rebasing the branch onto"
    echo "the conflicting base (pd/main, or another fix branch) and force-pushing."
    exit 1
  fi
done

pnpm install
pnpm build:shared
echo "✅ Integration rebuilt. Run: pnpm dev (or whatever your dev command is)"
