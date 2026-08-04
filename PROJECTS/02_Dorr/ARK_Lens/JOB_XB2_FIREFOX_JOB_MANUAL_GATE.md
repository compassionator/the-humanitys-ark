# JOB_XB2 Firefox Job Search Lens manual gate

## Status and boundary

The Firefox Job shell reuses the canonical Job Search Lens runtime, popup, report, Lens editor, Alpha Guide, Fix Capture implementation, source adapters, policies, and assets. Repository automation can validate the manifest, exact package, ZIP, checksums, and byte identity; it cannot establish live Firefox behavior.

```text
Firefox desktop: BLOCKED — MANUAL BROWSER VALIDATION REQUIRED
Firefox Android: BLOCKED — DEVICE VALIDATION REQUIRED
```

Do not change selectors, scoring, storage shapes, permissions, CSS, popup behavior, or runtime code without sanitized evidence from this gate.

## Exact package

- Build: `npm.cmd run build:job:firefox`
- Lint: `npm.cmd run lint:job:firefox`
- Desktop launch: `npm.cmd run run:job:firefox`
- Staging directory: `dist/ark-lens-job-search-firefox-v2026.6.19/`
- ZIP: `dist/ark-lens-job-search-firefox-v2026.6.19.zip`
- WebExtension ID: `@ark-lens-job-search`
- Minimum Firefox desktop version: 140
- Minimum Firefox Android version: 142

## Shared 23-point functional gate

Record `PASS`, `FAIL`, or `BLOCKED` and sanitized evidence for every check.

1. Temporary installation succeeds and the extension remains enabled.
2. The extension action is visible.
3. The shared popup opens.
4. Ordered injection loads every canonical Job runtime file successfully.
5. Popup, content, and background message round-trips succeed.
6. LinkedIn Jobs reports readiness and captures the expected local record.
7. SEEK Jobs reports readiness and captures the expected local record on an available supported surface.
8. A session starts.
9. The action icon and title reflect session state.
10. Supported same-tab navigation restarts capture without duplicate listeners.
11. The session stops.
12. Local storage persists the existing keys and shapes.
13. Lens selection works.
14. The shared Lens editor opens and behaves as on the protected Chrome baseline.
15. The shared report opens and renders stored records.
16. The shared Alpha Guide opens.
17. Notes and relevance feedback persist locally.
18. JSON and CSV exports behave as recorded by the browser.
19. Fix Capture produces sanitized diagnostics.
20. Repair File preview, validation, test extraction, activation, and last-known-good rollback work.
21. Browser restart/session recovery follows the existing contract.
22. Reopening views and navigating do not duplicate listeners, and no Feed runtime loads.
23. No network transmission or telemetry was added.

## Firefox desktop record

Record:

```text
Tester:
Date:
Operating system:
Firefox version/channel:
Branch and commit:
Artifact SHA-256:
Checks 1–23:
Sanitized console evidence:
Failure layer, if any:
Overall verdict: PASSED | BLOCKED | FAILED
```

Desktop completion requires all applicable checks to pass. A packaging or lint pass is not a desktop runtime pass.

## Firefox Android prerequisites and launch

Required evidence includes Android Platform Tools, a connected authorized device or emulator, Firefox Android 142 or later, remote debugging enabled, and a supported LinkedIn or SEEK web surface open in Firefox. The native LinkedIn and SEEK applications are outside this gate.

Discover the device:

```powershell
adb devices
```

Build, lint, and launch the exact staging directory through the pinned `web-ext` dependency:

```powershell
npm.cmd run build:job:firefox
npm.cmd run lint:job:firefox
./node_modules/.bin/web-ext.cmd run --source-dir dist/ark-lens-job-search-firefox-v2026.6.19 --target firefox-android --adb-device <DEVICE_SERIAL> --firefox-apk org.mozilla.firefox
```

## Firefox Android record

In addition to checks 1–23, record:

```text
Tester and date:
Device or emulator:
Android version:
Firefox version/channel and application ID:
Artifact SHA-256:
Popup viewport and touch usability:
Extension-page navigation:
Download/export behavior and destination:
LinkedIn or SEEK mobile/desktop-web surface:
Unavailable capabilities:
Background/foreground and restart behavior:
Sanitized evidence:
Overall verdict: PASSED | BLOCKED | FAILED
```

If no device or emulator is available, Android remains `BLOCKED — DEVICE VALIDATION REQUIRED`; that is not a product failure and does not justify speculative mobile changes.
