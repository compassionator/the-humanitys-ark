# ARK Lens Test Plan

The required release gate is:

```powershell
npm.cmd test
```

It runs the fast contracts first, followed by browser extraction against sanitized real-world pages. No network access is required.

## Test layers

### Smoke contracts

`tests/smoke.test.js` protects URL routing, whole-term lexical matching, all declared match scopes, score policies, trust-language presentation, source-readiness behavior, canonical URLs, report explanations, extension permissions, DOM IDs, and security-oriented static contracts.

### Real-world characterization

`tests/characterization.test.js` protects:

- use of one canonical bundled Lens Pack, with no embedded copies in content, popup, or report code;
- exact scores, states, reasons, matched rules, and matched keywords for 37 exported jobs;
- identical scoring after every signal id is renamed, proving the engine reads declared behavior rather than special ids;
- preservation of richer captures when a weaker card is seen later;
- report record identity, source counts, safe open URLs, and the CSV export contract;
- preservation of numeric zero scores and clean location-only fields in CSV exports;
- the seven-page fixture manifest.

These assertions freeze the established lexical behavior behind the config-driven contract. A future scoring change must explain and review every corpus delta.

### Lens Pack contract

`tests/lens-pack-contract.test.js` protects:

- JSON Schema and runtime validation of the canonical Lens Pack;
- parity between `lens-packs/bob_job_search.json` and its generated extension bundle;
- migration of legacy and user-edited packs without losing keywords, weights, sources, custom rules, or intentionally empty keyword lists;
- repair of missing active-pack pointers;
- readable validation failures;

### Full-page Lens editor

`tests/lens-editor.test.js` protects:

- config-driven mapping from rule behavior to plain-language Basic sections;
- phrase normalization and collision-safe Lens creation;
- create, rename, duplicate, delete, source, Basic, and Advanced editor controls;
- dependency order, DOM references, and the no-`innerHTML` security contract;
- removal of complex keyword and JSON editing from the popup.

### Adapter Doctor safety

`tests/adapter-doctor-safety.test.js` and the real-world extraction suite protect:

- strict full-profile validation against `schemas/adapter-profile.schema.json`;
- rejection of wrong-source repairs, unknown fields, malformed selectors, hashed class names, and unsafe query-parameter definitions;
- removal of URL query values, fragments, contact details, and extension/session identifiers from Help Files;
- Help File preview before download and Repair File preview before testing;
- test-before-activation, with activation permitted only after a passing live-page extraction;
- preservation of the last-known-good or previous setup for one-click rollback;
- proof that testing a repair against passing LinkedIn and SEEK fixtures does not write an active override.

### Report details and relevance feedback

`tests/report-feedback.test.js` protects:

- the versioned `schemas/relevance-feedback.schema.json` contract and fixed reason taxonomy;
- immutable, bounded feedback events with the original match percentage, workflow, Lens, source, and title context;
- strict separation between relevance feedback, deterministic scoring, Lens configuration, and manual fit decisions;
- full drawer controls for descriptions, all evidence groups, capture quality, notes, decisions, feedback, and history;
- relevance summaries, badges, filters, searchable text, and JSON/CSV export fields;
- preservation of notes and feedback when a stronger or repeated capture updates the same job.
- boundary-safe presentation of `Ignore` at 10% or below and `Low Match` above 10% but below 50%, without changing internal scoring or workflow keys.
- separate, state-colored percentage and fit-tag elements in both table rows and the details drawer, with browser assertions that prevent them being merged again.

`tests/report-browser.test.js` runs the production report in headless Chrome and proves a user can open a row, inspect the complete evidence and captured description, save Not relevant with a reason, retain it while changing the fit decision, save notes, and filter by relevance. It also guards against duplicate rows from overlapping renders.

### Controlled peer alpha

`tests/peer-alpha.test.js` protects:

- the Getting Started page, readiness controls, first-run instructions, match-percentage explanation, Fix Capture guidance, privacy language, and known limitations;
- the popup entry point and first-install onboarding route;
- a privacy-safe aggregate Alpha Test Summary that cannot expose Lens names/ids, job content, URLs, notes, feedback details, session ids, or tab ids;
- the tester guide, owner release checklist, feedback template, known-limitations statement, and privacy notes;
- the allowlisted release builder, build metadata, per-file SHA-256 manifest, ZIP output, and explicit exclusion of development fixtures and raw data.

`tests/session-indicator.test.js` executes the production service worker with simulated Chrome APIs. It proves an active session swaps the main gray/white A icon for the green/white variant without a corner badge, an inactive session restores the gray icon, first install opens the guide, and a stale browser-restart session is stopped instead of displayed as active.

### Real-world browser extraction

`tests/real-world-extraction.test.js` runs the production content bundle in isolated headless Chrome against sanitized captures. It covers:

- LinkedIn recommendation-card extraction;
- LinkedIn semantic job-detail extraction;
- LinkedIn applied-state detection;
- LinkedIn incomplete/shadow-DOM waiting states;
- SEEK split-view detail extraction;
- SEEK Apollo-cache fallback when the DOM description is missing;
- title, company, location, identity, URL, description, employment type, salary, Doctor health, and extraction mode.

Set `ARK_PAGE_CASE=page_6` to run one page fixture. Set `ARK_DEBUG_EXTRACTION=1` to print a field-only diagnostic summary.

### Optional visual smoke

`npm.cmd run test:visual` renders the popup/report and exercises the older CDP fixture suite. It is kept separate from the required gate because the current desktop Chrome environment can time out during CDP `Page.enable` before application code runs. The required extraction suite uses Chrome's deterministic `--dump-dom` path instead.

## Fixture provenance and privacy

### Public-web regression corpus boundary

`tests/fixtures/real-world/` contains sanitized snapshots of publicly visible job pages. The corpus is retained for reproducible extraction and scoring regression testing; personal, account, and session data has been removed.

Fixture content must not be used as product content or regenerated from live pages without another privacy review. Concerns about the corpus may be raised through the repository issue process.

`tests/fixtures/real-world` is generated from private raw page captures by:

```powershell
node tests/tools/build-characterization-fixtures.js <capture-directory> <report.json>
```

The generator:

- keeps the raw captures outside the repository;
- removes scripts, media, forms, profile links, and unrelated DOM;
- retains only the selected job structure;
- retains only the target SEEK Apollo object and its references, without tracking/search tokens;
- removes non-target links and URL query values while retaining only public job-routing ids needed by extraction;
- strips session, tab, account, screenshot, contact, note, and unrelated report data;
- replaces report activity timestamps with stable fixture values and any necessary contact examples with `example.com` values;
- writes machine-readable expectations separately from the HTML.

Two LinkedIn captures (`page_2` and `page_3`) did not serialize their shadow-root job content. They are intentionally retained as failure/waiting fixtures. Synthetic content must not be added to make them pass.

## Change policy

- Production behavior should not be refactored until `npm.cmd test` is green.
- A bug fix starts with a failing real-world or minimal regression case.
- Expected scoring changes require a reviewed corpus diff; never bulk-update snapshots without explaining the changed policy.
- Doctor Repair File schema changes require a versioned contract and explicit migration coverage.
- Semantic ranking and any future feedback-based Lens suggestions must use a reviewed labeled corpus separate from this frozen lexical corpus. Captured feedback alone never changes scoring.
