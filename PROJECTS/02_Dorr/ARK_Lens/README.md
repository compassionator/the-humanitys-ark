# ARK Lens

> See the web through your own rules.

**Current release:** v2026.6.19

**Status:** Controlled peer alpha

**Current product Lens:** Job Search Lens

**Supported production/alpha sources:** LinkedIn Jobs and SEEK Jobs

**Current extraction proof:** LinkedIn Feed read-only extraction proof

## Role

ARK Lens is the shared browser implementation and interface under Dorr. It applies user-controlled Lens Packs to supported web sources while keeping canonical Dorr and Microkernel meaning outside this project.

Job Search Lens is the first working product Lens. The LinkedIn Feed work is a separate read-only extraction proof, not a completed Feed Lens product.

## Goal

Turn noisy web surfaces into local, explainable views shaped by the user's own rules. The current release captures job listings, evaluates them with a deterministic Lens Pack, and presents the result for review without requiring a hosted service.

## Why it matters

Job platforms optimize for platform discovery. ARK Lens gives the user a separate, inspectable layer for deciding what deserves attention. The same browser boundary can later support feeds, news, notifications, messages, media, and marketplaces.

## Status

The project is stable enough for controlled testing with trusted peers. It is not a public beta or a finished semantic-ranking product.

The required release gate currently covers 37 frozen scoring cases and seven sanitized browser-extraction fixtures. This directory is now the canonical ARK Lens source under Dorr.

### Current product Lens

**Job Search Lens** is the current controlled-alpha product. Its supported sources are:

- LinkedIn Jobs;
- SEEK Jobs.

### Current extraction proof

The **LinkedIn Feed read-only extraction proof** demonstrates that the shared ARK Lens architecture can support a non-Job domain without entering the Job runtime or package.

Validated environments:

- Chrome desktop — user-executed manual gate passed;
- Firefox desktop — user-executed manual gate passed.

Pending:

- Firefox Android;
- mobile LinkedIn Feed DOM;
- Feed filtering, scoring, persistence, and reports;
- Firefox Job Lens.

## Canonical references

ARK Lens references canonical meaning; it does not copy or redefine the full Dorr matrix or Microkernel contract.

- Dorr grammar: [canonical v1.6 semantics](../DORR_GRAMMAR.md)
- Dorr project: [framework and ownership boundary](../README.md)
- ARK Architecture: [canonical Kernel wrapper](../../01_Kernel/01_ARK_ARCHITECTURE.md)
- Microkernel: [repository reference](../../01_Kernel/02_MICROKERNEL_SPEC.md)
- Browser add-on boundary: [historical engineering specification](../MVP/Browser_Addon.md)
- Witness proof: [historical proof definition](../MVP/Witness_Proof.md)

## Current implementation

- **Capture:** LinkedIn Jobs and SEEK Jobs through source-specific adapters, session controls, source readiness, and a popup-scoped session timer.
- **Lens Pack:** one bundled JSON source of truth validated by `schemas/lens-pack.schema.json`; rules declare keywords, match scope, weights, penalties, blockers, caps, role-fit behavior, and explanations.
- **Matching:** a source-neutral `LensItem`, DOM-free deterministic lexical matcher, and separate Job policy preserve whole-term and phrase scoring. Semantic matching is not implemented yet.
- **Lens editor:** Basic fields for common preferences plus Advanced JSON paste, validation, save, export, and bundled restore. Users can create, rename, duplicate, and delete Lenses.
- **Report:** match percentage, fit state, positive and negative evidence, blockers, captured description, capture quality, private notes, manual decisions, and separate relevance feedback.
- **Fix Capture:** redacted Help Files and schema-validated Repair Files with preview, live-page testing, activation only after a pass, and rollback.
- **Exports:** report JSON/CSV, Lens JSON, Fix Capture files, and a privacy-limited alpha test summary.
- **Feed extraction proof:** a separate read-only, in-memory LinkedIn Feed probe using the canonical Feed adapter, mapper, capture policy, and probe.
- **Proof distributions:** separate Chrome and Firefox Feed proof packages consume one canonical Feed runtime and are protected by exact package-isolation tests.
- **Release packaging:** repeatable controlled-alpha and proof ZIPs with SHA-256 checksums generated from explicit runtime allowlists.

The bundled template is displayed as `My Job Search`. Its historical `bob_job_search` file name and internal ID remain only for storage and migration compatibility.

## Core boundary / negative scope

ARK Lens is local-first. Job Search Lens records, Lens Packs, feedback, notes, sessions, and repair profiles use the Chrome extension profile's local storage unless the user deliberately exports a file.

The separate LinkedIn Feed proof is read-only and retains its snapshot only in memory. It uses no extension storage and performs no network transmission. A local JSON file is created only when the user explicitly exports the current snapshot.

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

### Chrome Job Search Lens

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

### Firefox LinkedIn Feed extraction proof

The Firefox package is a separate read-only Feed extraction proof. It is not the Job Search Lens distribution.

Build and lint its exact staging package:

```powershell
npm.cmd run build:linkedin-feed-proof:firefox
npm.cmd run lint:linkedin-feed-proof:firefox
```

Temporarily run the generated staging directory in Firefox desktop:

```powershell
npm.cmd run run:linkedin-feed-proof:firefox
```

Firefox desktop installation and interactive Feed behavior have passed user-executed manual gates. Firefox Android remains unvalidated.

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
core/           source-neutral LensItem and deterministic lexical matcher
domains/feed/   Feed-owned mapping and read-only capture policy
icons/          inactive and active extension icons
lens-editor/    Basic and Advanced Lens editor
lens-packs/     canonical bundled Lens Pack, generated bundle, runtime
orchestration/feed/ in-memory Feed probe and observer lifecycle
peer-alpha/     tester, privacy, limitation, feedback, and owner guidance
popup/          capture and session controller
policies/       domain policy; currently the frozen Job Lens score/workflow policy
proofs/linkedin_feed/ separate Chrome and Firefox Feed proof distributions
report/         report table, details drawer, feedback, notes, exports
schemas/        Lens, repair-profile, and relevance-feedback contracts
sources/feed/   canonical LinkedIn Feed catalogue and adapter
sources/jobs/   Job source catalogue and source-specific adapters
tests/          contracts, browser tests, sanitized fixtures, build tools
background.js   session lifecycle and extension icon state
content_bundle.js source extraction, storage, sessions, and Fix Capture runtime
manifest.json   Manifest V3 permissions and supported hosts
```

## Roadmap

1. Firefox Android LinkedIn Feed proof validation
2. Evidence-driven mobile selector corrections, only if required
3. Firefox Job Lens distribution
4. F3B diagnostic design
5. Future Feed filtering and actions
6. Optional user-controlled AI later

## Current limitations

- Job Search Lens supports only LinkedIn Jobs and SEEK Jobs.
- Source markup changes can still require a Repair File or extension update.
- Matching is lexical, not semantic, and differently worded concepts are not inferred automatically.
- Feedback is reviewable context; it does not currently generate or apply Lens changes.
- Job Lens storage belongs to its Chrome extension profile and has no built-in synchronization or backup.
- The Feed proof is a separate read-only, in-memory proof with no storage or network transmission.
- Firefox desktop Feed proof behavior is validated; Firefox Android is not yet validated.
- Native social applications are outside the browser-extension boundary.
- Chrome Job Lens controlled-alpha installation uses Chrome Developer mode and an unpacked extension.
- Real-world fixtures retain sanitized public job text solely for reproducible regression coverage; see `tests/TEST_PLAN.md` for the fixture boundary.

## License

Unless otherwise noted, ARK Lens and the source code in this repository are licensed under the terms of the root LICENSE file.

See the root [LICENSE](../../../LICENSE) file.
