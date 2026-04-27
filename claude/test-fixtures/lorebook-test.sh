#!/usr/bin/env bash
# Clean-room lorebook + summary test fixture.
#
# Sets up minimal, isolated test scenarios for verifying that lorebook
# entries actually reach the LLM prompt and that summary flows behave
# correctly. Uses invented vocabulary so the model cannot fake answers —
# if it says "glints", the lore was injected; if it confidently describes
# something not in the lore, it's confabulating.
#
# Three chats are created, all sharing the same character + lorebook:
#
#   1. [Test] Lore Test (no preset, no agents)
#      Lorebook-injection isolation: no messages, no link, no preset.
#
#   2. [Test] Summary Test — convo (linked)
#      conversation-mode chat with no preset (so the DM/auto-summary
#      path is enabled), linked to the scene chat below.
#
#   3. [Test] Summary Test — scene with steward
#      roleplay-mode chat with 4 seed messages mentioning lorebook
#      keywords. Linked back to the convo. Used for scene-conclude
#      summary testing.
#
# Idempotent: uses fixed IDs prefixed with `lbtest-`, so re-running this
# script refreshes the fixtures without creating duplicates. Seed scene
# messages are re-asserted via INSERT OR REPLACE, so user-added messages
# in the scene chat are preserved across re-runs (the seed messages
# aren't recreated as duplicates because they have fixed IDs).
#
# Usage:
#   ./claude/test-fixtures/lorebook-test.sh setup       # create / refresh fixtures
#   ./claude/test-fixtures/lorebook-test.sh reset-chat  # wipe messages from ALL test chats, re-seed scene
#   ./claude/test-fixtures/lorebook-test.sh reset       # full teardown + setup (wipe everything, recreate)
#   ./claude/test-fixtures/lorebook-test.sh teardown    # remove all fixtures (incl. messages)
#   ./claude/test-fixtures/lorebook-test.sh status      # show current state
#
# After setup, refresh the UI (or restart server) and pick the chat for
# what you're testing. Test queries for lorebook injection are in
# lorebook-test.md.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="$REPO_ROOT/packages/server/data/marinara-engine.db"

# Fixed IDs — prefix lets us identify fixtures cleanly on teardown.
LB_ID="lbtest-lorebook-001"
ENTRY_CONST_ID="lbtest-entry-const"
ENTRY_KEYWORD_ID="lbtest-entry-keyword"
ENTRY_MARSHAL_ID="lbtest-entry-marshal"
ENTRY_ECLIPSE_ID="lbtest-entry-eclipse"
CHAR_ID="lbtest-character"
CHAT_ID="lbtest-chat-roleplay"
CHAT_CONVO_ID="lbtest-chat-convo"
CHAT_SCENE_ID="lbtest-chat-scene"
MSG_1_ID="lbtest-msg-scene-1"
MSG_2_ID="lbtest-msg-scene-2"
MSG_3_ID="lbtest-msg-scene-3"
MSG_4_ID="lbtest-msg-scene-4"

NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# ── Character data (CharacterData V2 JSON blob) ──
read -r -d '' CHAR_DATA <<'JSON' || true
{
  "name": "Test Steward",
  "description": "A patient steward of the world Dolomar-9. Answers visitor questions plainly, factually, and without embellishment.",
  "personality": "Helpful, factual, concise. Never invents details. Will say 'I don't know' rather than guess.",
  "scenario": "You are a visitor to Dolomar-9 asking the steward about local customs and rules.",
  "first_mes": "Welcome to Dolomar-9. Ask whatever you need.",
  "mes_example": "",
  "creator_notes": "",
  "system_prompt": "",
  "post_history_instructions": "",
  "alternate_greetings": [],
  "tags": ["test"],
  "creator": "lbtest",
  "character_version": "1.0",
  "extensions": {}
}
JSON

# ── Lorebook content ──
read -r -d '' LORE_CONST <<'TXT' || true
World: Dolomar-9 (a tidally-locked moon orbiting the gas giant Brunhuld).
Currency: glints — small hexagonal silver coins, six glints to a sovereign.
Ruler: Marshal Brunnig the Eleventh, popularly called "the Quiet Marshal".
Calendar: the Twelve Tides — months are Storm-Tide, Mirror-Tide, Black-Tide, Salt-Tide, Drift-Tide, Hush-Tide, Bone-Tide, Grey-Tide, Sun-Tide, Wake-Tide, Long-Tide, and Final-Tide, in that order.
Forbidden topics: discussing the eclipse of 1284 in any public space carries a fine of forty glints.
TXT

read -r -d '' LORE_KEYWORD <<'TXT' || true
The Vermilion-7 Protocol was authored by Dr. Elara Mensch in the third year of Marshal Brunnig's rule. It governs the safe handling of crystalline cognition residue. Every encounter with such residue must be logged in a Vermilion Ledger within seven hours of contact, and a copy filed with the Hush-Tide Registrar before the next moonrise.
TXT

read -r -d '' LORE_MARSHAL <<'TXT' || true
Marshal Brunnig the Eleventh ascended in the Year of Three Frosts after the abdication of Marshal Eira-Anna. He is unmarried, keeps a household of seventeen, and is rumoured to dictate his daily correspondence to a clockwork scribe rather than speak it aloud. His official seal depicts a pale moth crossing a closed eye. Petitions are heard on Bone-Tide mornings only.
TXT

read -r -d '' LORE_ECLIPSE <<'TXT' || true
The Eclipse of 1284 lasted forty-one days and is said to have driven six members of the High Council to take their own lives. The Quiet Marshal's grandfather, then a junior clerk, vanished during it; he reappeared seven years later in a fishing village on the far side of the moon, claiming to have been "elsewhere" but unable to elaborate. The topic is forbidden in public squares and any mention in writing must be accompanied by the formal counter-phrase "may the dark stay buried".
TXT

# ── Seed scene messages (mention lorebook keywords so entries activate) ──
read -r -d '' MSG_1_CONTENT <<'TXT' || true
Welcome to Dolomar-9. Ask whatever you need.
TXT

read -r -d '' MSG_2_CONTENT <<'TXT' || true
Tell me about Marshal Brunnig — does he ever appear at the markets?
TXT

read -r -d '' MSG_3_CONTENT <<'TXT' || true
Marshal Brunnig the Eleventh, whom we call the Quiet Marshal, does not visit markets directly. He hears petitions on Bone-Tide mornings only, and his correspondence is dictated to a clockwork scribe rather than spoken aloud. If you need to address him, you would file through the Hush-Tide Registrar.
TXT

read -r -d '' MSG_4_CONTENT <<'TXT' || true
And what about the Vermilion-7 Protocol — does that come up at the markets?
TXT

# ── Commands ──

cmd_setup() {
  echo "→ Setting up clean-room lorebook test fixtures..."
  echo "  DB: $DB"

  # Stage the multiline blobs as temp files and load them via readfile().
  # Avoids the heredoc-quoting hell of embedding JSON/multiline text in SQL.
  local tmpdir
  tmpdir=$(mktemp -d)
  # Expand $tmpdir NOW (not at trap-fire time) — `local` makes it
  # out-of-scope by the time EXIT fires.
  trap "rm -rf '$tmpdir'" EXIT

  printf '%s' "$CHAR_DATA"     > "$tmpdir/char.json"
  printf '%s' "$LORE_CONST"    > "$tmpdir/const.txt"
  printf '%s' "$LORE_KEYWORD"  > "$tmpdir/keyword.txt"
  printf '%s' "$LORE_MARSHAL"  > "$tmpdir/marshal.txt"
  printf '%s' "$LORE_ECLIPSE"  > "$tmpdir/eclipse.txt"
  printf '%s' "$MSG_1_CONTENT" > "$tmpdir/msg1.txt"
  printf '%s' "$MSG_2_CONTENT" > "$tmpdir/msg2.txt"
  printf '%s' "$MSG_3_CONTENT" > "$tmpdir/msg3.txt"
  printf '%s' "$MSG_4_CONTENT" > "$tmpdir/msg4.txt"

  sqlite3 "$DB" <<EOF
-- Lorebook
INSERT OR REPLACE INTO lorebooks (
  id, name, description, category, scan_depth, token_budget,
  recursive_scanning, max_recursion_depth, character_id, chat_id,
  enabled, tags, generated_by, source_agent_id, created_at, updated_at
) VALUES (
  '$LB_ID',
  '[Test] Lorebook Test Fixture',
  'Clean-room test for verifying lorebook injection into prompts.',
  'test',
  2, 2048,
  'false', 3,
  NULL, NULL,
  'true',
  '["test"]',
  NULL, NULL,
  '$NOW', '$NOW'
);

-- CONST entry (always activates regardless of message content)
INSERT OR REPLACE INTO lorebook_entries (
  id, lorebook_id, name, content, keys, secondary_keys,
  enabled, constant, selective, selective_logic, probability, scan_depth,
  match_whole_words, case_sensitive, use_regex,
  position, depth, "order", role,
  sticky, cooldown, delay, ephemeral, "group", group_weight,
  locked, tag, relationships, dynamic_state, activation_conditions, schedule,
  prevent_recursion, embedding,
  created_at, updated_at
) VALUES (
  '$ENTRY_CONST_ID', '$LB_ID',
  'Dolomar-9 World Setting',
  CAST(readfile('$tmpdir/const.txt') AS TEXT),
  '[]', '[]',
  'true', 'true', 'false', 'and', NULL, NULL,
  'false', 'false', 'false',
  0, 4, 100, 'system',
  NULL, NULL, NULL, NULL, '', NULL,
  'false', 'test', '{}', '{}', '[]', NULL,
  'false', NULL,
  '$NOW', '$NOW'
);

-- Keyword-triggered entry (only activates when "vermilion" or "protocol" appears)
INSERT OR REPLACE INTO lorebook_entries (
  id, lorebook_id, name, content, keys, secondary_keys,
  enabled, constant, selective, selective_logic, probability, scan_depth,
  match_whole_words, case_sensitive, use_regex,
  position, depth, "order", role,
  sticky, cooldown, delay, ephemeral, "group", group_weight,
  locked, tag, relationships, dynamic_state, activation_conditions, schedule,
  prevent_recursion, embedding,
  created_at, updated_at
) VALUES (
  '$ENTRY_KEYWORD_ID', '$LB_ID',
  'The Vermilion-7 Protocol',
  CAST(readfile('$tmpdir/keyword.txt') AS TEXT),
  '["vermilion","protocol","Vermilion-7"]', '[]',
  'true', 'false', 'false', 'and', NULL, NULL,
  'false', 'false', 'false',
  0, 4, 100, 'system',
  NULL, NULL, NULL, NULL, '', NULL,
  'false', 'test', '{}', '{}', '[]', NULL,
  'false', NULL,
  '$NOW', '$NOW'
);

-- Keyword-triggered entry: ruler/marshal lore (multi-keyword, fires on common terms)
INSERT OR REPLACE INTO lorebook_entries (
  id, lorebook_id, name, content, keys, secondary_keys,
  enabled, constant, selective, selective_logic, probability, scan_depth,
  match_whole_words, case_sensitive, use_regex,
  position, depth, "order", role,
  sticky, cooldown, delay, ephemeral, "group", group_weight,
  locked, tag, relationships, dynamic_state, activation_conditions, schedule,
  prevent_recursion, embedding,
  created_at, updated_at
) VALUES (
  '$ENTRY_MARSHAL_ID', '$LB_ID',
  'The Quiet Marshal',
  CAST(readfile('$tmpdir/marshal.txt') AS TEXT),
  '["marshal","brunnig","ruler","quiet marshal"]', '[]',
  'true', 'false', 'false', 'and', NULL, NULL,
  'false', 'false', 'false',
  0, 4, 100, 'system',
  NULL, NULL, NULL, NULL, '', NULL,
  'false', 'test', '{}', '{}', '[]', NULL,
  'false', NULL,
  '$NOW', '$NOW'
);

-- Keyword-triggered entry: forbidden topic (the dark history surfaced via the CONST entry)
INSERT OR REPLACE INTO lorebook_entries (
  id, lorebook_id, name, content, keys, secondary_keys,
  enabled, constant, selective, selective_logic, probability, scan_depth,
  match_whole_words, case_sensitive, use_regex,
  position, depth, "order", role,
  sticky, cooldown, delay, ephemeral, "group", group_weight,
  locked, tag, relationships, dynamic_state, activation_conditions, schedule,
  prevent_recursion, embedding,
  created_at, updated_at
) VALUES (
  '$ENTRY_ECLIPSE_ID', '$LB_ID',
  'The Eclipse of 1284',
  CAST(readfile('$tmpdir/eclipse.txt') AS TEXT),
  '["eclipse","1284","may the dark stay buried"]', '[]',
  'true', 'false', 'false', 'and', NULL, NULL,
  'false', 'false', 'false',
  0, 4, 100, 'system',
  NULL, NULL, NULL, NULL, '', NULL,
  'false', 'test', '{}', '{}', '[]', NULL,
  'false', NULL,
  '$NOW', '$NOW'
);

-- Test character
INSERT OR REPLACE INTO characters (
  id, data, comment, avatar_path, sprite_folder_path, created_at, updated_at
) VALUES (
  '$CHAR_ID',
  CAST(readfile('$tmpdir/char.json') AS TEXT),
  '[test] clean-room lorebook test',
  NULL, NULL,
  '$NOW', '$NOW'
);

-- Test chat: roleplay mode, NO preset, agents disabled, lorebook activated.
-- Used for testing lorebook-injection in isolation (no linked convo, no
-- summarisation flow).
INSERT OR REPLACE INTO chats (
  id, name, mode, character_ids,
  group_id, persona_id, prompt_preset_id, connection_id,
  metadata, connected_chat_id, folder_id, sort_order,
  created_at, updated_at
) VALUES (
  '$CHAT_ID',
  '[Test] Lore Test (no preset, no agents)',
  'roleplay',
  '["$CHAR_ID"]',
  NULL, NULL, NULL, NULL,
  json_object(
    'activeLorebookIds', json_array('$LB_ID'),
    'enableAgents', json('false'),
    'activeAgentIds', json_array()
  ),
  NULL, NULL, 0,
  '$NOW', '$NOW'
);

-- Summary-test pair: a convo linked to an active RP scene with seed messages.
-- Convo is conversation-mode (no preset, so DM/auto-summary path is enabled).
-- Scene is roleplay-mode with the same character + lorebook so entries activate
-- against the seed messages. Bidirectional connected_chat_id linking matches
-- real-life usage.
-- Convo's metadata.activeSceneChatId tells the convo UI "there's a scene
-- running"; the scene's metadata.sceneStatus="active" + sceneOriginChatId
-- gates the End Scene affordance on the scene side.
INSERT OR REPLACE INTO chats (
  id, name, mode, character_ids,
  group_id, persona_id, prompt_preset_id, connection_id,
  metadata, connected_chat_id, folder_id, sort_order,
  created_at, updated_at
) VALUES (
  '$CHAT_CONVO_ID',
  '[Test] Summary Test — convo (linked)',
  'conversation',
  '["$CHAR_ID"]',
  NULL, NULL, NULL, NULL,
  json_object(
    'activeLorebookIds', json_array('$LB_ID'),
    'enableAgents', json('false'),
    'activeAgentIds', json_array(),
    'activeSceneChatId', '$CHAT_SCENE_ID'
  ),
  '$CHAT_SCENE_ID', NULL, 0,
  '$NOW', '$NOW'
);

INSERT OR REPLACE INTO chats (
  id, name, mode, character_ids,
  group_id, persona_id, prompt_preset_id, connection_id,
  metadata, connected_chat_id, folder_id, sort_order,
  created_at, updated_at
) VALUES (
  '$CHAT_SCENE_ID',
  '[Test] Summary Test — scene with steward',
  'roleplay',
  '["$CHAR_ID"]',
  NULL, NULL, NULL, NULL,
  json_object(
    'activeLorebookIds', json_array('$LB_ID'),
    'enableAgents', json('false'),
    'activeAgentIds', json_array(),
    'sceneStatus', 'active',
    'sceneOriginChatId', '$CHAT_CONVO_ID'
  ),
  '$CHAT_CONVO_ID', NULL, 0,
  '$NOW', '$NOW'
);

-- Seed scene messages — alternating assistant/user, mention lorebook keywords
-- (marshal, brunnig, vermilion, protocol) so entries activate. created_at
-- spaced 1 minute apart so message order is stable.
INSERT OR REPLACE INTO messages (
  id, chat_id, role, character_id, content, active_swipe_index, extra, created_at
) VALUES (
  '$MSG_1_ID', '$CHAT_SCENE_ID', 'assistant', '$CHAR_ID',
  CAST(readfile('$tmpdir/msg1.txt') AS TEXT),
  0, '{}', strftime('%Y-%m-%dT%H:%M:%fZ', '$NOW', '+0 minutes')
);
INSERT OR REPLACE INTO messages (
  id, chat_id, role, character_id, content, active_swipe_index, extra, created_at
) VALUES (
  '$MSG_2_ID', '$CHAT_SCENE_ID', 'user', NULL,
  CAST(readfile('$tmpdir/msg2.txt') AS TEXT),
  0, '{}', strftime('%Y-%m-%dT%H:%M:%fZ', '$NOW', '+1 minutes')
);
INSERT OR REPLACE INTO messages (
  id, chat_id, role, character_id, content, active_swipe_index, extra, created_at
) VALUES (
  '$MSG_3_ID', '$CHAT_SCENE_ID', 'assistant', '$CHAR_ID',
  CAST(readfile('$tmpdir/msg3.txt') AS TEXT),
  0, '{}', strftime('%Y-%m-%dT%H:%M:%fZ', '$NOW', '+2 minutes')
);
INSERT OR REPLACE INTO messages (
  id, chat_id, role, character_id, content, active_swipe_index, extra, created_at
) VALUES (
  '$MSG_4_ID', '$CHAT_SCENE_ID', 'user', NULL,
  CAST(readfile('$tmpdir/msg4.txt') AS TEXT),
  0, '{}', strftime('%Y-%m-%dT%H:%M:%fZ', '$NOW', '+3 minutes')
);
EOF

  echo "✅ Fixtures created/refreshed:"
  echo ""
  cmd_status
  echo ""
  echo "Next:"
  echo "  1. Restart the server (or refresh the UI) so it picks up the new chats."
  echo "  2. Pick a chat for your test:"
  echo "       Lorebook injection → [Test] Lore Test (no preset, no agents)"
  echo "       Scene summary       → [Test] Summary Test — scene with steward"
  echo "       Day/week summary    → [Test] Summary Test — convo (linked)"
  echo "  3. Lorebook test queries are in:"
  echo "       claude/test-fixtures/lorebook-test.md"
  echo ""
  echo "  Optional: enable prompt dumping to inspect what reaches the LLM:"
  echo "       MARINARA_DUMP_PROMPTS=1 pnpm dev:server"
}

cmd_teardown() {
  echo "→ Removing clean-room test fixtures..."
  # NB: SQLite's `sqlite3` CLI has foreign_keys=OFF by default, so
  # ON DELETE CASCADE doesn't fire. Enable it AND do explicit
  # dependency-ordered deletes — belt-and-braces.
  sqlite3 "$DB" <<EOF
PRAGMA foreign_keys = ON;

-- Children of messages first
DELETE FROM message_swipes WHERE message_id IN (
  SELECT id FROM messages WHERE chat_id LIKE 'lbtest-%'
);

-- Direct children of chats
DELETE FROM messages WHERE chat_id LIKE 'lbtest-%';
DELETE FROM memory_chunks WHERE chat_id LIKE 'lbtest-%';
DELETE FROM ooc_influences
  WHERE source_chat_id LIKE 'lbtest-%' OR target_chat_id LIKE 'lbtest-%';

-- The fixture rows themselves
DELETE FROM chats WHERE id LIKE 'lbtest-%';
DELETE FROM characters WHERE id LIKE 'lbtest-%';
DELETE FROM lorebook_entries WHERE id LIKE 'lbtest-%';
DELETE FROM lorebooks WHERE id LIKE 'lbtest-%';
EOF
  echo "✅ Fixtures removed (including any orphaned messages from previous runs)."
}

cmd_reset_chat() {
  echo "→ Clearing messages from all test chats (keeping fixtures)..."
  echo "  After clearing, the seed scene messages are re-asserted for the"
  echo "  summary-test scene so it stays usable."
  sqlite3 "$DB" <<EOF
PRAGMA foreign_keys = ON;
DELETE FROM message_swipes WHERE message_id IN (
  SELECT id FROM messages WHERE chat_id LIKE 'lbtest-%'
);
DELETE FROM messages WHERE chat_id LIKE 'lbtest-%';
EOF

  # Re-assert the seed scene messages so the summary-test chat is back to
  # its known starting state. The lorebook-only chat ($CHAT_ID) intentionally
  # has no seed messages.
  local tmpdir
  tmpdir=$(mktemp -d)
  trap "rm -rf '$tmpdir'" EXIT
  printf '%s' "$MSG_1_CONTENT" > "$tmpdir/msg1.txt"
  printf '%s' "$MSG_2_CONTENT" > "$tmpdir/msg2.txt"
  printf '%s' "$MSG_3_CONTENT" > "$tmpdir/msg3.txt"
  printf '%s' "$MSG_4_CONTENT" > "$tmpdir/msg4.txt"

  sqlite3 "$DB" <<EOF
INSERT INTO messages (
  id, chat_id, role, character_id, content, active_swipe_index, extra, created_at
) VALUES
  ('$MSG_1_ID', '$CHAT_SCENE_ID', 'assistant', '$CHAR_ID', CAST(readfile('$tmpdir/msg1.txt') AS TEXT), 0, '{}', strftime('%Y-%m-%dT%H:%M:%fZ', '$NOW', '+0 minutes')),
  ('$MSG_2_ID', '$CHAT_SCENE_ID', 'user',      NULL,      CAST(readfile('$tmpdir/msg2.txt') AS TEXT), 0, '{}', strftime('%Y-%m-%dT%H:%M:%fZ', '$NOW', '+1 minutes')),
  ('$MSG_3_ID', '$CHAT_SCENE_ID', 'assistant', '$CHAR_ID', CAST(readfile('$tmpdir/msg3.txt') AS TEXT), 0, '{}', strftime('%Y-%m-%dT%H:%M:%fZ', '$NOW', '+2 minutes')),
  ('$MSG_4_ID', '$CHAT_SCENE_ID', 'user',      NULL,      CAST(readfile('$tmpdir/msg4.txt') AS TEXT), 0, '{}', strftime('%Y-%m-%dT%H:%M:%fZ', '$NOW', '+3 minutes'));
EOF

  local lore_count scene_count convo_count
  lore_count=$(sqlite3 "$DB"  "SELECT COUNT(*) FROM messages WHERE chat_id = '$CHAT_ID';")
  scene_count=$(sqlite3 "$DB" "SELECT COUNT(*) FROM messages WHERE chat_id = '$CHAT_SCENE_ID';")
  convo_count=$(sqlite3 "$DB" "SELECT COUNT(*) FROM messages WHERE chat_id = '$CHAT_CONVO_ID';")
  echo "✅ Reset complete. Lore chat: $lore_count msgs, scene: $scene_count (seeded), convo: $convo_count."
  echo "   (Refresh the UI to see the clean state.)"
}

cmd_status() {
  echo "Current fixture state:"
  sqlite3 -header -column "$DB" <<EOF
SELECT
  'lorebook'                            AS kind,
  id,
  name,
  '—'                                   AS extra
FROM lorebooks WHERE id LIKE 'lbtest-%'
UNION ALL
SELECT
  'entry',
  id,
  name,
  CASE WHEN constant = 'true' THEN 'CONST' ELSE 'keys=' || keys END
FROM lorebook_entries WHERE id LIKE 'lbtest-%'
UNION ALL
SELECT
  'character',
  id,
  json_extract(data, '\$.name'),
  '—'
FROM characters WHERE id LIKE 'lbtest-%'
UNION ALL
SELECT
  'chat',
  id,
  name,
  'mode=' || mode || ', preset=' || COALESCE(prompt_preset_id, 'NONE') ||
    ', agents=' || COALESCE(json_extract(metadata, '\$.enableAgents'), 'unset') ||
    ', linked=' || COALESCE(connected_chat_id, '—') ||
    ', msgs=' || (SELECT COUNT(*) FROM messages WHERE chat_id = chats.id)
FROM chats WHERE id LIKE 'lbtest-%';
EOF
}

cmd_reset() {
  echo "→ Full reset: tearing down fixtures, then recreating from scratch..."
  echo ""
  cmd_teardown
  echo ""
  cmd_setup
}

cmd_help() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
}

cmd="${1:-help}"
case "$cmd" in
  setup)               cmd_setup ;;
  reset-chat)          cmd_reset_chat ;;
  reset)               cmd_reset ;;
  teardown|remove)     cmd_teardown ;;
  status|show)         cmd_status ;;
  help|-h|--help)      cmd_help ;;
  *)                   echo "Unknown command: $cmd. Try: setup | reset-chat | reset | teardown | status" >&2; exit 1 ;;
esac
