# ARK Lens

ARK Lens is a local-first browser system that turns supported web pages into inspectable, user-controlled views without requiring a hosted backend or AI provider.

## Start here

**Job Search Lens** is the current working product. Its manually tested controlled peer alpha runs on Chrome desktop and supports LinkedIn Jobs and SEEK Jobs.

JOB_XB1 established one shared browser-capability boundary, canonical runtime order, and canonical storage/session contract. JOB_XB2/XB3 now package that same implementation behind thin Firefox and Safari manifests. Chrome behavior is unchanged; Firefox and Safari runtime/device validation is still pending.

**Current release:** v2026.6.19

The **LinkedIn Feed extraction proof** is separate evidence that ARK Lens can read visible Feed posts through the shared architecture. It is not the completed **Feed Lens** product and does not filter, rank, park, persist, or modify Feed content.

ARK Lens is local-first. It requires no ARK account, telemetry service, remote backend, or built-in AI provider.

## Platform status

| Platform | Job Search Lens | LinkedIn Feed extraction proof |
|---|---|---|
| Chrome desktop | Implemented and controlled-alpha tested | Implemented and manually tested |
| Firefox desktop | Code/package implemented; manual validation pending | Implemented and manually tested |
| Firefox Android | Code/package implemented; device validation pending | Code/package implemented; device validation pending |
| Safari macOS | Thin shell/package implemented; device validation pending | Thin shell/package implemented; device validation pending |
| Safari iPhone/iPad | Thin shell/package implemented; device validation pending | Thin shell/package implemented; device validation pending |

“Implemented but device validation pending” means repository code and automated package gates exist, but the browser/device behavior has not passed its required manual gate.

## Privacy summary

- Local-first; there is no required ARK account or cloud service.
- No telemetry, analytics, advertising, or data brokerage.
- No CV or resume upload, API key, or model provider is required.
- No captured browsing data is sent automatically to an AI provider.
- The LinkedIn Feed extraction proof keeps its snapshot only in page memory and uses no persistent extension storage.
- Files are created only when the user explicitly exports them.
- Job Search Lens data remains in extension-local storage unless the user exports it.
- LinkedIn and SEEK may still require their own website accounts; ARK Lens does not replace those services.

## Where to begin

I want to:

- [Test Chrome Job Search Lens](#1-chrome-job-search-lens)
- [Build and validate the Firefox Job shell](#2-firefox-job-search-lens-shell)
- [Build the Safari Job staging shell](#3-safari-job-search-lens-staging-shell)
- [Run the Chrome Feed proof](#4-chrome-linkedin-feed-extraction-proof)
- [Run the Firefox Feed proof](#5-firefox-desktop-linkedin-feed-extraction-proof)
- [Build the Safari Feed staging package](#7-safari-feed-staging-and-manual-gate)
- [Understand the architecture](#architecture)
- [Read the current roadmap](#roadmap)

## What works now

- **Chrome Job Search Lens:** captures supported LinkedIn Jobs and SEEK Jobs pages through source-owned adapters.
- **Cross-browser Job foundation and shells:** browser capabilities, runtime order, storage keys, session messages, and lifecycle constants have canonical ownership; Chrome, Firefox, and Safari packages consume the same shared 51-file Job payload.
- **Deterministic Lens Packs:** inspectable keywords, match scopes, weights, penalties, blockers, caps, workflow behavior, and explanations. Semantic matching is not implemented.
- **Local sessions and reports:** source readiness, session controls, captured records, match evidence, workflow state, notes, decisions, relevance feedback, and JSON/CSV export.
- **Lens editor:** Basic fields plus Advanced JSON validation, save, export, bundled restore, create, rename, duplicate, and delete.
- **Fix Capture:** redacted Help Files and schema-validated Repair Files with preview, live-page testing, activation only after a pass, and rollback.
- **LinkedIn Feed extraction proof:** read-only, in-memory scanning, observation, duplicate suppression, stop, clear, diagnostics, and explicit local JSON export.
- **Desktop Feed evidence:** Chrome and Firefox desktop manual gates passed.
- **Package isolation:** Chrome, Firefox, and Safari Job artifacts each contain 54 exact files with 51 byte-identical shared files; all three Feed artifacts retain their separate 17-file boundary.
- **Repeatable packaging:** controlled-alpha and proof ZIPs are generated from explicit allow-lists with per-file checksums and separate ZIP SHA-256 files.
- **Privacy-limited alpha feedback:** testers can explicitly export a constrained test summary for review.

The bundled Job Search Lens template is displayed as `My Job Search`. Its historical `bob_job_search` file name and internal ID remain only for storage and migration compatibility.

## Not implemented yet

- A completed Feed Lens product.
- Feed rules, parking, persistence, filtering, scoring, or ranking.
- Manual Firefox desktop Job Search Lens validation.
- Firefox Android Job Search Lens device validation.
- Safari macOS or iPhone/iPad Job Search Lens runtime validation.
- Firefox Android Feed device validation.
- Safari macOS or iPhone/iPad Feed device validation.
- Safari containing-app generation, signing, or App Store distribution.
- Signed public browser distribution.
- A remote ARK backend or cloud synchronization.
- Built-in AI provider integration.

Users may separately use a local or external AI to prepare Lens Pack JSON or Fix Capture Repair Files. ARK Lens validates imported files before saving or activation and never sends captured jobs, Feed records, CV data, or browsing data automatically.

## Terminology

- **Job Search Lens:** one shared implementation; Chrome is manually tested, while Firefox and Safari currently have automated-gated thin packages awaiting live validation.
- **LinkedIn Feed extraction proof:** the current read-only extraction and observer proof.
- **Feed Lens:** the future completed product after owner-approved popup/report designs and later rule work.
- **Implemented but device validation pending:** code and automated packaging exist, but live device behavior is unverified.
- **Not implemented:** no product shell or validated product behavior exists for that platform/capability.

## Install and validate

Run commands from `PROJECTS/02_Dorr/ARK_Lens`.

### 1. Chrome Job Search Lens

For local development or controlled testing:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this ARK Lens project directory, which contains the root `manifest.json`.
5. Pin ARK Lens and open **Getting Started & Alpha Guide** from the popup.

For a controlled peer package:

```powershell
npm.cmd run package:alpha
```

Share the generated ZIP privately with its separate SHA-256 checksum. `dist/` is generated locally and is not committed.

### 2. Firefox Job Search Lens shell

Build and lint the exact Firefox package:

```powershell
npm.cmd run build:job:firefox
npm.cmd run lint:job:firefox
```

Launch the staging directory temporarily in Firefox desktop:

```powershell
npm.cmd run run:job:firefox
```

Repository automation passes, but no Firefox desktop or Android Job runtime success is claimed. Follow the separate [Firefox Job manual gate](JOB_XB2_FIREFOX_JOB_MANUAL_GATE.md); Android uses the same Firefox shell and additionally requires device evidence.

### 3. Safari Job Search Lens staging shell

Build the exact Safari WebExtension staging package:

```powershell
npm.cmd run build:job:safari
```

This package reuses the shared Job implementation and proves repository/package structure only. Follow the [Safari Job manual gate](JOB_XB3_SAFARI_JOB_MANUAL_GATE.md) on Apple hardware. A Windows-built ZIP cannot be installed directly on an iPhone or iPad; containing-app generation, signing, and device validation remain separate Apple-tooling gates.

### 4. Chrome LinkedIn Feed extraction proof

Build the separate read-only Chrome proof:

```powershell
npm.cmd run build:linkedin-feed-proof
```

Then:

1. Open `chrome://extensions` and enable **Developer mode**.
2. Select **Load unpacked**.
3. Choose `dist/ark-lens-linkedin-feed-extraction-proof-v0.1/`.
4. Open the LinkedIn home Feed and use the proof popup to scan or start observation.

This is not the Job Search Lens package and does not modify LinkedIn.

### 5. Firefox desktop LinkedIn Feed extraction proof

Build and lint the exact Firefox staging package:

```powershell
npm.cmd run build:linkedin-feed-proof:firefox
npm.cmd run lint:linkedin-feed-proof:firefox
```

Temporarily run it in Firefox desktop:

```powershell
npm.cmd run run:linkedin-feed-proof:firefox
```

Firefox desktop installation and interactive Feed behavior passed a user-executed manual gate. That Feed result does not validate the Firefox Job Search Lens shell.

### 6. Firefox Android Feed device gate

The Firefox Android code/package and automated gates exist, but live validation is blocked until Android Platform Tools, ADB, a suitable device or emulator, and Firefox Android are available.

Follow the [Firefox Android 23-point manual gate](FX_P0_FIREFOX_ANDROID_FEED_GATE.md). Do not change mobile selectors, permissions, CSS, or runtime behavior without sanitized device evidence.

### 7. Safari Feed staging and manual gate

Build the thin Safari WebExtension staging package:

```powershell
npm.cmd run build:linkedin-feed-proof:safari
```

The generated ZIP proves repository structure and package isolation only. Safari execution is not validated.

A Safari ZIP cannot be installed directly on an iPhone or iPad. macOS Safari testing and Apple containing-app generation require a Mac, Safari, Xcode, and Safari Web Extension tooling. Physical iPhone/iPad testing additionally requires the appropriate Apple signing and device setup.

Read:

- [Safari compatibility and distribution audit](SAFARI_FEED_COMPATIBILITY_AUDIT.md)
- [Safari P0.1 manual validation gate](SAFARI_P0_1_MANUAL_GATE.md)

## Architecture

```text
Visible Job page
  → source-owned Job adapter
  → canonical extraction evidence
  → shared Job policy/runtime
  → shared browser capability boundary
  → thin Chrome, Firefox or Safari shell
```

- Job Search Lens has one shared implementation consumed by thin Chrome, Firefox, and Safari shells; Firefox and Safari live validation remains pending.
- [`platform/browser_capabilities.js`](platform/browser_capabilities.js) owns the evidenced tabs, scripting, messaging, local-storage, extension-page, action-state, and lifecycle capabilities.
- [`runtime/job_runtime_order.js`](runtime/job_runtime_order.js) owns Job content-script execution order.
- [`contracts/job_contracts.js`](contracts/job_contracts.js) owns existing storage keys, message names, session identifiers, lifecycle reasons, and record/runtime versions without changing their values or stored shapes.
- Feed packaging uses one canonical 14-file runtime/UI set plus the selected browser manifest and two generated metadata/checksum files.
- Chrome, Firefox, and Safari manifests remain separate browser-owned shells.
- Job and Feed domain policies remain separate.
- Browser-specific copies of source adapters, selectors, domain policy, or canonical runtime logic are forbidden.
- The dedicated browser-neutral Feed view-model contract is roadmap work; the current extraction records and in-memory snapshot are already browser-neutral data.

ARK Lens consumes canonical meaning rather than redefining it:

- [Dorr Grammar v1.6](../DORR_GRAMMAR.md)
- [Dorr ownership and project boundary](../README.md)
- [ARK Architecture](../../01_Kernel/01_ARK_ARCHITECTURE.md)
- [Microkernel repository reference](../../01_Kernel/02_MICROKERNEL_SPEC.md)

Detailed proof and gate records:

- [FEED_P0 LinkedIn Feed extraction proof](FEED_P0_LINKEDIN_EXTRACTION_PROOF.md)
- [Firefox desktop Feed shell](FX_P0_FIREFOX_FEED_SHELL.md)
- [Firefox Android Feed gate](FX_P0_FIREFOX_ANDROID_FEED_GATE.md)
- [Safari compatibility audit](SAFARI_FEED_COMPATIBILITY_AUDIT.md)
- [Safari manual gate](SAFARI_P0_1_MANUAL_GATE.md)
- [JOB_XB1 browser foundation](JOB_XB1_BROWSER_FOUNDATION.md)
- [JOB_XB2 Firefox Job manual gate](JOB_XB2_FIREFOX_JOB_MANUAL_GATE.md)
- [JOB_XB3 Safari Job manual gate](JOB_XB3_SAFARI_JOB_MANUAL_GATE.md)

Historical design lineage is preserved in [Browser Add-on](../MVP/Browser_Addon.md) and [Witness Proof](../MVP/Witness_Proof.md); neither describes the current implementation status.

## Tests

Run the required offline gate:

```powershell
npm.cmd test
```

It covers:

- 37 frozen Job scoring cases;
- seven sanitized Job extraction fixtures;
- ten synthetic LinkedIn Feed structures;
- Job/Feed separation, three exact 54-file Job packages, three exact 17-file Feed packages, and byte-identical shared payloads;
- Feed observer, duplicate suppression, privacy, and browser API boundaries;
- Job browser-capability, runtime-order, storage/message, and direct-API ownership contracts;
- Lens Pack validation/migration, Lens editor, Fix Capture, sessions, reports, feedback, and active-session behavior.

See [tests/TEST_PLAN.md](tests/TEST_PLAN.md) for protected behavior and the approved fixture boundary.

Optional visual smoke coverage is separate:

```powershell
npm.cmd run test:visual
```

## Roadmap

1. `JOB_XB4` — run the cross-browser Job package and manual-gate readiness audit.
2. Friends perform Firefox and Safari live Job validation on real browsers/devices.
3. The owner finishes the mobile and desktop Feed popup/report designs.
4. Define the browser-neutral Feed view-model contract.
5. Implement one shared responsive Feed experience after design approval.
6. Add local DORR rules, Feed parking, and controlled source expansion later.

No Feed Lens implementation was added by JOB_XB2/XB3. Optional AI integration and F3B remain later work.

## Current limitations

- Job Search Lens supports only LinkedIn Jobs and SEEK Jobs.
- Source markup changes can require a Repair File or extension update.
- Matching is lexical, not semantic; differently worded concepts are not inferred automatically.
- Relevance feedback does not silently retrain or rewrite deterministic scoring.
- Job data has no built-in synchronization or backup beyond explicit export.
- The Feed proof is read-only and in-memory; it has no completed report, persistence, rules, ranking, or parking.
- Firefox Job desktop/Android and Safari Job macOS/iOS behavior remain unverified until their manual/device gates run.
- Firefox Android Feed and Safari Feed behavior remain unverified until their device gates run.
- Native social applications are outside the browser-extension boundary.
- Chrome Job Search Lens controlled-alpha installation uses Developer mode and an unpacked extension.
- Sanitized public fixture text is retained only for reproducible regression coverage under [tests/TEST_PLAN.md](tests/TEST_PLAN.md).

## License

Unless otherwise noted, ARK Lens and the source in this repository use the root [LICENSE](../../../LICENSE).
