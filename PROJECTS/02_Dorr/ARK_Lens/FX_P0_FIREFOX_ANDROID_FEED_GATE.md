# ARK Lens Firefox Android Feed Gate

## Purpose and current verdict

This gate validates the existing Firefox LinkedIn Feed proof on Firefox Android. It does not authorize selector, runtime, manifest, permission, storage, popup or Job Lens changes.

```text
FIREFOX ANDROID FEED GATE BLOCKED — DEVICE VALIDATION REQUIRED
```

On 2026-08-04, the repository automation passed on Windows, but Android Platform Tools, `adb`, an Android emulator and a connected Android device were not available. No Firefox Android behavior has therefore been claimed.

## Verified automated baseline

Run from `PROJECTS/02_Dorr/ARK_Lens/`:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run build:linkedin-feed-proof
npm.cmd run build:linkedin-feed-proof:firefox
npm.cmd run package:alpha
npm.cmd run lint:linkedin-feed-proof:firefox
git diff --check
```

The 2026-08-04 run passed all commands. The evidence included 37 scoring cases, seven Job page fixtures, ten Feed structures, exact Job/Chrome Feed/Firefox Feed package isolation, valid ZIP validation and Firefox lint with zero errors, notices or warnings.

## Exact package and identifiers

- Pinned runner: `web-ext` `10.3.0` from this repository's lockfile and local `node_modules`.
- Required Node version for pinned `web-ext` v10: Node 22 or later.
- Firefox staging directory: `dist/ark-lens-linkedin-feed-extraction-proof-firefox-v0.1/`.
- Firefox archive: `dist/ark-lens-linkedin-feed-extraction-proof-firefox-v0.1.zip`.
- WebExtension ID: `@ark-linkedin-feed-proof`.
- Firefox Android minimum version declared by the manifest: `142.0`.
- `web-ext` target: `firefox-android`.
- Firefox Android Release package: `org.mozilla.firefox`.
- The pinned runner's package auto-discovery list also recognizes `org.mozilla.fennec`, `org.mozilla.fenix.debug`, `org.mozilla.fenix`, `org.mozilla.geckoview_example`, `org.mozilla.geckoview`, `org.mozilla.firefox` and `org.mozilla.reference.browser`.

Use the package identifier actually installed on the test device. This gate targets Firefox Android Release through `org.mozilla.firefox`; testing another channel must be recorded as a separate environment fact.

## Prerequisites

1. A clean checkout of this branch with the lockfile unchanged.
2. Node 22 or later and `npm.cmd` available.
3. Android Platform Tools installed, with `adb` on `PATH` or an exact path supplied through `--adb-bin`.
4. A physical Android device or emulator visible to ADB.
5. USB debugging enabled and the computer authorized on a physical device.
6. Firefox Android Release 142 or later installed as `org.mozilla.firefox`.
7. Firefox **Remote debugging via USB** enabled.
8. At least one Firefox Android tab open before launch.
9. A signed-in LinkedIn session in Firefox Android with the web Feed open. The native LinkedIn application is outside this gate.
10. A desktop Firefox installation is recommended for `about:debugging` remote inspection; record sanitized evidence only.

## Device discovery and launch

Build and lint the exact staging directory first:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run build:linkedin-feed-proof:firefox
npm.cmd run lint:linkedin-feed-proof:firefox
```

Confirm the device or emulator and copy its serial exactly:

```powershell
adb devices
```

Launch the exact staged package with the repository-pinned runner:

```powershell
.\node_modules\.bin\web-ext.cmd run --source-dir dist/ark-lens-linkedin-feed-extraction-proof-firefox-v0.1 --target firefox-android --adb-device <DEVICE_SERIAL> --firefox-apk org.mozilla.firefox
```

If `adb` is not on `PATH`, append an exact Platform Tools path:

```powershell
--adb-bin "C:\path\to\platform-tools\adb.exe"
```

Do not substitute the ZIP for the staging directory in the `web-ext run` command. Do not add permissions or change selectors to make the temporary launch succeed.

## Interactive checks

Record pass, fail or blocked for every check:

1. Temporary installation succeeds.
2. The extension remains enabled for the test session.
3. The action is visible.
4. The popup or extension sheet opens.
5. The UI fits the phone viewport without inaccessible controls.
6. All controls are usable by touch.
7. The active LinkedIn Feed tab is identified.
8. `activeTab` authorizes injection.
9. All runtime files inject in canonical order.
10. The expected runtime globals exist.
11. The popup-to-tab message round-trip succeeds.
12. Scan works against the visible LinkedIn Feed.
13. The observer starts.
14. Newly visible posts are detected after scrolling.
15. Duplicate suppression works.
16. Stop cancels observation.
17. Clear removes the in-memory snapshot.
18. Export behavior is recorded exactly, including success, browser prompt, destination and any limitation.
19. Backgrounding and reopening Firefox does not duplicate listeners or observers.
20. LinkedIn single-page navigation is handled safely.
21. No extension storage is introduced.
22. No network transmission is introduced.
23. LinkedIn is not visually modified.

Fixture success does not prove mobile LinkedIn DOM compatibility. Any DOM failure must be captured as sanitized evidence before selectors or fallback logic are changed.

## Failure categories

Classify each failure under exactly one primary layer, with secondary context if required:

- `browser shell/API failure`
- `mobile popup/layout failure`
- `mobile LinkedIn DOM failure`
- `observer/lifecycle failure`
- `export limitation`

## Result template

```text
Date/time:
Tester:
Device or emulator:
Android version:
Firefox channel/version:
Firefox package identifier:
ADB device serial (redact if required):
Branch:
Commit:

Check number:
Result: pass | fail | blocked
Failure category:
Evidence:
Sanitized diagnostic:

Overall verdict:
FIREFOX ANDROID FEED GATE PASSED
or
FIREFOX ANDROID FEED GATE BLOCKED — DEVICE VALIDATION REQUIRED
or
FIREFOX ANDROID FEED GATE FAILED — <EXACT LAYER AND REASON>
```

Do not record credentials, private messages, raw page HTML, browsing history or unnecessary Feed text.
