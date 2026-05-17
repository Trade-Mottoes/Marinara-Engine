#!/usr/bin/env bash
set -euo pipefail

BRANCHES=(
  fix/google-provider-thinking-budget
  fix/google-provider-no-candidates-crash      # REBASED 2026-05-17 onto current pd/main
  fix/agents-panel-enable-toggle               # REBASED 2026-05-07 onto pd/main 12b3ff8; small conflicts still re-fire as upstream churns area
  fix/conversation-default-preset
  fix/character-memories-recency-cap           # REBUILT 2026-05-17 — surgical recency-cap re-applied to current generate.routes.ts
  fix/sidecar-honour-explicit-maxtokens
  fix/scene-summary-respects-agent-defaults    # REBASED 2026-05-17 onto current pd/main
# fix/lorebooks-ignored-without-preset — MERGED UPSTREAM as PR #225
# fix/lorebook-scan-skips-empty-chats — MERGED UPSTREAM as PR #245
# refactor/author-notes-dialog — redundant with upstream's #239 (f15a9d5)
# refactor/summary-dialog — RETIRED 2026-05-17
#   Upstream's PR #938 ("Feat/summary popover metadata") is actively
#   reshaping the same chat-Summary surface our refactor targeted. Combined
#   with the earlier #239 supersession, the marginal value of our
#   peek-then-edit-Modal handoff is now low. Branch + PR #213 can be closed.
  feat/prompt-debug-dumps                      # REBUILT 2026-05-17 — surgical dumper re-applied; complementary to upstream's LOG_PRESET=prompt-connections
  feat/world-info-interactive                  # REBUILT 2026-05-17 (Phase A) — pin/disable/pills/regenerate/stable-order, AN+Summary scan corpus, diagnostic flags. Phases B+C deferred.
  feat/scene-conclude-preview
  feat/author-note-fragments                   # REBUILT 2026-05-17 — fragments-based panel + compose service re-applied on current pd/main
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
