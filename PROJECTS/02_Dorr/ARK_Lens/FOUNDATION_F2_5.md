# ARK Lens Foundation F2.5 Separation Audit

**Date:** 2026-07-22  
**Scope:** prove and enforce Job/Feed domain independence before F3  
**F3 status:** not started

## Actual dependency and responsibility map

Arrows mean “depends on or calls”.

```text
domain-neutral core
  core/lens_item.js
  core/deterministic_matcher.js
  core/extraction_result.js

source infrastructure
  sources/source_adapter_registry.js

Job compatibility
  compatibility/job_extraction_compat.js -> core/lens_item.js

Job Lens domain
  policies/job_capture_policy.js -> core/extraction_result.js
  policies/job_policy_runtime.js
    -> core/deterministic_matcher.js
    -> compatibility/job_extraction_compat.js (legacy classifyExtractedJob API only)

Job source adapters and Job/browser orchestration
  content_bundle.js
    -> Lens Pack runtime
    -> core/deterministic_matcher.js (normalisation helpers)
    -> core/extraction_result.js
    -> sources/source_adapter_registry.js
    -> compatibility/job_extraction_compat.js
    -> policies/job_capture_policy.js
    -> policies/job_policy_runtime.js
    -> DOM and Chrome APIs

browser orchestration
  background.js -> sources/source_adapter_registry.js, Chrome APIs
  popup/popup.js -> source registry, Lens Pack runtime, Chrome APIs

presentation/reporting
  report/report.js -> Job records, Lens Pack runtime, Chrome storage

packaging
  tests/tools/build-peer-alpha-package.js -> explicit shared + Job allow-list
```

| Module or cluster | Classification | Actual ownership | Mixed responsibilities |
|---|---|---|---|
| `core/lens_item.js` | domain-neutral core | Optional common item envelope and text normalisation | None after the Job conversion helper was removed. |
| `core/deterministic_matcher.js` | domain-neutral core | Source-neutral lexical evidence matching | None. It does not decide Job score, workflow or action. |
| `core/extraction_result.js` | domain-neutral core | Serializable result shape, status, capability coverage and exception containment | None after processability was removed. |
| `sources/source_adapter_registry.js` | source infrastructure | Source identity/status, source URL matching, capability declarations, runtime lookup/contract enforcement | Also contains current Job source-definition metadata. It does not select domain policy or interpret items. |
| LinkedIn/SEEK runtime blocks in `content_bundle.js` | Job source adapter | DOM discovery, identity and extracted-job production | Co-located with the monolith, but do not score or choose workflow. |
| `compatibility/job_extraction_compat.js` | Job compatibility layer | Converts the legacy extracted-job shape to a generic `LensItem` | Intentionally Job-specific. |
| `policies/job_capture_policy.js` | Job Lens domain | Decides whether a complete/partial Job result is usable | None. |
| `policies/job_policy_runtime.js` | Job Lens domain | Job score, blocker logic, confidence, workflow and Dorr | Keeps a legacy classify-extracted-job wrapper through the Job compatibility layer. |
| Job capture in `content_bundle.js` | Job Lens domain + browser orchestration | Coordinates adapter, Job capture policy, Job policy, record saving and retries | Real mixed ownership; retained to avoid destabilising the extension. |
| Fix Capture/profile blocks | Job Lens domain + browser orchestration | Job selector profiles, validation, preview, activation, last-known-good and rollback | Job-shaped by design; not a generic repair system. |
| Sessions and records in `content_bundle.js` | Job Lens domain + browser orchestration | Current Job peer-alpha session and record keys/shapes | Names are broad, but callers and payloads are Job-specific. |
| `report/` | presentation/reporting | Existing Job record totals, details, feedback and exports | Job-owned, not a generic Lens report. |
| `background.js` | browser orchestration | Session indicator, supported navigation and reinjection | Current session semantics are Job-alpha semantics. |
| `popup/` | browser orchestration + presentation/reporting | Job session controls, Job source readiness and Fix Capture UI | Mixed Job presentation and browser control. |
| package builder | browser orchestration/build infrastructure | Reproducible controlled Job peer-alpha archive | Boundaries are now explicit by category and exact file. |

## Separation leaks found and corrected

### 1. Job partial requirements were shared infrastructure

The five-field rule was exported as `JOB_PROCESSING_MINIMUM_CAPABILITIES` by `sources/source_adapter_registry.js`, and generic `ExtractionResult` exposed `canProcessExtractionResult`. This made a shared registry/core combination the owner of Job scoreability.

Correction: the exact unchanged rule now lives in `policies/job_capture_policy.js`:

```text
stable_item_identity
primary_text
secondary_text
body_text
source_url
```

`content_bundle.js` calls `JOB_CAPTURE_POLICY.canProcess(result)`. Generic extraction validates and describes data but makes no domain processability decision. Unsupported and failed results remain unprocessable.

### 2. Generic LensItem interpreted legacy Job extraction

`core/lens_item.js#fromJobExtraction` knew the legacy `source`, `display`, `content`, `platform_state`, location and posted fields.

Correction: that mapping moved unchanged to `compatibility/job_extraction_compat.js#toLensItem`. Generic `LensItem` now only constructs its own neutral contract and treats `metadata` as uninterpreted extension data.

### 3. Capabilities were a closed cross-domain enumeration

The registry rejected unknown capabilities, and every Job/planned adapter enumerated all anticipated Feed capabilities as unsupported. Adding one Feed capability therefore required editing Job adapter declarations and tests.

Correction: current built-in keys remain documented for compatibility, but capability validation now accepts any well-formed free string using:

```text
^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$
```

New domain capabilities should be namespaced, for example `interaction.comments_loaded_count`. Undeclared means the adapter does not claim support. LinkedIn Jobs, SEEK Jobs and Hays no longer enumerate the future Feed universe. Existing unnamespaced Job-era keys remain owned by the current Job adapter declarations to avoid a behavioral rename.

Current built-in vocabulary:

```text
item_discovery, stable_item_identity, primary_text, secondary_text,
body_text, location, source_url, platform_state,
spa_observation, repair_profile
```

Adding `interaction.comments_loaded_count` now requires no edit to LinkedIn Jobs, SEEK Jobs, Hays Jobs, Job tests or current Job package metadata.

### 4. Package inclusion was directory-wide

The Job alpha builder recursively included all of `core/`, `sources/` and `policies/`. A future unfinished Feed module placed there would silently enter the Job archive.

Correction: `PACKAGE_BOUNDARIES` now has exact file allow-lists for shared runtime, Job runtime, browser orchestration, Job UI/reports, Job schemas and package assets/docs. `feed_lens_runtime` and `combined_runtime` are explicitly empty. Every produced file is checked against the allow-list, and Feed-named implementation paths are rejected.

## ExtractionResult audit

The exact generic result remains:

```text
status
item
capture_quality
captured_capabilities
missing_capabilities
warnings
errors
source_data
```

It contains serialisable plain data only, imports no adapters/policies/storage/reports and contains no Job or Feed workflow/action assumptions. `source_data` is deliberately an opaque adapter-owned compatibility payload. Generic core validates that it is serialisable but never reads its fields. Only `compatibility/job_extraction_compat.js` and the existing Job record boundary interpret the legacy Job payload.

The name is retained because changing it would create compatibility churn without improving the boundary.

## Authoritative registry audit

The registry owns adapter identity, display name, item type, implementation status, URL matching, capability declarations, runtime contract enforcement and lookup. It owns no scoring, workflow, minimum capture rule, Feed action, report, session, storage, repair interpretation or selector.

Source URL matching branches by registered source ID because the current patterns need path/query semantics; it does not branch by `item_type` or select Job/Feed domain policy. Planned Hays cannot receive an implementation or be returned as runnable.

## Job-owned concepts

The following remain outside generic core: company/location interpretation, role description, applied state, blockers, role fit, Job score/confidence, apply/review/ignore/applied workflow, Job Dorr, existing ARK Job record shape, current report, Job session terminology, Fix Capture, and Job repair profiles.

Generic `LensItem` fields are optional. Neither `secondary_text`, `body_text`, `source_url`, company, location nor applied state is mandatory to construct a generic item. Only Job capture policy makes its five fields mandatory for Job processing.

## Storage and report boundary

No storage migration was made. Existing Job records and sessions retain their keys and shapes, and the current report continues to read only those records.

A future shared envelope may be introduced independently:

```text
common envelope
  lens_id
  item_type
  source_adapter_id
  captured_at
  common evidence

domain payload
  Job record payload | Feed action/report payload
```

Until such a migration is intentionally designed, Feed records/sessions should use Feed-owned storage modules and keys. Feed reporting must not pass its payload through `createArkRecord` or the current `report/` implementation.

## Future Feed boundary (proposal only)

No files below were created:

```text
domains/feed/feed_capture_policy.js       capture eligibility
policies/feed_policy_runtime.js           allow/highlight/reduce/blur/collapse/session-hide
sources/linkedin_feed_adapter.js          Feed DOM discovery/extraction
orchestration/feed_capture.js             Feed runtime coordination
sessions/feed_session.js                  attention budget and session semantics
storage/feed_records.js                   Feed-owned persistence/envelope
reports/feed/                              Feed action/evidence reporting
repair/feed/                               Feed repair interpretation after generic repair contracts exist
ai/feed_proposals.js                       optional proposals behind a non-authoritative boundary
```

Sponsored/recommendation evidence, metric hiding, comment gating, thread/repost context and manual Dorr tagging belong to those Feed-owned layers. Shared registration/build metadata may need additions, but Job scoring, workflow, source adapters, report and Fix Capture schema need not change.

## Remaining content_bundle.js monolith

Responsibility clusters still co-located are:

1. Chrome storage, session and record persistence;
2. adapter profiles and Fix Capture;
3. LinkedIn Jobs discovery/extraction;
4. SEEK Jobs discovery/extraction;
5. source routing and ExtractionResult creation;
6. Job capture/retry/policy/record orchestration;
7. SPA observation, click tracking and message handling;
8. injected Job card UI.

Compatibility wrappers and the current record builder may safely remain until a consumer requires a cleaner boundary. Mutation observers, route handling and Chrome messaging should remain close to browser orchestration. The smallest later extraction sequence is: move each Job adapter DOM block to a source-owned module, then move Job record construction/storage coordination to a Job-owned module, and only then generalise repair diagnostics. Fix Capture should not be split cosmetically during this audit.

## Audit test coverage

`tests/lens-separation.test.js` protects:

- generic core imports no Job/Feed policy or source/compatibility layer;
- generic extraction has no Job field minimum or processability decision;
- Job partial eligibility is owned by Job capture policy and remains unchanged;
- generic partial items may omit secondary text, body text and source URL;
- unsupported/failed Job results cannot process;
- namespaced future capabilities validate without mutating Job adapters;
- registry imports no domain policy and selects no domain policy by item type;
- Job source/compatibility/policy code imports no Feed module;
- `source_data` remains opaque to generic core;
- package inputs are exact-file allow-lists with empty Feed/combined sets;
- no Feed implementation exists in current implementation roots.

All F0/F1/F2 behavior, extraction, Fix Capture, report, session and package tests remain in the full gate.

## Completion evidence

- `npm.cmd test`: passed, including 11 fast suites plus real-world extraction and report browser suites.
- Protected behavior: all 37 classification cases and exact Dorr presentation checks passed.
- Source behavior: all seven real-world fixtures passed with the same four complete, one usable partial and two unsupported outcomes.
- Fix Capture, reports, sessions, feedback, imports/exports and active-session behavior passed their existing gates.
- Package: `ark-lens-v2026.6.19-peer-alpha.zip`, 44 entries, produced from 42 explicitly allowed inputs plus generated build/checksum files.
- Archive inspection: Job capture policy and Job compatibility are present; Feed paths, tests and fixtures are absent.
- SHA-256: `a387b06d07270be10e0df3482a94eaf4a156a2a0ce6b55fce6329806e82d1a77`.
