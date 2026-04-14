# 01_Kernel

The Kernel is the governor of ARK.

It does not behave like a chatbot that freely improvises. It first governs input through scope, time, harm/lie checks, hypocrisy checks, and citation discipline. Only then does it route, validate, cite, infer, refuse, or return silence.

## Role
Governor, router, validator, and anti-noise boundary.

## What this folder contains
- `QA.md` — high-level questions and answers for new readers.
- `01_ARK_ARCHITECTURE.md` — the architecture around the Kernel: Fuel, Gauntlet, Test Rig, Courier, and Interface.
- `02_MICROKERNEL_SPEC.md` — reference link to the locked Microkernel spec. This folder does not duplicate that source of truth.
- `03_8_NODES.md` — the one-page Council Registry.
- `04_SHADOW_REGISTRY.md` — failure modes when a node is used in isolation.
- `05_ANTI_ROT_PROTOCOL.md` — non-negotiable guardrails.
- `06_TEST_GAUNTLET.md` — the noise library and pass/fail log format.
- `07_CARTRIDGES_INDEX.md` — cartridge structure, naming, and integrity rules.
- `08_ROADMAP.md` — the execution roadmap from Fuel to Interface.
- `cartridges/` — the citeable source corpus for strict mode, including active cartridge batches, source files, templates, and future expansions.
- `corpus/` — supporting raw source texts used to ground cartridge chunks and preserve provenance.

## Reading order
1. `QA.md`
2. `01_ARK_ARCHITECTURE.md`
3. `02_MICROKERNEL_SPEC.md`
4. `03_8_NODES.md`
5. `04_SHADOW_REGISTRY.md`
6. `05_ANTI_ROT_PROTOCOL.md`
7. `06_TEST_GAUNTLET.md`
8. `07_CARTRIDGES_INDEX.md`
9. `08_ROADMAP.md`
10. `cartridges/`
11. `corpus/` (only when provenance or source grounding needs inspection)

## Strict rule
**External Claim = Must Cite.**

A lived inner state can be described without an external citation.  
A factual external claim cannot.

## Source of truth for the Microkernel
The locked Microkernel spec lives here:
- https://docs.google.com/document/d/1n0wAO4gjeER4aNneyOq40rTL_jicTW14HD18ewBsbWM/edit?tab=t.0

This folder is intentionally written as a clean operational package around that source, not as a competing rewrite of it.

## Current implementation state
The Microkernel logic is locked.
The architecture around it is defined.
Initial cartridge batches now exist for strict-mode testing and citation.

This package is ready for:
- architecture review
- strict-mode experiments
- cartridge expansion
- gauntlet-based validation

## Operational principle
The Kernel does not invent knowledge.
It routes and cites what is available in the cartridge layer.
If support is missing, it should refuse, contain, or mark inference explicitly.

## Boundary that must not drift
**Yellow is not Green.**

Yellow is unfulfilled capacity, demand, or possibility.  
Green is fulfilled outcome, relief, or result.

They must never be treated as the same state.