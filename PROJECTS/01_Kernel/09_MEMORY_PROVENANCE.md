# 09_MEMORY_PROVENANCE — Claims Before Memory

## Purpose

This note defines the minimum memory and provenance doctrine for ARK without freezing an implementation schema.

## Core principle

LLMs interpret.
ARK preserves source, ownership and history.
Dorr expresses meaningful state.
The human controls what becomes durable.

## Claim before memory

AI or model output starts as a claim. A claim may be:

- correct
- useful
- incomplete
- contradictory
- wrong
- brilliant and wrong at the same time

**A claim may be brilliant, useful, wrong, or all three. Memory must know the difference.**

## ARK vs Dorr

ARK holds:

- facts
- records
- source references
- ownership
- provenance
- revision history
- durable memory
- context packages

Dorr expresses:

- semantic state
- tension
- need
- pain
- question
- next step
- doing
- done
- guide/reference state
- time and scope semantics

A raw fact does not require Dorr. For example:

- an API endpoint can exist as an ARK record
- a raw CSV can exist as an ARK artifact
- a source document can exist as an ARK record
- “this API endpoint needs refactoring” may carry Dorr state
- “this task is being done” may carry Blue
- “this action is complete” may carry Green

Secrets such as API keys should not be casually placed into Dorr or general shared memory.

## Source vs derived state

```text
RAW SOURCE
↓
ARK RECORD
↓
DERIVED CLAIM
↓
OPTIONAL DORR STATE
↓
CURRENT CONTEXT PACKAGE
↓
MODEL / AGENT / INTERFACE
```

Derived interpretation should preserve a path to the source. Derived state must not silently replace its evidence.

## Durable commit

Models may propose. Humans may:

- accept
- edit
- reject
- supersede
- expire
- delete
- scope
- share

The workflow is intentionally not overdesigned here. Future user-defined policies may allow automatic commitment in low-risk cases, while high-value project and identity decisions should remain explicitly inspectable and attributable.

## Supersession

A minimal conceptual relationship is:

```text
new.supersedes = old_id
```

Old records do not require forward pointers. A store or index may determine which record is currently active. This principle does not freeze a final graph or DAG implementation.

## MVP direction

The MVP does not require:

- cryptographic hashes
- a complex ontology
- global consensus
- mandatory Dorr classification

A later local record may contain concepts such as:

```text
id
author/owner
payload
source_ref
supersedes
scope
optional_dorr_state
```

These names are illustrative only. They are not a canonical schema.

## Anti-rot rule

**No model should silently become the sole author of the user’s past.**
