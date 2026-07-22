# ARK Lens Foundation Release F3A

## Scope and protected baseline

F3A extracts existing Job DOM ownership; it does not change Job Lens behavior. The protected rollback baseline is commit `fcf717c20834c3f78d5933ffad713e01ed602eb6`, created from the previously uncommitted F2.5 working state. The protected package supplied for that state is `ark-lens-v2026.6.19-peer-alpha.zip` with SHA-256 `a387b06d07270be10e0df3482a94eaf4a156a2a0ce6b55fce6329806e82d1a77`.

A baseline rebuild passed all tests but produced SHA-256 `636cc5a47f86605ff4758671c0d6693fcf224b6ae988b8f2688da57c43f67659`. The difference is expected: the package builder writes a fresh `BUILD_INFO.json.generated_at`, and ZIP entry timestamps are regenerated. Package identity, exact-file allow-list, and runtime contents otherwise remained governed by the existing builder.

> Feed Lens implementation has not begun.

> Fix Capture has not been generalised into DOM Doctor.

> F3A extracts existing Job source ownership and introduces diagnostics only.

## Pre-F3A responsibility map

Before extraction, `content_bundle.js` mixed these responsibilities:

| Responsibility | LinkedIn Jobs | SEEK Jobs | F3A classification |
| --- | --- | --- | --- |
| Route and page recognition | LinkedIn Jobs URL/page checks | SEEK URL/page checks | Source DOM logic |
| Readiness and discovery | detail scope, collections workspace/card discovery, requested/current identity | detail root, current identity | Source DOM logic |
| Field extraction | title, company, location, description, applied state | DOM fields, Apollo cache fields, applied state | Source DOM logic |
| Identity and URL | query/link/card identity, canonical Job URL, fallback signature | query/path/link identity, exact/canonical URL | Source DOM logic |
| Source fallback | recommendation/collection card snapshots, detail-signature guard | Apollo cache and visible-DOM fallback | Source DOM logic |
| SPA/lazy DOM support | deep same-origin frame/open-shadow traversal and source caches | safe scoped reads | Shared utility where neutral; otherwise source DOM logic |
| Selector/profile access | LinkedIn default and repair profile reads | SEEK default and repair profile reads | Source DOM logic; persisted profile orchestration remains Job-owned |
| Capture retries and change observation | retry timing, MutationObserver, timers, event dispatch | same orchestration | Browser/Job orchestration; remains in `content_bundle.js` |
| Fix Capture | validation, preview, test, activation, last-known-good, rollback | same | Fix Capture; remains in `content_bundle.js` and popup |
| Persistence and presentation | records, sessions, scoring, workflow, Dorr, report | same | Job orchestration/storage/report; remains outside adapters |

## Final source ownership

- `sources/jobs/linkedin_jobs_adapter.js` is the single active implementation for LinkedIn Jobs selectors, deep DOM discovery, detail/card extraction, source readiness, source identity/URL, platform state, collections click snapshot, source fallbacks, and source diagnostic observations.
- `sources/jobs/seek_jobs_adapter.js` is the single active implementation for SEEK Jobs selectors, DOM/Apollo-cache extraction, source readiness, source identity/URL, platform state, source fallbacks, and source diagnostic observations.
- `sources/dom_read_utils.js` contains only the small neutral read helpers used by both adapters: text cleanup, profile selector lookup, guarded query operations, first text/match, visibility, and query-parameter identity lookup.
- `sources/jobs/job_extraction_builder.js` preserves construction of the legacy extracted-Job payload used by compatibility and records.
- `sources/jobs/job_adapter_result.js` bridges a source-owned extracted Job through the existing Job compatibility runtime into the protected F2 `ExtractionResult`.
- `sources/adapter_diagnostics.js` owns the adapter-neutral read-only diagnostic shape.

The authoritative `sources/source_adapter_registry.js` remains the only registry. It still owns source identity, display name, item type, status, URL matching, capability declarations, contract validation, and lookup; it contains no selectors or policy.

## Adapter runtime contract

Each implemented source module exposes `create(context)` and a frozen runtime with:

- `discoverItems()` for observable source candidates;
- `extractItem(candidate, options)` returning the existing F2 `ExtractionResult`;
- `deriveItemId(candidate, result)` for stable source identity;
- `diagnose(options)` for read-only structural diagnostics.

Compatibility methods are also exposed for the existing Job lifecycle and Fix Capture callers. The adapters contain no scoring, workflow, Dorr selection, record/session writes, report behavior, Feed code, or repair activation.

## Actual production flow

The current production call chain is:

```text
content capture/SPA orchestration
  -> authoritative source registry lookup
  -> LinkedIn Jobs or SEEK Jobs runtime adapter
  -> source-owned raw extraction
  -> existing Job extraction compatibility -> LensItem
  -> F2 ExtractionResult (LensItem + legacy source_data)
  -> Job capture policy eligibility
  -> deterministic matcher through Job policy
  -> existing Job record/session/report path
```

The compatibility conversion occurs inside `job_adapter_result.js` so the adapter continues to return the exact F2 `ExtractionResult` contract expected by the existing capture policy. No policy decision occurs inside an adapter.

## Diagnostics

The final diagnostic object contains exactly:

```text
adapter_id
item_type
location_supported
structure_detected
discovered_item_count
capture_status
captured_capabilities
missing_capabilities
selector_observations
warnings
errors
timestamp
```

Each selector observation contains only `selector_key`, `matched`, `match_count`, `required`, and a generic `observation`. The output deliberately excludes selectors, copied page content, DOM nodes, functions, Chrome objects, LensItems, and raw source data.

Diagnostics are read-only. They perform no repair, profile mutation, selector activation, scoring, workflow, or storage write. The existing user-triggered Fix Capture path can request `ARK_ADAPTER_DIAGNOSTICS`; this does not change its UI, schema, persisted profile format, activation, last-known-good, or rollback behavior.

## Runtime loading order

`background.js`, `popup/popup.js`, and both browser harnesses load the same dependency order:

1. Lens Pack data/runtime;
2. generic LensItem, matcher, and ExtractionResult core;
3. authoritative source registry;
4. neutral DOM read utilities and adapter diagnostics;
5. Job extraction builder and Job adapter-result bridge;
6. LinkedIn Jobs adapter;
7. SEEK Jobs adapter;
8. Job extraction compatibility;
9. Job capture policy;
10. Job policy;
11. content orchestration.

## Compatibility wrappers

`content_bundle.js` retains a labelled `F3A compatibility boundary` for existing Fix Capture and lifecycle function names. Every wrapper delegates to one of the two canonical adapters or the neutral DOM read utility; it contains no selector table or extraction implementation.

Review these wrappers during F3B design. Remove a wrapper only after all Job lifecycle and Fix Capture consumers use the module interface directly and the controlled Job alpha gates still pass.

## Remaining content-bundle responsibilities

The remaining monolith is Job/browser orchestration rather than source extraction:

- extension-context lifecycle and injection cleanup;
- storage access, Lens Pack resolution, records, sessions, and report-compatible record creation;
- Job-owned Fix Capture profile validation, preview, test, activation, last-known-good, rollback, help export, and popup message bridge;
- capture-policy invocation, classification, save orchestration, retries, timers, MutationObserver, SPA change handling, and click forwarding;
- temporary compatibility wrappers.

## Fix Capture boundary

Fix Capture remains Job-owned and operational. Its schema, UI, preview, validation, explicit activation, last-known-good tracking, rollback, help file, and persisted repair profiles are unchanged. F3A adds no item types and performs no repair migration or generic repair interpretation.

## Package boundary

The peer-alpha builder remains exact-file allow-list based. It now explicitly includes the two source adapters, neutral DOM utility, adapter diagnostics, Job extraction builder, and adapter-result bridge. Recursive directory inclusion is not used. Tests, fixtures, and Feed paths are rejected and are not packaged. Package name and extension version remain unchanged.

## Manual Job alpha smoke checklist

This checklist is pending human verification; it has not been claimed as executed by automated browser fixtures.

### LinkedIn Jobs

- Open a supported Job detail page and start a session.
- Capture/classify; verify score, workflow, reasons, report record, and applied state.
- Navigate across SPA Job changes and verify correct identity/captures.
- Confirm the extension UI is not injected twice.

### SEEK Jobs

- Open a supported Job detail page and start a session.
- Capture/classify; verify score, workflow, reasons, and report record.
- Navigate and exercise visible-DOM/cache fallback behavior.
- Confirm the extension UI is not injected twice.

### Fix Capture

- Run preview and inspect diagnostics.
- Validate and test an existing-compatible repair profile.
- Activate it explicitly, confirm capture, then verify rollback.
- Confirm persisted existing profiles remain compatible.

## F3B prerequisites

Do not begin F3B automatically. Before designing a generic DOM Doctor:

- complete the human Job alpha smoke checklist above;
- review whether the temporary wrappers can be removed without changing Fix Capture;
- define privacy limits and stable semantics for any future cross-item diagnostic expansion;
- design an explicit repair ownership/migration boundary that preserves existing Job profiles and rollback;
- prove any future generic repair contract without introducing Feed workflow, records, reports, or sessions.

F3A makes those decisions possible but does not implement them.
