#!/usr/bin/env bash
# Watch for the next fresh prompt dump and report whether the lorebook
# injection happened. Eliminates the stale-file confusion of `ls -t`.
#
# Usage:
#   ./claude/test-fixtures/verify-lore.sh
#   # then send a message in the [Test] Lore Test chat
#   # the script reports on the very first dump newer than the moment you ran it.
#
# Options:
#   --timeout N   give up after N seconds (default 120)
#   --any-chat    don't filter to the lbtest fixture (useful for ad-hoc inspection)

set -euo pipefail

DUMP_DIR="${MARINARA_DUMP_DIR:-$HOME/marinara-debug}"
TIMEOUT=120
ANY_CHAT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout)   TIMEOUT="$2"; shift 2 ;;
    --any-chat)  ANY_CHAT=true; shift ;;
    -h|--help)   sed -n '2,/^$/p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *)           echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ ! -d "$DUMP_DIR" ]]; then
  echo "❌ Dump directory missing: $DUMP_DIR"
  echo "   Did you start the server with MARINARA_DUMP_PROMPTS=1 ?"
  exit 1
fi

T0=$(date +%s)
echo "→ Watching $DUMP_DIR for dumps newer than $(date -r "$T0" '+%H:%M:%S')"
echo "  Send a message in the [Test] Lore Test chat now."
echo "  (Ctrl-C to abort. Timeout: ${TIMEOUT}s.)"
echo ""

# Show server-side hint if MARINARA_DUMP_PROMPTS doesn't seem set
# (It's exported on the server-side, so we can't truly check — just remind.)

DEADLINE=$((T0 + TIMEOUT))
FRESH=""

while [[ $(date +%s) -lt $DEADLINE ]]; do
  # Find files newer than T0. -newer expects a file; we use a tempfile stamped at T0.
  STAMP=$(mktemp)
  touch -t "$(date -r "$T0" +'%Y%m%d%H%M.%S')" "$STAMP"
  CANDIDATE=$(find "$DUMP_DIR" -maxdepth 1 -name "*.json" -newer "$STAMP" -print 2>/dev/null | sort | tail -n1)
  rm -f "$STAMP"

  if [[ -n "$CANDIDATE" ]]; then
    if $ANY_CHAT; then
      FRESH="$CANDIDATE"
      break
    fi
    # Filter to the lbtest fixture
    if jq -e '.chatId == "lbtest-chat-roleplay"' "$CANDIDATE" > /dev/null 2>&1; then
      FRESH="$CANDIDATE"
      break
    fi
  fi
  sleep 1
done

if [[ -z "$FRESH" ]]; then
  echo "⏱  Timed out after ${TIMEOUT}s — no fresh dump appeared."
  echo "   Possible causes:"
  echo "   - MARINARA_DUMP_PROMPTS=1 wasn't set on the dev:server process"
  echo "   - You sent the message in a different chat (use --any-chat to disable filter)"
  echo "   - The server crashed before reaching the dump line — check its log"
  exit 2
fi

echo "✅ Fresh dump captured: $(basename "$FRESH")"
echo ""

echo "── Chat metadata ──"
jq '{chatId, chatMode, presetId, enableAgents, activeAgentIds, activeLorebookIds, messageCount}' "$FRESH"
echo ""

echo "── System message contents (first 600 chars each) ──"
jq -r '.messages | to_entries[] | select(.value.role=="system") | "[\(.key)] (\(.value.content | length) chars):\n\(.value.content[0:600])\n"' "$FRESH"
echo ""

if grep -q "<lore>" "$FRESH"; then
  echo "✅ <lore> block IS in the prompt — lorebook injection is active."
else
  echo "❌ <lore> block is NOT in the prompt — bug reproduced."
fi
