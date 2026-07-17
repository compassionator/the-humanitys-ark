# 02_MICROKERNEL_SPEC — Pinned v1.6 Repository Reference

This file intentionally does **not** duplicate the full Microkernel spec.

## Version pin

This repository pins **Universal Microkernel v1.6 [Anti-Noise Governor]** as the current Microkernel specification.

The locked external source is here:
- https://docs.google.com/document/d/1n0wAO4gjeER4aNneyOq40rTL_jicTW14HD18ewBsbWM/edit?tab=t.0

Changing the referenced Microkernel version requires an explicit repository documentation update. Do not silently treat later external edits as a new repository version.

## Dorr semantic dependency

Dorr owns colour/time semantic meaning:
- [Dorr Grammar v1.6](../02_Dorr/DORR_GRAMMAR.md)

The Microkernel references and enforces that grammar. It does not copy or redefine the Dorr matrix here.

## Why this file exists
This repository needs a stable place that tells readers and tools where the real spec lives.
That keeps the project readable without creating parallel versions that drift over time.

## Editing rule
If the Kernel logic changes, update the locked Microkernel spec first.
Then update summaries or surrounding documentation in this repository.

If Dorr colour/time meaning changes, update the Dorr-owned grammar through its own versioned decision. Kernel documents should update only their reference and enforcement expectations.

## What the Microkernel governs
At a high level, the Microkernel:
- checks scope
- checks time anchor
- applies harm / lie constraints
- checks hypocrisy boundaries
- enforces citation discipline for external claims
- routes, cites, infers, refuses, or returns silence

For the full logic, use the locked spec link above.

## Current implementation status

- Microkernel v1.6 specification: exists
- initial Kernel cartridges: exist
- executable governor / courier: not implemented
- formal Noise Gauntlet execution results: not recorded
