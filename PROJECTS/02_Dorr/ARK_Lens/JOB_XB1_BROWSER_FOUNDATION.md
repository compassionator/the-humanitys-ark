# JOB_XB1 browser foundation

## Purpose

Prepare the existing Chrome Job Search Lens for thin Firefox and Safari shells without copying product logic or changing Chrome behavior.

## Ownership change

Before JOB_XB1, six production files made 74 direct browser API references, the 17-script Job injection order was duplicated in the background worker and popup, and storage/message strings were repeated across execution contexts.

After JOB_XB1:

- `platform/browser_capabilities.js` owns active-tab lookup, tab queries, ordered injection, tab/runtime messaging, local storage, extension URLs/pages, action state, and required lifecycle subscriptions. It selects `globalThis.browser` before `globalThis.chrome` and normalizes Promise and callback APIs.
- `runtime/job_runtime_order.js` is the only production source of Job content-script execution order. The existing 17 scripts retain their relative order after the browser-capability and Job-contract prerequisites.
- `contracts/job_contracts.js` owns the existing seven storage keys, eleven runtime message names, session prefix, browser-restart reason, and record/adapter/content versions. Values and persisted shapes are unchanged.
- `background.js`, `content_bundle.js`, the popup, report, Lens editor, and Alpha Guide consume those boundaries and contain no raw browser API calls.

The package allow-list remains an independent file-isolation boundary, and the test oracle independently checks the canonical execution order. Neither replaces the runtime-order owner.

## Remaining shell ownership

Chrome still owns `manifest.json`, its service-worker declaration, permissions, supported hosts, controlled-alpha packaging, and manual browser validation. Firefox and Safari Job manifests, packages, and manual gates do not exist yet.

## Negative scope

No source adapter, selector, score, Lens Pack meaning, workflow state, report presentation, editor behavior, Fix Capture behavior, storage schema, permission, supported host, Feed runtime, DORR rule, AI integration, or user-visible design changed.

## Gates

The protected gate covers 37 scoring cases, seven Job extraction fixtures, Fix Capture, sessions, reports, Lens editing, browser capability mocks, direct-API ownership, canonical runtime order, exact Job/Feed package isolation, and the existing Chrome/Firefox/Safari Feed proofs.

## Next stages

- `JOB_XB2` — thin Firefox Job shell.
- `JOB_XB3` — thin Safari Job shell, in parallel after JOB_XB1 merges.
- `JOB_XB4` — cross-browser Job package-parity gate.
