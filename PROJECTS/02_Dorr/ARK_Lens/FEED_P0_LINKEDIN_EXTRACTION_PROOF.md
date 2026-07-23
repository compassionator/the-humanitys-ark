# FEED_P0 — LinkedIn Feed Read-Only Extraction Proof

## Purpose and status

FEED_P0 proves that ARK's shared `LensItem`, `ExtractionResult`, registry mechanics, neutral DOM reads, and neutral diagnostics can support a non-Job item: a currently rendered LinkedIn home-feed post.

This is a separate development proof, not the Feed Lens MVP and not F3B.

> This proof does not filter or modify the Feed.

> This proof is not included in the Job Lens peer-alpha package.

> F3B DOM Doctor work has not begun.

## Protected Job boundary

The protected Job baseline entering FEED_P0 was commit `32a969a9d3534c3a08061369126d8ffd7d31df1e`, package `ark-lens-v2026.6.19-peer-alpha.zip`, SHA-256 `50f46f32e3ec22aab95317318f896aaec51ee9101dc7cd93a77b4a2055861bb1`.

The user subsequently confirmed that the controlled Job alpha manual smoke gate passed. That is recorded in `FOUNDATION_F3A.md` as user-reported manual evidence, not automation. Checkpoint commit `9a7b7c5` was created before Feed-proof production changes.

The normal Job background worker, manifest, popup, content bundle, policies, Fix Capture, records, sessions, reports, and Lens Pack contain no Feed-proof behavior. In particular, the Job runtime still returns unsupported for `https://www.linkedin.com/feed/`.

## Registry and catalogue separation

`sources/source_adapter_registry.js` is now generic mechanics only. It validates definitions, statuses, capability declarations, duplicate IDs, implementation contracts, and definition-owned location matchers. It can create an isolated registry from supplied definitions and implementations. It contains no source ID or hostname branches.

Domain catalogues are separate:

- `sources/jobs/job_source_catalogue.js` owns `linkedin_jobs`, `seek_jobs`, and `hays_jobs`, and preserves the browser/CommonJS compatibility API `ARK_SOURCE_ADAPTERS`.
- `sources/feed/feed_source_catalogue.js` owns only `linkedin_feed`, exposes `ARK_FEED_SOURCE_ADAPTERS`, and matches only LinkedIn `/feed/` routes.

No combined registry is created in FEED_P0. Both catalogues use the same registry core.

## Feed source shape

The LinkedIn Feed adapter returns plain source evidence with:

```text
adapter_id
adapter_version
source_item_id
identity_quality
source_url
author
author_url
visible_text
visible_timestamp
published_at
visible_labels[]
links[]
media_types[]
repost_context
capture_metadata
```

`capture_metadata` records capture time, rendered-evidence-only status, and visible sponsored/recommendation booleans. The shape contains no DOM nodes, HTML, cookies, authentication data, hidden API payloads, comments, downloaded media, or arbitrary profile data.

## Feed item mapping

`domains/feed/feed_item_mapper.js` owns the translation into generic `LensItem`:

- post identity → `item_id`;
- `linkedin_feed` → `source_adapter_id`;
- `feed_post` → `item_type`;
- visible text → `primary_text` and `body_text`;
- visible author → `secondary_text` and `author`;
- safely parsed `datetime` → `published_at`;
- observable links, media categories, and platform labels → existing generic arrays;
- identity quality, timestamp label, repost context, and proof flags → Feed-owned metadata.

Generic `LensItem` does not interpret LinkedIn Feed fields and gains no new universal requirements.

## Capabilities

The Feed catalogue declares the intentionally supported vocabulary:

- required extraction evidence: `item_discovery`, `primary_text`, `content.author`;
- identity and common evidence: `stable_item_identity`, `source_url`, `content.author_url`, `content.published_at`;
- conditional rendered evidence: `content.links`, `content.media_types`, `platform.visible_labels`, `platform.sponsored_label`, `platform.recommendation_label`, `platform.repost_context`;
- operation: `runtime.lazy_insert_observation`.

Comments, actions, AI probability, and repair profiles are not declared.

## Identity hierarchy

The adapter uses observable evidence in this order:

1. rendered `urn:li:activity:*` or `urn:li:share:*` attributes;
2. the same stable identifier in an observable permalink;
3. another rendered activity identifier in a permalink;
4. a deterministic SHA-256 fallback over visible author, timestamp label, text, and first observable link.

Stable evidence is labelled `stable`; deterministic evidence is labelled `fallback`; absent identity is `unknown`. Fallback identity always produces a warning and a `partial` result. It is never represented as a LinkedIn ID.

## Capture policy and ExtractionResult semantics

`domains/feed/feed_capture_policy.js` decides only whether a result is inspectable. It requires a complete/partial `feed_post`, an item identity (stable or explicitly fallback), and at least one meaningful rendered signal. It performs no scoring, filtering, ranking, or classification.

- `complete`: stable identity plus the core visible text/author/permalink/author URL/normalised timestamp evidence used by the proof fixture.
- `partial`: inspectable evidence with fallback identity or missing declared common capabilities.
- `unsupported`: a rendered candidate cannot be safely interpreted or has no meaningful evidence/identity.
- `failed`: an unexpected adapter/mapper failure is contained by `ExtractionResult.guardExtraction`.

All results and source data are serialisable plain data.

## Actual proof flow

```text
Rendered LinkedIn home-feed DOM
  → Feed source catalogue lookup
  → LinkedIn Feed adapter source extraction
  → Feed-owned item mapper
  → generic LensItem
  → generic ExtractionResult
  → Feed-owned inspectability policy
  → in-memory read-only proof snapshot
```

No Job compatibility or Job policy participates.

## Observer lifecycle

The probe starts only after the proof popup receives an explicit Scan or Start action.

1. `scan()` inspects currently rendered post containers.
2. `start()` runs an initial scan and attaches a child-list `MutationObserver`.
3. Added rendered nodes queue one debounced scan.
4. A `WeakSet` prevents repeat work for the same node; adapter/item identity prevents duplicate output across different nodes.
5. Results update only an in-memory versioned snapshot.
6. `stop()` cancels the pending timer and disconnects the observer.
7. `clear()` clears only in-memory results and counters.

The probe never initiates scrolling, input, clicks, expansion, comment loading, or permanent background observation.

## Proof extension

The separate extension lives in `proofs/linkedin_feed/` and is named **ARK Lens — LinkedIn Feed Extraction Proof**. It has only `activeTab` and `scripting` permissions, no host permissions, no background worker, no declarative content script, and no storage or network permission.

Controls are limited to scanning, starting/stopping observation, refreshing, clearing memory, and exporting local JSON. Runtime injection occurs only from a popup button action on a matching LinkedIn `/feed/` tab.

## Privacy and export model

The adapter reads only currently rendered post-container evidence: visible author/name link, visible post text, visible timestamp/datetime, observable post/link anchors, rendered media element categories, selected visible labels, and rendered repost context.

The probe retains only plain extraction results, identity quality, diagnostic summaries, timestamps, and counts in the page's memory. Nothing is written to extension storage, Job storage, local storage, session storage, cookies, or a server.

Local export contains the versioned in-memory snapshot. It can include supported visible post text and metadata because the user explicitly requests the export. It never includes DOM HTML, DOM objects, functions, cookies, tokens, comment bodies, hidden responses, downloaded media, or an upload destination.

No storage API or network API is used.

## Package boundaries

The Job alpha package remains exact-file allow-list based. It includes the generic registry core and Job catalogue but zero `sources/feed`, `domains/feed`, `orchestration/feed`, or proof-extension files.

The separate builder `npm.cmd run build:linkedin-feed-proof` creates `ark-lens-linkedin-feed-extraction-proof-v0.1.zip` from a dedicated 15-file runtime/UI allow-list plus `BUILD_INFO.json` and `SHA256SUMS.txt`. It contains no Job adapters, compatibility, policies, content bundle, records, sessions, reports, schemas, Lens Pack, tests, or fixtures.

## Sanitised fixtures

`tests/fixtures/linkedin-feed/observable-posts.html` contains ten synthetic rendered structures:

1. normal text post;
2. image post;
3. video post;
4. link/article post;
5. repost context;
6. promoted label;
7. recommendation label;
8. fallback identity;
9. partially rendered author/media post;
10. unsupported loading placeholder.

It contains no real account information, messages, cookies, authentication data, or logged-in page capture.

## Automated evidence

Tests cover:

- source-neutral registry mechanics and duplicate detection;
- Job/Feed catalogue and route isolation;
- Feed adapter ownership and forbidden dependencies/side effects;
- all ten fixture structures and truthful result states;
- stable and fallback identity;
- media, promoted, recommendation, and repost evidence;
- failed-extraction containment;
- initial scan, debounced lazy insertion, deduplication, stop, and cleanup;
- unchanged feed markup during scan;
- plain-data export and exclusion of comment/token/HTML markers;
- exact-file package isolation in both directions;
- the complete protected Job regression suite.

## Manual LinkedIn Feed proof gate

Status: **EXECUTED BY USER — PASSED**.

The user reported that the current proof worked successfully in the real Chrome desktop LinkedIn Feed environment. This is user-reported manual evidence; Codex and the automated suite did not execute the live test. Automated fixture and browser-contract evidence remains separately identified above.

Firefox desktop and Firefox Android validation have not begun. No claim is made regarding mobile LinkedIn Feed DOM support.

User-executed procedure:

1. Install the separate Feed proof extension.
2. Open the LinkedIn home feed.
3. Click **Scan visible feed**.
4. Confirm visible posts appear in the snapshot.
5. Confirm no feed content changed.
6. Start observation.
7. Scroll manually once or twice.
8. Confirm newly rendered posts are discovered.
9. Confirm previously seen posts are not duplicated.
10. Stop observation.
11. Confirm no new items are captured after stopping.
12. Export local JSON.
13. Confirm it contains only visible supported evidence.
14. Confirm comments were neither opened nor extracted.
15. Confirm the normal Job Lens extension/package remains unaffected.

## FEED_P0 completion gate

**FEED P0 COMPLETE — CROSS-DOMAIN EVIDENCE READY**

Complete:

- protected Job Lens automated gates;
- user-confirmed manual Job Lens test;
- LinkedIn Feed automated extraction proof;
- user-confirmed manual Chrome LinkedIn Feed test;
- Job/Feed package isolation;
- portable ZIP packaging;
- local-first and read-only privacy boundary.

Still unproven and not started by this gate:

- Firefox desktop;
- Firefox Android;
- mobile LinkedIn Feed DOM;
- mobile LinkedIn Jobs DOM;
- mobile SEEK DOM;
- Feed filtering and actions;
- Feed persistence and reports;
- DOM Doctor;
- F3B;
- AI.

## Known limitations

- LinkedIn may change semantic selectors or rendered structures without notice.
- Only the LinkedIn home-feed route is supported; Jobs, profiles, company pages, notifications, and other feeds are rejected.
- Posts without stable rendered URNs/permalinks use a visible-evidence hash that may change if visible text or labels change.
- Timestamp labels are retained as visible text unless an actual `datetime` attribute can be safely normalised.
- Media is recorded only as a category; media content, captions hidden from the rendered structure, and files are not downloaded.
- Nested quoted-post content is represented only by the currently supported repost-context evidence, not as a second post graph.
- Partially rendered placeholders with no meaningful evidence are unsupported.
- No comments, reactions, actions, metrics policy, scoring, persistence, or repair behavior exists.

## Evidence required before F3B

F3B must not begin automatically. The smallest justified next design task, after the real manual gate, is to compare the proven Job and Feed diagnostic observations and define a privacy-bounded, item-type-neutral diagnostic vocabulary. Repair schema, UI, activation, and migration should remain out of that first design task.
