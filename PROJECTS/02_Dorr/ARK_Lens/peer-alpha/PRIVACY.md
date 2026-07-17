# ARK Lens controlled alpha — privacy notes

ARK Lens v2026.06.019 is designed as a local-first Chrome extension. It has no ARK account, hosted backend, telemetry, analytics, advertising, or automatic AI connection. The extension requests access only to the active tab, script injection, local extension storage, and the supported LinkedIn/SEEK host pages declared in `manifest.json`.

## What stays local

Captured job titles, companies, locations, descriptions, metadata, match classifications, manual fit decisions, notes, Lens Packs, Adapter Repair Profiles, and relevance feedback are stored in the current Chrome profile. They leave the browser only when the user deliberately downloads or shares an export.

## Export types

- **Full report JSON/CSV:** contains saved job data and may contain private notes. Share only deliberately.
- **Lens JSON:** contains the user’s rules and preferences. It does not contain captured jobs, but those preferences may still be personal.
- **Fix Capture Help File:** contains redacted field examples and diagnostics. Query parameters, fragments, contact details, session identifiers, and raw HTML are excluded by the Doctor workflow. The preview must still be reviewed before sharing.
- **Repair File:** contains capture selectors and field definitions. It must be previewed and pass a live-page test before activation.
- **Alpha Test Summary:** contains the build version, Lens contract version, enabled supported sources, aggregate record/fit/relevance counts, and session status/count only.

The Alpha Test Summary explicitly excludes Lens names and IDs, job titles, companies, locations, descriptions, URLs, notes, feedback details, session IDs, and tab IDs. Its purpose is to provide enough release context for a peer-alpha issue without exposing the user’s job-search content.

## Tester responsibility

Every export remains under the tester’s control. Review previews, crop screenshots, and avoid sharing anything unrelated to the issue. Do not provide raw page HTML, browser profile data, full storage dumps, resumes, or report exports unless you understand the content and intentionally authorize that sharing.

Controlled-alpha recipients should receive the release ZIP privately and compare its SHA-256 checksum with the value supplied by the owner. Unpacked extensions should not be installed from unknown sources.
