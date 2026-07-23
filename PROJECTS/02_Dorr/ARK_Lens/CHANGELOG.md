# ARK Lens changelog

## Unreleased — architecture and proof milestones

- Established the F0–F2.5 foundation, including shared architecture and explicit Job/Feed domain separation.
- Added F3A source-adapter extraction for LinkedIn Jobs and SEEK Jobs.
- Recorded the successful user-executed Job Search Lens browser gate.
- Added the FEED_P0 read-only LinkedIn Feed extraction proof and its successful Chrome desktop gate.
- Replaced platform-dependent proof archiving with portable in-process Node ZIP packaging.
- Added the separate Firefox Manifest V3 Feed proof distribution and exact browser/package isolation.
- Added the minimal native `browser || chrome` API binding without forking the canonical Feed runtime.
- Recorded the successful user-executed Firefox desktop Feed gate.
- Firefox Android Feed validation remains pending.

## Pre-import public-source readiness history

This entry records readiness work completed before ARK Lens was imported into its current `PROJECTS/02_Dorr/ARK_Lens/` location. The destination and root repository licence are now resolved; the historical preparation facts below are preserved.

- Added the standalone README, public exclusions, and a one-time migration manifest in preparation for the future destination; that import has since been completed.
- Re-sanitized real-world fixtures to remove account/conversation identifiers, tracking/search tokens, live recruiter contact details, private activity timestamps, and owner-specific Lens wording.
- Added regression coverage preventing sensitive fixture data from being reintroduced while preserving all 37 scoring outcomes and seven extraction cases.
- Recorded the then-missing public licence, unconfirmed canonical Microkernel link, and fixture-redistribution review as publication follow-up work. The repository location, root licence, and canonical documentation boundaries are now resolved; the approved fixture corpus remains preserved under the boundary in `tests/TEST_PLAN.md`.
- Kept extension version v2026.6.19 and all scores, thresholds, workflow behavior, storage behavior, source extraction, and schemas unchanged; only the two owner-specific evidence strings changed for public safety.

## v2026.06.019

- Split report fit labels and match percentages into separate fixed-width table columns after the selection checkbox.
- Reordered the report presentation to `FIT`, percentage, then job so labels can never shift the percentage column.
- Rendered fit tags in uppercase in both report rows and the job-details drawer.
- Added browser coverage for the exact FIT/percentage/job column order and uppercase fit presentation.
- Kept scores, thresholds, workflow keys, matching rules, exports, and the frozen scoring corpus unchanged.
- Bumped the extension, canonical Lens Pack, and content bundle to v2026.06.019.

## v2026.06.018

- Polished the fit palette so Strong Match uses green, Review remains purple, Low Match and Ignore share one muted-red family, and Applied uses a quiet slate gray.
- Added a fixed, right-aligned percentage column in report rows so two- and three-digit percentages align their fit tags consistently.
- Applied the same aligned percentage treatment to the job-details drawer.
- Kept scores, thresholds, labels, workflow keys, matching rules, exports, and the frozen scoring corpus unchanged.
- Bumped the extension, canonical Lens Pack, and content bundle to v2026.06.018.

## v2026.06.017

- Redesigned fit presentation with a larger state-colored percentage on the left and a separate fit tag on the right.
- Kept fit tags concise: `Strong Match`, `Review`, `Low Match`, `Ignore`, or `Applied` with no percentage inside the tag.
- Applied the same shared layout to report rows and the job-details drawer, with an even larger percentage in the drawer.
- Added distinct percentage colors for Strong Match, Review, Low Match, Ignore, and Applied while retaining the existing accessible tag colors.
- Kept manual decisions and relevance feedback as separate indicators instead of adding text to the fit tag.
- Added real-browser regression coverage proving percentage and tag content remain separate in both views.
- Kept scores, thresholds, workflow keys, matching rules, exports, and the frozen scoring corpus unchanged.
- Bumped the extension, canonical Lens Pack, and content bundle to v2026.06.017.

## v2026.06.016

- Added a friendly display tier that labels effective low-fit results at 10% or below as `Ignore`.
- Keeps scores above 10% and below 50% labeled `Low Match`, including decimal boundaries such as 10.1% and 49.99%.
- Added separate Low Match and Ignore counts and filters in the report.
- Gave Ignore a neutral gray badge while retaining the existing red Low Match presentation.
- Applied the boundary consistently to table rows, details, tooltips, manual-decision notices, readiness guidance, and tests.
- Kept the internal `ignore` workflow key, deterministic score, Lens Pack rules, exports, and frozen scoring corpus unchanged.
- Bumped the extension, canonical Lens Pack, and content bundle to v2026.06.016.

## v2026.06.015

- Replaced technical `Rule Fit n/100` presentation with one friendly fit label and percentage, such as `Strong Match · 98%`, throughout the report and details drawer.
- Replaced the green corner badge with real inactive gray/white and active green/white `A` icon assets; starting and stopping a session now swaps the main extension icon itself.
- Clears the previous v14 badge during update so the active icon never appears as a second A over the original icon.
- Corrected CSV export so a legitimate zero match remains `0` instead of becoming blank.
- Corrected CSV location export so LinkedIn posting age, applicant activity, promotion, and response-management text are not appended to the location field.
- Audited a 33-record owner test run: all record ids and URLs were unique, all descriptions were present, no adapter warnings were recorded, and no evidence-backed scoring defect was found.
- Kept all deterministic matching rules and the frozen scoring corpus unchanged.
- Bumped the extension, canonical Lens Pack, and content bundle to v2026.06.015.

## v2026.06.014

- Added a full-page Getting Started and Alpha Guide with a live readiness check, five-minute first run, Rule Fit explanation, Fix Capture guidance, privacy explanation, known limits, and direct links to Lens setup and the report.
- Added a privacy-safe Alpha Test Summary containing versions, supported-source settings, aggregate counts, and session status only; it excludes job content, URLs, notes, feedback details, Lens names/ids, and session/tab ids.
- Added a copyable issue template plus dedicated tester, owner, privacy, limitations, and feedback documentation for a controlled 3–5 person alpha.
- Added repeatable `npm.cmd run package:alpha` packaging with an allowlisted runtime payload, build metadata, per-file SHA-256 checksums, a release ZIP, and a separate ZIP checksum.
- Added a white `A` on a green extension badge while a capture session is active; stopping the session clears the badge and restores the original icon appearance.
- Synchronized the session badge through storage changes, service-worker startup, and installation, and safely stops stale sessions after a browser restart.
- Opens the Getting Started page on first installation and keeps it available from the popup.
- Added peer-alpha contracts and a service-worker simulation covering active/stopped indicators, first-install onboarding, and stale-session recovery.
- Bumped the extension, canonical Lens Pack, and content bundle to v2026.06.014 without changing the frozen deterministic scoring outcomes.

## v2026.06.013

- Added an accessible job-details drawer with the full captured description, complete positive/negative/blocker evidence, Rule Fit explanation, capture-quality diagnostics, notes, and safe job link.
- Added separate `Relevant`, `Not relevant`, and `Unsure` feedback with plain-language reasons, optional detail, a bounded audit history, and the original scoring/Lens context retained on every event.
- Kept relevance feedback independent from Rule Fit, fit decisions, manual workflow overrides, and Lens configuration; feedback never silently retrains or changes ranking.
- Added relevance summaries, row badges, report filtering, searchable feedback fields, and JSON/CSV export fields.
- Preserved feedback and notes when a job is recaptured, and added an explicit clear event rather than deleting feedback history.
- Added deterministic schema/function contracts plus a real-browser interaction regression for the drawer, feedback, notes, decisions, and filters.
- Fixed overlapping report renders that could append duplicate rows during quick consecutive actions.
- Bumped the extension, canonical Lens Pack, and content bundle to v2026.06.013 while retaining Doctor Safety as v2026.06.012.

## v2026.06.012

- Reworked Adapter Doctor into a plain-language `Fix Capture` workflow for non-technical users.
- Added a Help File preview before download, with URL query/fragment removal and contact/session-data redaction.
- Added a strict, machine-readable Adapter Repair Profile schema with readable field-level validation errors.
- Added staged Repair File preview and live-page testing; repairs cannot activate unless extraction receives a full passing health result.
- Added last-known-good tracking, automatic pre-activation backup, `Undo Last Repair`, and reversible built-in reset behavior.
- Added browser-fixture coverage proving Repair File tests work on LinkedIn and SEEK without activating storage.
- Bumped the extension, canonical Lens Pack, and content bundle to v2026.06.012.

## v2026.06.011

- Added a dedicated full-page Lens editor with plain-language Basic and JSON Advanced modes.
- Added create, rename, duplicate, delete, source selection, validation, export, and bundled restore workflows.
- Moved complex Lens configuration out of the popup and replaced it with a single `Customize Lens` action.
- Added config-driven editor sections and empty-by-default location, seniority, work-arrangement, and employment-type preferences.
- Preserved all 37 established scoring outcomes and migrated older bundled-style Lens copies without altering independent custom packs.
- Bumped the extension, canonical Lens Pack, and content bundle to v2026.06.011.

## v2026.06.010

- Replaced recommendation language with `Strong Match`, `Review`, and `Low Match` while retaining stable internal workflow keys.
- Replaced percentage presentation with explicit `Rule Fit n/100` wording.
- Renamed the bundled display Lens to `My Job Search` and migrated its legacy display name without losing user edits.
- Added visible source readiness, disabled session start on unsupported or disabled sources, and clarified saved versus current-session counts.
- Moved capture controls ahead of Lens settings, clarified local-only behavior, hid planned sources, and updated export and destructive-action labels.
- Bumped the extension, canonical Lens Pack, and content bundle to v2026.06.010.
