# ARK Lens Foundation F0 Map

**Recorded:** 2026-07-22  
**Protected release:** v2026.6.19 controlled peer alpha  
**Scope:** Job Search Lens only; no Feed DOM behavior

## Green baseline

The untouched baseline passed `npm.cmd test` before the foundation patch:

- smoke, Lens Pack, editor, Adapter Doctor, report, peer-alpha, and session-indicator contracts;
- 37 frozen scoring cases;
- seven sanitized real-world extraction fixtures;
- the production report browser interaction.

After adding explicit matcher characterizations, the same full gate remained green. After the F1 extraction, the full gate remained green again with no fixture, score, workflow, reason, report, or record-schema updates.

## Runtime dependency map

```text
popup / background session start
  -> bundled_lens_pack.js
  -> lens_pack_runtime.js
  -> core/lens_item.js
  -> core/deterministic_matcher.js
  -> policies/job_policy_runtime.js
  -> content_bundle.js

content_bundle.js
  -> source detection and adapter profile
  -> LinkedIn Jobs or SEEK Jobs extraction
  -> extracted job -> LensItem
  -> deterministic matcher -> observable lexical evidence
  -> Job policy -> score, workflow, explanation, Dorr presentation
  -> unchanged ARK record builder
  -> Chrome local storage and session update
  -> report/report.js
```

The pure core has no `document`, `window`, Chrome API, selector, session, storage, or network dependency. Browser loading uses ordered plain scripts; Node tests use CommonJS. No bundler was introduced.

## `content_bundle.js` responsibility map

### Bootstrap and runtime health

`probeExtensionContext`, `isExtensionContextError`, `isExtensionContextHealthy`, and `handleInvalidatedExtensionContext` protect reinjection and fail-soft cleanup.

### Source registry and profiles

`SOURCE_ADAPTER_REGISTRY` routes implemented LinkedIn Jobs and SEEK Jobs adapters and retains Hays Jobs as planned. `DEFAULT_ADAPTER_PROFILES`, `cloneDefaultAdapterProfile`, `getLinkedInProfile`, `getSeekProfile`, `selectorsFromProfile`, `getAdapterProfile`, and `getAdapterProfileWithSource` own source-specific selector data and override resolution.

### Normalisation and safe DOM access

`cleanText` remains an extraction utility; extraction reuses the core `normalize` and `escapeRegExp` helpers. `safeQuerySelector`, `safeQuerySelectorAll`, `getLinkedInDomScopes`, `queryLinkedInDom`, `firstLinkedInDomMatch`, `getFallbackRoot`, `getScopedRoots`, `textOfIn`, and `firstScopedText` provide the existing accessible open-Shadow-Root and same-origin-frame query layer.

Lexical normalisation and whole-term matching now live only in `core/deterministic_matcher.js`: `normalize`, `escapeRegExp`, `keywordToWholeTermRegex`, and `containsAny`.

### Storage and migration

`getSession`, `getRecords`, `cloneDefaultLensPack`, `normalizeLensPack`, `ensureLensPackStorage`, `getActiveLensPack`, `getRecordCaptureQuality`, `preserveRicherExistingRecord`, `saveRecord`, and `updateActiveSessionAfterSave` own current Chrome-local reads, Lens Pack migration, richer-record preservation, record writes, and session counters. This patch does not alter stored records or migration behavior.

### LinkedIn Jobs extraction

Identity and routing: `getJobIdFromRoot`, `getLinkedInRequestedJobId`, `getJobIdFromHref`, `getLinkedInRecordUrl`, `getCurrentJobIdParam`, `getJobIdFromUrlOrLinks`, `getEffectiveLinkedInJobId`, `isLinkedInJobsPage`, and collection-card identity helpers.

Detail selection and readiness: `hasTextMatch`, `getLinkedInDetailEvidenceScore`, `hasLinkedInDetailContent`, `firstLinkedInDetailText`, `getLinkedInDetailContentSignature`, `findLinkedInDetailAncestor`, `getLinkedInDetailRootCandidates`, `getLinkedInJobDetailRoot`, and `getJobRoot`.

Fields and platform state: `cleanLinkedInMetaText`, semantic field helpers, `getBestTitle`, `getBestCompany`, `getBestLocation`, `getDescription`, and `getPlatformState`.

Card and collection fallbacks: the recommendation-card candidate/scoring helpers, collection-card candidate/scoring helpers, `inferCompanyAndLocation`, `cleanInferredCompany`, `isUsefulLinkedInCompany`, `extractLinkedInRecommendationCard`, `extractLinkedInCollectionsCard`, and `extractCurrentLinkedInJob`.

### SEEK Jobs extraction

`getSeekJobIdFromHref`, `getSeekJobIdFromUrlOrLinks`, `extractJsonObjectAfterMarker`, `getSeekApolloData`, `resolveSeekRef`, `getSeekListingDateLabel`, `findSeekApolloJob`, `getSeekClassificationText`, `getSeekApolloJobFields`, `getEffectiveSeekJobId`, `getSeekRecordUrl`, `getSeekText`, `getSeekPlatformState`, and `extractCurrentSeekJob` own observable DOM extraction plus the existing local Apollo-cache fallback.

### Extracted item and record creation

`buildExtractedJob` preserves the current adapter output. `core/lens_item.js#fromJobExtraction` maps either implemented job adapter to the first source-neutral `LensItem`. `createArkRecord` preserves the existing persisted schema, classification placement, routing fields, memory fields, metrics, and metadata.

### Adapter Doctor / Fix Capture

Validation and redaction: `isPlainObject`, `validateAdapterStringArray`, `validateAdapterSelector`, `validateAdapterRepairProfile`, `formatAdapterRepairValidationErrors`, `redactUrlForHelpFile`, `redactPersonalText`, `deepMergeProfile`, and `isValidAdapterProfile`.

Diagnostics, preview, testing, activation safety, and rollback: selector diagnostic helpers; source-specific Doctor preview helpers; `getAdapterDoctorContext`; `getAdapterDoctorStatus`; `testAdapterDoctorExtraction`; `getDoctorDomDiscovery`; `doctorCheck`; `buildAdapterDoctorChecks`; `getDoctorHealth`; `getDoctorNextAction`; `rememberLastKnownGoodAdapterProfile`; `runAdapterDoctorHealthCheck`; `redactDoctorHelpValue`; `buildAdapterHelpFile`; `exportAdapterDoctorDebug`; `inspectAdapterRepairProfile`; and `testAdapterRepairProfile`.

The Doctor remains job-shaped in F1. Generalisation is deliberately deferred until the capability-aware adapter contract in F2/F3.

### Source router and session orchestration

`getCurrentSourceAdapter`, `getEffectiveCurrentItemId`, `getEffectiveCurrentItemKey`, `isSourceAdapterAllowedByLens`, and `extractCurrentItemForActiveLens` route the active job adapter.

`captureCurrentJob`, `captureIfJobChanged`, `scheduleJobChangeCheck`, collection click tracking, `checkForActiveJobChange`, `startJobChangeWatcher`, `stopJobChangeWatcher`, `startObserver`, `stopObserver`, and `handleArkLensMessage` own manual sessions, retry/wait behavior, SPA/listener recovery, and storage orchestration.

### Report path

`report/report.js` remains the reader and presenter for unchanged records. Its display normalisation, fit-state mapping, evidence rendering, notes, decisions, explicit relevance feedback, filtering, safe URLs, JSON/CSV export, and browser interaction contracts remain unchanged.

## Matcher behavior frozen in F0

`tests/matcher-contract.test.js` now explicitly protects:

- whole-term boundaries and case insensitivity;
- multiword phrases across spaces and hyphens;
- duplicate keywords and deterministic duplicate ownership;
- title, company, location, description, metadata, and all scopes;
- blockers and forced blocker outcomes;
- penalties, negative caps, score floors, conditional floors, keyword floors, and per-rule caps;
- forced workflow outcomes;
- decisive and default explanations;
- exact preservation of Job Dorr presentation labels;
- LinkedIn Jobs and SEEK Jobs mapping into `LensItem`;
- the DOM/Chrome-free core boundary.

The existing 37-case corpus remains the authoritative exact-output freeze for real job data.

## Implemented F1 boundary

- `core/lens_item.js` defines and normalises the source-neutral item shape and maps existing job extraction results without changing persisted records.
- `core/deterministic_matcher.js` owns pure whole-term lexical matching, scope selection, matched signals, evidence, explanations, blockers, and honest unset action/priority fields.
- `policies/job_policy_runtime.js` owns Job Lens-only score arithmetic, role-fit semantics, floors/caps, workflow outcomes, explanations, applied-state handling, and the existing Dorr presentation.
- `content_bundle.js` owns browser concerns and delegates matching through `LensItem`; it no longer contains `scoreSignals` or signal matching.

This is the exact boundary proposed for subsequent F2 work: common policy and adapter capabilities can grow around `LensItem` and the evidence matcher, while Job policy remains isolated and unchanged.

## Current coupling risks

- Adapter discovery, extraction, storage, sessions, and Doctor behavior still share one content bundle.
- Adapter profiles and Repair Files still require job fields and `item_type: job`.
- The registry contract exposes current-item methods rather than capability-aware discovery and `ExtractionResult` states.
- `background.js` and popup source detection remain job-route-specific.
- Session and report field names still include job terminology.
- The source-neutral item is currently ephemeral; persisted records intentionally remain on the frozen schema until an explicit migration is designed.
- Plain-script load order is a runtime dependency and must remain covered by tests and packaging.

These risks are the intended F2/F3 work. None should be combined with Feed DOM behavior.
