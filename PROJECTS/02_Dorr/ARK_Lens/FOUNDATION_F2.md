# ARK Lens Foundation F2

**Started:** 2026-07-22  
**Protected baseline:** F1 complete; 37 classifications byte-for-byte compatible  
**Scope:** capability-aware adapters and truthful extraction results for existing Job sources only

## Pre-patch source architecture map

| Concern | Post-F1 location | Pre-patch behavior / coupling |
|---|---|---|
| Source registration | `content_bundle.js` `SOURCE_ADAPTER_REGISTRY` | LinkedIn Jobs and SEEK Jobs implemented; Hays Jobs planned. Runtime functions and metadata share one object inside the content script. |
| Implemented/planned state | `content_bundle.js` | `status` strings exist, but popup and background maintain separate source knowledge. |
| URL matching | `content_bundle.js`, `background.js`, `popup/popup.js` | LinkedIn/SEEK hostname and path logic is independently repeated three times. |
| Active source detection | `getCurrentSourceAdapter` | Scans the content-local registry and calls `canHandleCurrentPage`. |
| LinkedIn DOM discovery | LinkedIn helper block in `content_bundle.js` | Detail roots, semantic layouts, recommendation cards, collections cards, open Shadow Roots and same-origin frames are discovered in source-specific helpers. |
| SEEK DOM discovery | SEEK helper block in `content_bundle.js` | Semantic selectors plus the existing local Apollo-cache fallback. |
| LinkedIn extraction | `extractCurrentLinkedInJob` | Tries detail, recommendation-card and collections-card modes, returning an extracted job or `null`. |
| SEEK extraction | `extractCurrentSeekJob` | Combines DOM and Apollo fields, returning an extracted job or `null`. |
| Stable identity | Source helper blocks | LinkedIn job/currentJobId/card IDs and SEEK job/jobId IDs; `buildExtractedJob` falls back to a content hash. |
| Readiness | Source extraction and adapter profiles | LinkedIn and SEEK require title, company and sufficient description before normal detail capture. Card fallbacks have source-specific guards. |
| Selector profiles | `DEFAULT_ADAPTER_PROFILES` and Fix Capture storage | Profiles remain job-shaped and are merged/validated inside `content_bundle.js`. |
| SPA and observation | `background.js`, `startObserver`, job-change watcher | Background reinjects after supported same-tab navigation; the content bundle uses a MutationObserver, click tracking and an interval. |
| Failure/null handling | Adapter extraction and `captureCurrentJob` | Recognised-but-not-ready, unsupported structures and unexpected absence all collapse to `null`; capture fails soft but cannot distinguish why. |
| Fix Capture | Adapter Doctor functions in `content_bundle.js` | Source-specific preview/testing calls the content-local adapter directly; schemas and validation require job fields. |
| Report source metadata | Existing extracted job / ARK record | `source.id`, item ID, URL, adapter profile and extraction mode are persisted and exported. |
| Popup readiness | `popup/popup.js` | A separate LinkedIn/SEEK URL detector decides whether the session can start. |
| Script injection | `popup/popup.js`, `background.js` | Ordered injection loads Lens Pack, F1 core/policy and content bundle; no shared source metadata runtime exists. |

## F2 target boundaries

F2 introduces one canonical source registry, explicit capability declarations, a small runtime adapter contract and a source-neutral `ExtractionResult`. Existing source DOM helpers remain in the content source layer unless moving them creates a tested responsibility boundary.

```text
location
  -> canonical source definition
  -> implemented runtime adapter
  -> source-owned discovery/extraction
  -> ExtractionResult
  -> usable LensItem (complete or minimum-capability partial)
  -> deterministic matcher
  -> Job policy
  -> unchanged record/session/report orchestration
```

Fix Capture remains job-specific in F2. Generic DOM Doctor work begins only after the adapter and capability contracts are green.

## Compatibility constraints

- No new source permissions or Feed routes.
- No storage reset or destructive migration.
- Existing extracted-job data remains available only as serialisable source data at the legacy record boundary.
- Older records do not require extraction-status fields.
- Reports and JSON/CSV exports remain unchanged.
- F1 matcher and Job policy dependency purity remains protected.

## Shipped implementation

### Canonical registry and runtime adapter contract

`sources/source_adapter_registry.js` is the sole source-definition registry used by content, background and popup runtimes. It owns stable IDs, display names, item types, implementation status, URL matching and capability declarations. The status model is `implemented`, `planned` and `unsupported` (the latter is the result for an unknown route). LinkedIn Jobs and SEEK Jobs are implemented. Hays Jobs remains metadata-only and planned; the registry rejects any attempt to attach a runtime implementation to it.

The current practical adapter surface is:

```text
id
display_name
item_type
status
url_patterns
capabilities
canHandleLocation(location)
discoverItems(root, context)
extractItem(element, context)
deriveItemId(element, extractionResult, context)
```

`locateVisualContainer` and adapter-owned lifecycle methods were not added because no current Job runtime consumer needs them. Existing SPA observation and cleanup remain in orchestration, while the adapters explicitly declare `spa_observation` support. This avoids a speculative interface before F3 supplies a real consumer.

### Capability model

The known vocabulary is:

```text
item_discovery, stable_item_identity, primary_text, secondary_text,
body_text, location, source_url, platform_state, spa_observation,
repair_profile, author, published_at, tags, links, media_types,
recommendation_labels, sponsored_labels, follow_relationship,
engagement_metrics, comments, thread_context
```

Both implemented Job adapters require item discovery, stable identity, primary text, secondary text, body text, source URL and platform state. Location is optional. SPA observation and repair profiles are supported operations. Following the F2.5 separation audit, undeclared capabilities mean “not claimed”; Job adapters no longer enumerate a future Feed capability universe. Capability validation accepts well-formed namespaced future keys without changes to existing Job adapters.

The Job-owned minimum for sending a complete or partial Job item to policy is stable identity, primary text, secondary text, body text and source URL. It now lives in `policies/job_capture_policy.js`; adapters cannot weaken the rule independently, and generic extraction does not apply it to other domains.

### ExtractionResult

`core/extraction_result.js` owns the source-neutral result factory, validation, capability-count quality and exception guard. The serialisable contract is:

```text
status
item
capture_quality { level, required_total, required_captured,
                  optional_total, optional_captured }
captured_capabilities
missing_capabilities
warnings
errors
source_data
```

- `complete`: all declared required and optional supported fields were captured without an adapter warning.
- `partial`: a `LensItem` exists but a supported capability is missing or the adapter reported degraded capture.
- `unsupported`: the recognised/current structure cannot safely produce an item.
- `failed`: the adapter threw, returned an invalid result or supplied non-serialisable item/source data.

Unexpected discovery or extraction exceptions are contained by `guardExtraction`; failed and unsupported items never reach matching. `policies/job_capture_policy.js` permits a partial Job item only when it contains the Job minimum. No probability or fabricated confidence is used.

The legacy extracted-job object is retained as opaque plain `source_data` only until the Job compatibility/record boundary. `compatibility/job_extraction_compat.js` maps it to `LensItem`; generic core does not interpret it. This keeps record IDs, source metadata, storage, reports, imports and exports byte-compatible. Extraction status is exposed in the capture response and Adapter Doctor preview, but is not added to stored records, so old and new records remain compatible without migration.

### Production flows

```text
LinkedIn Jobs location
  -> canonical registry
  -> linkedin_jobs runtime adapter
  -> existing LinkedIn detail/card DOM helpers
  -> ExtractionResult
  -> centralized complete/usable-partial gate
  -> Job extraction compatibility -> LensItem
  -> Job capture policy -> Job policy -> existing ARK record/session/report path

SEEK Jobs location
  -> canonical registry
  -> seek_jobs runtime adapter
  -> existing SEEK DOM/Apollo helpers
  -> ExtractionResult
  -> centralized complete/usable-partial gate
  -> Job extraction compatibility -> LensItem
  -> Job capture policy -> Job policy -> existing ARK record/session/report path
```

The real fixtures demonstrate four complete detail captures, one deliberately degraded but usable LinkedIn recommendation-card partial, and two unsupported structures that are not scored. The existing SEEK cache fallback also remains operational.

### Fix Capture and remaining coupling

Fix Capture now reaches each Job adapter through `discoverItems` and `extractItem`, and reports extraction status and capability quality during preview. Its selector profiles, validation, help file, preview/test/activation flow, last-known-good storage and rollback remain unchanged and job-specific.

Fix Capture remains job-specific in F2. Generic DOM Doctor work begins only after the adapter and capability contracts are green. F3 still needs to address generic repair capability schemas, repair-profile versioning, adapter-neutral diagnostics, preview and activation, last-known-good rollback across item types, and DOM Doctor UI terminology. No Feed selectors, routes, permissions, repair profiles or AI were added in F2.

### Files and size

- Added: `sources/source_adapter_registry.js`, `core/extraction_result.js`, `tests/source-adapter-contract.test.js`, and this architecture record.
- Modified: content routing/capture and Fix Capture preview in `content_bundle.js`; canonical source use and injection order in `background.js` and `popup/`; browser, boundary, smoke, session and package tests; peer-alpha packaging.
- Source-specific selector profiles and extraction helpers intentionally remain in the source/content layer.
- `content_bundle.js`: 3,722 lines in the packaged post-F1 snapshot; 3,835 lines after F2.

### Completion evidence

- `npm.cmd test`: passed (10 fast suites plus real-world extraction and report browser suites).
- Protected behavior: 37 classification cases and exact Dorr presentation checks passed.
- Real-world pages: seven fixtures passed, including LinkedIn and SEEK detail paths, degraded/unsupported truthfulness, SEEK cache fallback and Fix Capture preview/repair safety.
- Current post-F2.5 package: `ark-lens-v2026.6.19-peer-alpha.zip`, 44 entries, with F2 runtimes plus the Job-owned capture/compatibility boundaries and no Feed code, tests or fixtures.
- Current package SHA-256: `a387b06d07270be10e0df3482a94eaf4a156a2a0ce6b55fce6329806e82d1a77`.
