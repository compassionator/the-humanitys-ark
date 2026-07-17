# ARK Lens v2026.06.019 — known alpha limitations

This document sets honest expectations for the controlled peer alpha.

## Capture coverage

- LinkedIn Jobs and SEEK Jobs are the only implemented sources.
- A session follows one supported tab. Closing that tab stops the session. After a browser restart, a stale session is stopped rather than shown as active.
- LinkedIn and SEEK can change their HTML, labels, or embedded data without notice. Fix Capture can diagnose many changes, but a trusted helper may still need to prepare a Repair File.
- Recommendation cards can contain less information than a full job-detail page. A later stronger capture should enrich the same record without discarding notes, decisions, or relevance feedback.

## Ranking

- The match percentage is lexical and deterministic. It matches normalized whole terms and phrases according to the active Lens Pack.
- The match percentage is not a probability, AI judgment, hiring prediction, or instruction to apply.
- Report presentation labels an internal low-fit result as **Ignore** at 10% or below and **Low Match** above 10% but below 50%; the underlying deterministic score and workflow contract are unchanged.
- This release does not include semantic search or an LLM integration.
- Relevant, Not relevant, and Unsure are stored as separate feedback events. They do not automatically retrain, rewrite, or reprioritize the Lens.
- Manual fit decisions override the displayed workflow state but do not rewrite the original deterministic classification.

## Storage and portability

- Records, notes, settings, repairs, and feedback are stored in Chrome local extension storage for the current browser profile.
- There is no account, synchronization service, cloud backup, telemetry, or analytics.
- Removing the extension or clearing its storage can remove saved data. Export anything you intentionally want to retain.
- A full report JSON or CSV export can contain captured job information and private notes. Treat it as personal data.

## Alpha usability

- Installation uses Chrome Developer mode and Load unpacked because this is not a Chrome Web Store release.
- The popup is a controller; detailed Lens editing, onboarding, and report review open in full pages.
- The main white `A` changes from a gray background to a green background while a session is active, then returns to gray when stopped.
- Accessibility and responsive behavior have automated contracts, but the alpha still needs testing with different zoom levels, screen sizes, keyboard-only navigation, and assistive technology.

Report unexpected behavior with the Feedback Template and privacy-safe Alpha Test Summary. For capture failures, add the reviewed Fix Capture Help File; never send raw page HTML by default.
