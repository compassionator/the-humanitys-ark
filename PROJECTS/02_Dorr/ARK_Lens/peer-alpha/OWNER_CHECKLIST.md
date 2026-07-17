# ARK Lens controlled peer alpha — owner checklist

Use this checklist before sending v2026.06.019 to 3–5 trusted testers. This is a controlled alpha, not a public store release.

## Release gate

1. Run `npm.cmd test` from the source directory.
2. Run `npm.cmd run package:alpha` only after the full suite passes.
3. Confirm the generated folder and ZIP are named `ark-lens-v2026.6.19-peer-alpha`.
4. Inspect `BUILD_INFO.json` and `SHA256SUMS.txt` inside the release folder.
5. Confirm the release contains extension runtime files and peer-alpha documentation, but no `tests`, fixture captures, `.git`, raw examples, downloads, or local storage exports.
6. Load the generated release folder with Chrome’s **Load unpacked** button and perform the tester guide once yourself.
7. Confirm Start Session changes the main A icon from gray to green and Stop Session changes it back to gray without adding a corner badge.

## Distribution

- Share the generated ZIP through a private channel.
- Share the ZIP’s SHA-256 checksum through the same or a second trusted channel.
- Tell testers this is unpacked alpha software and exactly who produced the package.
- Give each tester the same build. Do not modify files after calculating checksums.
- Keep the cohort small enough that you can respond when capture breaks.

## Suggested test coverage

Ask each tester to complete Lens setup, one LinkedIn session, one SEEK session if they use SEEK, five or more captures, report review, at least three relevance labels, one manual fit decision, one note, and the Alpha Test Summary export. At least one tester should intentionally run Fix Capture on a working page and inspect the Help File preview without activating a repair.

## Triage

Prioritize issues in this order:

1. Privacy exposure, unsafe export, data loss, or an unrecoverable repair.
2. Capture failure on a supported source.
3. Incorrect record identity or a frozen-score regression.
4. Setup, explanation, feedback, or session-state confusion.
5. Visual polish and feature suggestions.

Do not change deterministic scoring from anecdotal feedback. Collect clearly relevant, clearly irrelevant, and borderline examples, then review corpus changes deliberately. Relevance events in v14 are labels for review; they do not retrain the Lens.

## Exit criteria

The alpha is successful when trusted testers can install with the guide, customize a Lens, recognize when a session is active, capture jobs, understand the match percentage, give separate relevance feedback, recover from a capture problem with assistance, and provide a privacy-safe issue report. Record unresolved blockers before beginning broader distribution or Feed Lens work.
