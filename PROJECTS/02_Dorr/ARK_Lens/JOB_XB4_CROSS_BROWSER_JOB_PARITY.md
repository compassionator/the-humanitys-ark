# JOB_XB4 cross-browser Job parity audit

## Purpose

Confirm that Chrome, Firefox, and Safari package one shared Job Search Lens implementation, that browser ownership is limited to manifests/background declaration and generated metadata, and that each unvalidated platform is ready for its separate manual gate.

## Audited commit

- Merged `main`: `c9ba890c0efbb23f86c8757fd096b92f81dfa1d0` (PR #13 merge).
- Audit environment: Windows, Node.js 24, pinned `web-ext` 10.3.0.
- Narrow audit corrections: Firefox/Safari product name and description aligned with Chrome; deterministic shared-metadata assertions added; manual checklists made explicit. No runtime, permission, host, selector, policy, storage, UI, or Feed file changed.

## Package matrix

| Platform | Job code/package | Automated gate | Manual runtime | Distribution |
|---|---|---|---|---|
| Chrome desktop | Present | Passed | Passed | Controlled alpha |
| Firefox desktop | Present | Passed | Pending | Not started |
| Firefox Android | Present | Passed | Pending | Not started |
| Safari macOS | Present | Passed | Pending | Not started |
| Safari iOS/iPadOS | Present | Passed | Pending | Not started |

Each Job package contains exactly 54 files. Audit-run ZIP SHA-256 values were:

- Chrome: `21afcbe3a1e202060f1e77118dfdc50d608f5079b303144afedae6a942b18893`
- Firefox: `6113d316cf2a7a74114ff162817da4d72804e6018746e4ef9d8dd88ed0f85f82`
- Safari: `fe5c42f6f42d02a4200290340627a91c87f87830126ed93be83d38b51a363904`

ZIP hashes are run-specific because generated build timestamps and checksum bytes change. They are not runtime-parity evidence.

## Shared-file parity

The 51 non-generated, non-manifest Job files are byte-identical across all three packages. A machine-readable comparison was generated during the audit with relative path, three SHA-256 values, and a parity boolean; all 51 rows passed.

The concepts remain separate:

- `tests/tools/job-lens-package.js` owns the exact package source allow-list.
- `runtime/job_runtime_order.js` owns execution order.
- `tests/package-isolation.test.js` independently owns the expected-file/parity oracle.

Allowed package differences are only `manifest.json`, generated `BUILD_INFO.json`, generated `SHA256SUMS.txt`, ZIP bytes, and the ZIP sidecar hash.

## Allowed manifest differences

All staged manifests share Manifest V3, product name/version/description, icons, popup/action, `activeTab`, `scripting`, `storage`, and the exact LinkedIn/SEEK hosts. None declares content scripts, downloads, notifications, native messaging, remote code, telemetry, Feed hosts, or Feed scripts.

| Browser | Classified difference |
|---|---|
| Chrome | Root manifest; `background.service_worker` is `background.js`; no Gecko metadata. |
| Firefox | Required background declaration uses ordered shared scripts before `background.js`; required Gecko ID, minimum desktop/Android versions, and `data_collection_permissions: none`; no service worker declaration. |
| Safari | Separately owned source manifest stages the same semantic manifest as Chrome; no Gecko, Apple-team, entitlement, signing, provisioning, Xcode, or App Store metadata. |

No unexplained manifest difference remains.

## Browser background ownership

Chrome and Safari run the same `background.js` service worker. It conditionally imports the shared capability, contract, runtime-order, source-registry, and Job-catalogue prerequisites. Lifecycle listeners register at top level, no DOM API is used, session recovery reads extension-local storage, and no mutable process-global state is required for correctness.

Firefox loads the same prerequisites in manifest order before the same `background.js`. Conditional imports therefore do not duplicate them. The shared capability layer selects `globalThis.browser` before `globalThis.chrome`. Content reinjection retains the existing health probe, listener removal, observer stop, and duplicate-listener guards.

This is static and automated readiness evidence, not a live lifecycle pass.

## Job/Feed isolation

- Chrome, Firefox, and Safari Feed packages remain 17 files each with 14 byte-identical shared Feed runtime/UI files.
- No Job file appears in a Feed package and no Feed file appears in a Job package.
- PR #13 and XB4 changed no Feed implementation file.
- No browser shell combines the Job and Feed domains.

## Automated gates

Passed: clean exact packaging, browser-capability contracts, JOB_XB1 foundation contracts, 37 scoring cases, seven Job fixtures, ten Feed structures, Lens Packs/editor, sessions, reports, Fix Capture/rollback contracts, package ZIP/signature/checksum validation, Firefox Job lint, Firefox Feed lint, `git diff --check`, and repository-relative Markdown links.

The lockfile and dependencies are unchanged. The environment reports the existing `whatwg-encoding` deprecation. Registry audit egress is unavailable, so no dependency audit repair or upgrade was attempted.

## Manual-validation status

- Chrome desktop retains its user-confirmed controlled-alpha manual evidence.
- Firefox desktop and Android remain separate pending gates in `JOB_XB2_FIREFOX_JOB_MANUAL_GATE.md`.
- Safari macOS and iOS/iPadOS remain separate pending gates in `JOB_XB3_SAFARI_JOB_MANUAL_GATE.md`.
- Package pass is not runtime pass; simulator is not physical device; runtime pass is not signed distribution.

## Distribution status

Chrome remains controlled alpha. Firefox distribution has not started. Safari containing-app generation, signing, provisioning, notarization/TestFlight, and App Store work have not started. A staged Safari ZIP is not directly installable on iOS/iPadOS.

## Known blockers

Firefox and Safari manual evidence requires the relevant browsers, operating systems, and devices. These are evidence gates, not automated failures. No software-only defect blocks the manual gates.

## Final verdict

`JOB_XB4 PASSED — CROSS-BROWSER JOB PACKAGE PARITY CONFIRMED`

## Next product stage

`FEED_DESIGN_REVIEW — OWNER POPUP AND REPORT JOURNEY`
