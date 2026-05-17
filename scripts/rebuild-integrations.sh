#!/usr/bin/env bash
set -euo pipefail

BRANCHES=(
  fix/google-provider-thinking-budget
  fix/google-provider-no-candidates-crash
  fix/agents-panel-enable-toggle
  fix/conversation-default-preset
# fix/character-memories-recency-cap — DEFERRED 2026-05-17
#   Bug is still upstream (generate.routes.ts ~line 4076 date-filter), our fix
#   is still valuable, but the single-commit branch produces a ~300-line
#   false-positive conflict on every rebuild because upstream has reshuffled
#   the surrounding code extensively. Needs rebuild-and-bake on top of
#   current pd/main, same pattern as fix/agents-panel-enable-toggle.
  fix/sidecar-honour-explicit-maxtokens
  fix/scene-summary-respects-agent-defaults
# fix/lorebooks-ignored-without-preset — MERGED UPSTREAM as PR #225
# fix/lorebook-scan-skips-empty-chats — MERGED UPSTREAM as PR #245
# refactor/author-notes-dialog — redundant with upstream's #239 (f15a9d5)
# refactor/summary-dialog — RETIRED 2026-05-17
#   Upstream's PR #938 ("Feat/summary popover metadata") is actively
#   reshaping the same chat-Summary surface our refactor targeted. Combined
#   with the earlier #239 supersession, the marginal value of our
#   peek-then-edit-Modal handoff is now low. Branch + PR #213 can be closed.
# feat/prompt-debug-dumps — DEFERRED 2026-05-17
#   Same false-positive shape as character-memories: single-commit feature
#   producing ~550-line conflict on rebuild. Upstream's LOG_PRESET=
#   prompt-connections is a complementary mechanism (live log tailing vs
#   file dumps), not a replacement. Needs rebuild-and-bake when revived.
# feat/world-info-interactive — REBUILT 2026-05-17 (Phase A)
#   Was deferred earlier this session due to the 5-file conflict surface
#   against upstream's v1.6.0 lorebook work. Rebuilt from scratch on top
#   of current pd/main as 2 surgical commits (server pinned/includeDisabled
#   + scan-endpoint diagnostic flags + AN/Summary scan corpus; client
#   chat/ChatRoleplay/WorldInfoPanel.tsx with pin/disable/pills/regenerate/
#   stable-order). Phase B (LorebookEntryEditor extraction) and Phase C
#   (pencil quick-edit modal) deferred to follow-up sessions — the original
#   branch's modal-edit affordance is missing for now; users edit entries
#   via the lorebook editor route page in the meantime.
  feat/world-info-interactive
  feat/scene-conclude-preview
# feat/author-note-fragments — DEFERRED 2026-05-17
#   Single-feature branch (rebased on feat/scene-conclude-preview)
#   producing ~550-line false-positive conflict. Real feature with no
#   upstream equivalent; keep on bench, needs rebuild-and-bake when revived.
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
