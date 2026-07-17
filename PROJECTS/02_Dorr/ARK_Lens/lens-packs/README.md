# Lens Pack customization

ARK Lens v2026.06.019 has one bundled source of truth:

- `bob_job_search.json` is the canonical editable Lens Pack.
- `bundled_lens_pack.js` is generated for the Chrome extension. Do not edit it directly.
- `../schemas/lens-pack.schema.json` is the machine-readable contract.

The extension remains deterministic and lexical in this release. Relevance feedback is stored as a separate, reviewable event history and never silently alters the Lens, match percentage, or fit decision. Semantic ranking and automatic Lens suggestions remain future, explicitly controlled layers.

The historical `bob_job_search` file and internal id are retained for storage compatibility. The public display name is `My Job Search`.

Adapter capture repairs use a separate contract at `../schemas/adapter-profile.schema.json`. Repair Files never alter Lens scoring rules.

Report relevance feedback uses `../schemas/relevance-feedback.schema.json`. It records Relevant, Not relevant, or Unsure plus a plain-language reason and the scoring context at the time of feedback.

The controlled peer-alpha release adds a local Getting Started page, privacy-safe aggregate test summary, tester documentation, repeatable release packaging, and a main `A` icon that swaps from gray to green while a capture session is active. None of these surfaces alter scoring behavior.

## Everyday use

The popup is the capture controller. `Customize Lens` opens a full-page editor where users can create, rename, duplicate, and delete Lens Packs.

Basic mode groups phrases under plain-language sections such as Roles I want, Related roles worth showing, Deal-breakers, and Things I prefer to avoid. It also supports empty-by-default preferences for location, seniority, work arrangement, and employment type. Advanced mode exposes the complete JSON contract with validation, save, export, and bundled restore actions.

Legacy bundled-style packs are upgraded automatically without losing edits. Independent custom packs keep their own signal groups. Invalid Advanced JSON displays readable field paths before anything is stored.

An empty keyword list is valid and disables that individual rule without deleting its configuration.

## Rule fields

Every signal declares its own behavior. The scorer does not give special meaning to a signal id.

- `keywords`: whole terms or phrases to match.
- `match_scope`: `all`, `title`, `company`, `location`, `description`, or `metadata`.
- `weight`: points added for a positive match.
- `penalty`: points removed for a negative match.
- `blocker`: whether a match is a hard blocker.
- `qualifies_role_fit`: whether the signal is sufficient evidence that the job belongs to a relevant role family.
- `role_fit_kind`: `target`, `adjacent`, `evidence`, `context`, or `none`; this controls generic explanations.
- `editor_section`: optional Basic-editor category; otherwise the editor infers a category from declared scoring behavior.
- `editor_help`: optional plain-language guidance shown beside a Basic field.
- `score_floor` and `score_floor_when`: optional minimum score behavior.
- `keyword_score_floor`: an optional stronger floor for named keywords.
- `score_cap`: optional maximum score when the signal matches.
- `force_score` and `force_workflow_state`: optional deterministic outcomes.
- `reason`, `outcome_reason`, and `reason_priority`: readable evidence and decisive explanation behavior.

Global bases, score bounds, Apply/Review thresholds, confidence values, and explanation templates live under `scoring_policy`.

## Updating the bundled default

After editing `bob_job_search.json`, run:

```powershell
npm.cmd run build:lens-pack
npm.cmd test
```

The tests fail if the generated bundle is stale, the schema is invalid, or any established extraction/scoring/report behavior changes unexpectedly.
