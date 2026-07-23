# Dorr

## Role
Seed / Tool

## Goal
Preserve Dorr as the Ark’s decentralized reasoning, rating, routing, and learning layer, while keeping the first practical bridge narrowly focused.

## Why it matters
Dorr is broader than one app screen. It is the framework that helps turn noisy inputs into timed, scoped, meaningful frames without collapsing into a compulsory system.

## Current next step
Validate the read-only LinkedIn Feed proof on Firefox Android while preserving Dorr as the canonical shared grammar and Job Search Lens as the current working product Lens.

## Status
Canonical grammar locked at v1.6; broader Dorr framework Draft; Job Search Lens in controlled peer alpha; cross-domain Feed extraction proof validated on Chrome and Firefox desktop.

## Current implementation

[ARK Lens Job Search](ARK_Lens/README.md) remains the current controlled-alpha product Lens. It provides the working local-first product surface while Dorr remains the canonical shared grammar.

The separate read-only LinkedIn Feed extraction proof demonstrates that ARK Lens can apply the shared architecture to a non-Job domain without redefining Dorr or entering the Job runtime. Its user-executed Chrome and Firefox desktop gates passed. Firefox Android Feed validation is the next practical compatibility gate.

Feed filtering, F3B, and Firefox Job Lens work have not begun.

## Canonical references
- [Dorr Grammar v1.6](DORR_GRAMMAR.md) — canonical colour/time semantic meaning
- `../01_Kernel/02_MICROKERNEL_SPEC.md`
- `../../HIGH_LEVEL_QA.md`
- `../../PROJECTS_SONG_SEED_TOOL.md`

## Ownership boundary

- Dorr owns colour/time semantic meaning in `DORR_GRAMMAR.md`.
- Kernel owns governance, routing, Council nodes, citation/refusal, integrity, and orchestration rules.
- Kernel references and enforces Dorr; it does not redefine Dorr semantics.
- ARK Lens consumes Dorr as the browser-facing product.
- Job Search Lens applies Dorr within ARK Lens.

## Why Dorr is separate
Dorr touches many projects, but it should still stay distinct as a core framework.

- **G-Rank** uses Dorr logic for reputation and visible consequence.
- **The Cornea** may use Dorr frames as the interface layer in AR.
- **Bandar_To_Door** may later use Dorr as a routing / visibility language for logistics.
- other projects may exchange colorful Dorr JSON or frame-like signals later.

That does not mean they should all be merged into Dorr.
It means Dorr acts like a shared grammar or protocol layer used by multiple projects.

## Naming note
If you want a more precise name later, **Dorr_Core** would make sense.
For Genesis, plain **Dorr** is still acceptable because it is shorter and already rooted in your older docs.

## Longer-range Dorr directions
Beyond the first browser bridge, Dorr may later grow into:
- a structured memory layer
- a rating and ranking layer
- an automation and IoT bridge
- an AR-first interface layer
- a middle ground for AI-to-AI and human-to-AI collaboration
- a cleaner alternative to engagement-driven social and service systems

These directions matter, but they should not blur the current MVP.

## Current practical slice

[ARK Lens Job Search](ARK_Lens/README.md) is the current working product Lens. It captures supported job listings, applies a local deterministic Lens Pack, and presents explainable results without a hosted service.

The LinkedIn Feed proof is cross-domain extraction evidence only. It is read-only and in-memory; it is not a completed Feed Lens product.

## Historical design lineage

- `MVP/Browser_Addon.md` — historical feed blur/reveal design; not the current implementation
- `MVP/Witness_Proof.md` — historical Analyze/n8n acceptance design; not passed or implemented
- Feed blur/reveal and optional n8n/council analysis remain future work
- `ARK_Lens/README.md` — current implementation and roadmap
