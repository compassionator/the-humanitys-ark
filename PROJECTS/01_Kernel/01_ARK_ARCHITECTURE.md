# 01_ARK_ARCHITECTURE — Canonical Kernel Wrapper

A sovereign anti-noise system: microkernel + cartridges + gauntlet + courier + interface.

## 1) What ARK is

ARK is a filter and router that turns chaotic inputs — doomscroll feeds, message dumps, project ideas, and sensor logs — into timed, scoped, testable frames so a human can regain attention, direction, and non-harm.

Its goal is to reduce harm, reduce lies, and reduce compulsive loops.
It is not designed to "win arguments."

## 2) The Microkernel

Microkernel v1.6 specifies the governor.
It governs:

- enforcement of the Dorr-owned time-anchored grammar
- Council Registry (8 Nodes)
- Strict citation discipline
- Routing and refusal behavior

The locked source of truth is external and should be linked, not duplicated:
- https://docs.google.com/document/d/1n0wAO4gjeER4aNneyOq40rTL_jicTW14HD18ewBsbWM/edit?tab=t.0

The canonical Dorr grammar is repository-owned by Dorr and must be referenced, not redefined:
- [DORR_GRAMMAR.md](../02_Dorr/DORR_GRAMMAR.md)

## 3) Roadmap A→E

Pipeline: **Fuel (A) → Gauntlet (B) → Test Rig (C) → Courier (D) → Interface (E)**

### A) Fuel Depot (Cartridges)
An initial citeable cartridge batch exists for:

- Node 1 — Zarathustra
- Node 2 — Plato
- Node 3 — Buddha
- Node 4 — Avicenna
- Node 5 — Khayyam
- Node 6 — Rumi
- Node 7 — Hafez
- Dorr Matrix

Rule: no essays. Store reference-grade snippets only. Everything must be chunked so it can be cited in strict mode.

### B) Threat Library (Noise)
Prepare failure-inducing inputs such as:

- ape chatter / dumping / gossip hooks
- clickbait media / rage bait
- ideology and propaganda
- mixed-time mixed-color “fly floods”
- hallucination traps
- raw IoT and sensor noise

### C) Test Rig
Feed Noise through the Kernel.
The Kernel must either cite Fuel correctly or refuse cleanly.

Record pass/fail with reasons:
- cite
- refuse
- inference
- boundary preservation

### D) Courier (Automation)
Build a single runner so users do not have to act as manual clipboard glue.

Input → routing/citation → output.

### E) Interface
Surface the system through a browser extension, Telegram bot, web UI, hourglass UI, or similar layer.
Users interact with the interface, not the kernel directly.

## 4) Cartridge format + naming rules

If a statement is not represented in cartridge chunks, it cannot be claimed in strict mode.

### Folder layout
```text
cartridges/
  node_1_fire/
  node_2_logos/
  node_3_lab/
  node_4_system/
  node_5_wine/
  node_6_whirl/
  node_7_codebreaker/
  dorr_matrix/
```

### Minimum data shape
Each cartridge uses two JSONL files:

#### A) `MANIFEST.jsonl`
One line per source/work.

Recommended fields:
- `content_id`
- `source_node`
- `source_title`
- `author`
- `language`
- `variant`
- `license`
- `translator` (optional)
- `attribution_confidence` (optional)
- `concepts` (optional)
- `content_sha256` (recommended)

#### B) `CHUNKS.jsonl`
Many citeable units per source.

Recommended fields:
- `content_id`
- `chunk_id`
- `source_node`
- `source_title`
- `chunk_index`
- `variant`
- `text_chunk`
- `derived_from_chunk_id` (optional)
- `notes` (optional)
- `start_char` (optional)
- `end_char` (optional)
- `chunk_sha256` (recommended)

### File naming rule
Prefer:
`<node>_<work>_<lang>_<type>.txt`

Keep raw originals separate from translations and adaptations.
If something is a paraphrase or adaptation, label it clearly.

## 5) Noise Gauntlet

Pass condition: citation or standardized refusal. Never bluff.

### Content traps
- fake quote trap
- modern science trap
- hypocrisy bait
- urgency bait
- nice-sounding lie

### System traps
- Blue Rot — promises decay into Red pain if unfulfilled
- Gym Paradox — “pain” can be productive depending on context
- Screaming Sensor — IoT floods must be compressed without invented causes
- Bystander Effect — visible pain without proper routing or incentive scaling

### Log format
```text
TEST_ID:
INPUT:
ROUTE:
OUTPUT:
SOURCES:
PASS/FAIL:
NOTES:
```

## 6) Anti-Rot Guardrails

To stop ARK from becoming the beast it opposes:

- Open Source
- Local-First
- No Profit Loop
- Uninstall / Off Switch
- Reproducible Builds + Signed Releases

## 7) Interface target

Input passes through the kernel neck.
Output becomes Dorr frames, not raw opinion.

Users should eventually be able to save and share Lens Packs.

Anti-spam and anti-gamification requirements:

- static 5-star forever ratings must die
- relative curves matter more than frozen labels
- **No Need = No Rate**

That means a Green deed/result should not be logged unless a corresponding Yellow need was explicitly declared first.

## 8) Current state and next immediate step

Done:
- the Microkernel v1.6 specification exists
- the architecture exists
- the support docs exist
- an initial cartridge batch exists

Not yet implemented:
- executable governor or courier
- formal Noise Gauntlet execution results

Next immediate step:
Validate the initial cartridges, complete integrity metadata, and execute the Noise Gauntlet with recorded results. Executable governor and courier work follows validated specification and Fuel.
