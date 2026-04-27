# Clean-room lorebook test

A small, isolated, unfakeable test for verifying that lorebook content actually reaches the LLM prompt.

## Why this exists

Mainline chats have grown to 15k-token prompts with multiple injection paths competing — preset assembler, three inline lorebook blocks, knowledge-retrieval agent, depth-targeted entries. When something works, it's hard to tell *which* mechanism made it work.

This fixture strips everything to the minimum: one character, one short lorebook, no preset, no agents. Every word in the prompt has a known origin.

## What gets created

Run `./claude/test-fixtures/lorebook-test.sh setup` and you get:

- **One lorebook** `[Test] Lorebook Test Fixture` with two entries:
  - `[CONST] Dolomar-9 World Setting` — always activates. Five facts about an invented world.
  - `[KEYWORD] The Vermilion-7 Protocol` — activates only when the user message mentions "vermilion", "protocol", or "Vermilion-7".
- **One character** `Test Steward` — patient, factual, says "I don't know" rather than guess.
- **One chat** `[Test] Lore Test (no preset, no agents)` — roleplay mode, lorebook attached, agents disabled, no preset.

Total prompt size: a few hundred tokens. Generation should complete in seconds against any model.

## The test

The lore uses invented vocabulary that no model knows from training. If the model produces these specific words/phrases, it's because the lore was injected into the prompt — full stop, no other explanation.

### Test 1 — CONST entry baseline

> **You:** What's the local currency?
>
> **Expected if lore injected:** mentions "glints", "hexagonal", or "silver"
> **Expected if NOT injected:** generic answer, or invents something else

> **You:** Who rules Dolomar-9?
>
> **Expected if lore injected:** "Marshal Brunnig the Eleventh" / "the Quiet Marshal"
> **Expected if NOT injected:** confabulates a different ruler, or admits ignorance

> **You:** What are the months called?
>
> **Expected if lore injected:** lists at least three of: Storm-Tide, Mirror-Tide, Black-Tide, Salt-Tide, Drift-Tide, Hush-Tide, Bone-Tide, Grey-Tide, Sun-Tide, Wake-Tide, Long-Tide, Final-Tide
> **Expected if NOT injected:** generic month names or admits ignorance

If any of these fail, the **CONST entry is not reaching the prompt** — that's exactly the bug the `fix/lorebooks-ignored-without-preset` branch addresses.

### Test 2 — Keyword-triggered entry

> **You:** Tell me about the Vermilion Protocol.
>
> **Expected if lore injected AND scanner works:** mentions "Dr. Elara Mensch", "Vermilion Ledger", "seven hours", or "Hush-Tide Registrar"
> **Expected if scanner broken:** generic guess or "I don't know"

This tests the keyword scanner specifically. The CONST entry is always on; the keyword entry only fires if "vermilion" or "protocol" appears in your message.

### Test 3 — Negative control (confabulation check)

> **You:** What's the Witching Stone of Vasselgrim?
>
> **Expected from a well-behaved model:** "I don't know" / "It isn't mentioned in what I know about Dolomar-9"
> **If the model confidently invents an answer:** the model is hallucinating regardless of injection — interpret other test results with caution

The Witching Stone is **not** in the lore. If the model fabricates a confident description, that's the model's problem, not the injection layer's.

## Inspecting the actual prompt

If you want to see the raw prompt the LLM receives, enable the dumper:

```bash
MARINARA_DUMP_PROMPTS=1 pnpm dev:server
```

Generate a message, then:

```bash
# Find the most recent dump:
ls -t ~/marinara-debug/*.json | head -n1

# Grep just the system messages:
jq '.messages[] | select(.role=="system") | .content' ~/marinara-debug/<file>.json

# Confirm the lore block is present:
grep -l "<lore>" ~/marinara-debug/*.json
```

Three things to verify in the dump:

1. `presetId` is `null` (preset-less, the bug-prone path)
2. `enableAgents` is `false` (no other system can sneak lore in)
3. A system message contains a `<lore>` block with the Dolomar-9 facts

If `<lore>` is present, the fix is working. If `<lore>` is absent but the model still cites Marshal Brunnig, knowledge-retrieval is doing it via a different mechanism (and you forgot to disable agents).

## Cleanup

When you're done:

```bash
./claude/test-fixtures/lorebook-test.sh teardown
```

Removes the lorebook, entries, character, and chat. Idempotent — safe to re-run.

## Variations

The script is easy to copy and tweak for other test scenarios:

- **Test the preset path** — same content, but assign the `Default` preset to the chat.
- **Test the conversation lorebook block** — same content, but set `mode = 'conversation'` on the chat.
- **Test the game lorebook block** — same content, `mode = 'game'`.
- **Test knowledge-retrieval as bypass** — keep preset null, but set `enableAgents = true` and add `knowledge-retrieval` to `activeAgentIds`. Compare what reaches the prompt with and without my fix.

Each variation is a small SQL tweak. The lore content stays the same, so test queries 1–3 above always work the same way and you can compare results across variations directly.
