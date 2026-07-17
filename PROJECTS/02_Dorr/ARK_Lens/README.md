# ARK Lens

> See the web through your own rules.

**Current release:** v2026.6.19  
**Status:** Controlled peer alpha  
**Current Lens:** Job Search Lens  
**Supported sources:** LinkedIn Jobs and SEEK Jobs

## Role

ARK Lens is the shared browser implementation and interface under Dorr. It applies user-controlled Lens Packs to supported web sources while keeping canonical Dorr and Microkernel meaning outside this project.

Job Search Lens is the first working Lens.

## Goal

Turn noisy web surfaces into local, explainable views shaped by the user's own rules. The current release captures job listings, evaluates them with a deterministic Lens Pack, and presents the result for review without requiring a hosted service.

## Why it matters

Job platforms optimize for platform discovery. ARK Lens gives the user a separate, inspectable layer for deciding what deserves attention. The same browser boundary can later support feeds, news, notifications, messages, media, and marketplaces.

## Status

The project is stable enough for controlled testing with trusted peers. It is not a public beta or a finished semantic-ranking product.

The required release gate currently covers 37 frozen scoring cases and seven sanitized browser-extraction fixtures. This directory is now the canonical ARK Lens source under Dorr.

## Canonical references

ARK Lens references canonical meaning; it does not copy or redefine the full Dorr matrix or Microkernel contract.

- Dorr: [canonical shared grammar](../README.md)
- ARK Architecture: [canonical Kernel wrapper](../../01_Kernel/01_ARK_ARCHITECTURE.md)
- Microkernel: [repository reference](../../01_Kernel/02_MICROKERNEL_SPEC.md)
- Browser add-on boundary: [historical engineering specification](../MVP/Browser_Addon.md)
- Witness proof: [historical proof definition](../MVP/Witness_Proof.md)

## Current implementation

- **Capture:** LinkedIn Jobs and SEEK Jobs through source-specific adapters, session controls, source readiness, and a popup-scoped session timer.
- **Lens Pack:** one bundled JSON source of truth validated by `schemas/lens-pack.schema.json`; rules declare keywords, match scope, weights, penalties, blockers, caps, role-fit behavior, and explanations.
- **Matching:** local, deterministic, lexical whole-term and phrase matching. Semantic matching is not implemented yet.
- **Lens editor:** Basic fields for common preferences plus Advanced JSON paste, validation, save, export, and bundled restore. Users can create, rename, duplicate, and delete Lenses.
- **Report:** match percentage, fit state, positive and negative evidence, blockers, captured description, capture quality, private notes, manual decisions, and separate relevance feedback.
- **Fix Capture:** redacted Help Files and schema-validated Repair Files with preview, live-page testing, activation only after a pass, and rollback.
- **Exports:** report JSON/CSV, Lens JSON, Fix Capture files, and a privacy-limited alpha test summary.
- **Release packaging:** a repeatable controlled-alpha ZIP and SHA-256 checksum generated from an explicit runtime allowlist.

The bundled template is displayed as `My Job Search`. Its historical `bob_job_search` file name and internal ID remain only for storage and migration compatibility.

## Core boundary / negative scope

ARK Lens is local-first. Captured records, Lens Packs, feedback, notes, sessions, and repair profiles use Chrome local extension storage unless the user deliberately exports a file.

There is no required:

- ARK account or sign-in;
- backend, cloud synchronization, or telemetry;
- analytics, advertising, or data brokerage;
- CV or resume upload;
- automatic AI connection;
- API key or model provider.

Users may optionally use their own local or external AI to prepare Lens Pack JSON or Fix Capture repair files. The user pastes Lens JSON into Advanced mode or selects a Repair File, and ARK Lens validates it before saving or activation. ARK Lens does not send a CV, captured job, or browsing data to an AI automatically.

Relevance feedback never silently retrains or rewrites deterministic scoring. Dorr meaning remains canonical elsewhere.

## Install

For local development or controlled testing:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project root, which contains `manifest.json`.
5. Pin ARK Lens and open **Getting Started & Alpha Guide** from the popup.

For peers, generate the allowlisted package first:

```powershell
npm.cmd run package:alpha
```

Send the generated ZIP privately with its separate SHA-256 checksum. `dist/` is generated locally and is not committed.

## Tests

Run the required offline gate:

```powershell
npm.cmd test
```

It runs fast contracts followed by headless-browser extraction and report interaction tests. See `tests/TEST_PLAN.md` for the protected behavior and fixture policy.

Optional visual smoke coverage is separate:

```powershell
npm.cmd run test:visual
```

## Project structure

```text
alpha/          Getting Started and controlled-alpha guide
icons/          inactive and active extension icons
lens-editor/    Basic and Advanced Lens editor
lens-packs/     canonical bundled Lens Pack, generated bundle, runtime
peer-alpha/     tester, privacy, limitation, feedback, and owner guidance
popup/          capture and session controller
report/         report table, details drawer, feedback, notes, exports
schemas/        Lens, repair-profile, and relevance-feedback contracts
tests/          contracts, browser tests, sanitized fixtures, build tools
background.js   session lifecycle and extension icon state
content_bundle.js source extraction, scoring, storage, and Fix Capture runtime
manifest.json   Manifest V3 permissions and supported hosts
```

## Roadmap

1. Job Search Lens stabilization and peer feedback
2. Feed Lens — LinkedIn Feed and X/Twitter
3. News Lens
4. Notifications Lens
5. Messages Lens
6. Media and Marketplace Lenses
7. Shared concept similarity, semantic matching, and optional user-controlled AI

## Current limitations

- Only LinkedIn Jobs and SEEK Jobs are supported.
- Source markup changes can still require a Repair File or extension update.
- Matching is lexical, not semantic, and differently worded concepts are not inferred automatically.
- Feedback is reviewable context; it does not currently generate or apply Lens changes.
- Browser storage is local to the Chrome profile and has no built-in synchronization or backup.
- Controlled-alpha installation requires Chrome Developer mode and an unpacked extension.
- Real-world fixtures retain sanitized public job text solely for reproducible regression coverage; see `tests/TEST_PLAN.md` for the fixture boundary.

## License

Unless otherwise noted, ARK Lens and the source code in this repository are licensed under the terms of the root LICENSE file.

See the root [LICENSE](../../../LICENSE) file.
