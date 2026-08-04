# JOB_XB3 Safari Job Search Lens manual gate

## Status and boundary

The Safari Job shell stages the same canonical Job Search Lens runtime, popup, report, Lens editor, Alpha Guide, Fix Capture implementation, source adapters, policies, and assets used by Chrome and Firefox. The Windows-built ZIP is WebExtension staging evidence only.

```text
Safari macOS: BLOCKED — APPLE-HOST MANUAL VALIDATION REQUIRED
Safari iOS/iPadOS: BLOCKED — CONTAINING APP, SIGNING, AND DEVICE VALIDATION REQUIRED
Signed distribution: NOT STARTED
```

No Xcode project, containing app, Apple team identifier, entitlement, provisioning profile, signing file, or App Store metadata is committed by JOB_XB3.

## Exact staging package

- Build: `npm.cmd run build:job:safari`
- Staging directory: `dist/ark-lens-job-search-safari-v2026.6.19/`
- ZIP: `dist/ark-lens-job-search-safari-v2026.6.19.zip`
- Source manifest: `manifests/manifest.job.safari.json`

The ZIP is not directly installable on an iPhone or iPad. Apple conversion, containing-app generation, execution, and signing require macOS and current Xcode Safari Web Extension tooling.

## macOS prerequisites

- A supported Mac with Safari and Xcode.
- The reviewed Safari staging directory built from the exact commit under test.
- Safari Web Extension packaging/conversion tooling supplied by Xcode.
- Unsigned-extension development enabled only when using Safari's temporary local-development path.
- Supported LinkedIn Jobs and SEEK Jobs web surfaces and sanitized test data.

Record every converter or Xcode warning. Do not silence a warning by adding permissions or copying runtime code.

## macOS 23-point gate

Record `PASS`, `FAIL`, or `BLOCKED` and sanitized evidence for every check.

1. Xcode conversion or packaging completes and all warnings are recorded.
2. The generated containing app builds and launches.
3. The extension enables and remains enabled.
4. The action appears.
5. The shared popup opens.
6. LinkedIn Jobs reports the correct source-readiness state.
7. SEEK Jobs reports the correct source-readiness state.
8. Ordered script injection succeeds.
9. Popup/content/background messaging succeeds.
10. Session start and stop work.
11. Existing local-storage keys and shapes persist.
12. The action icon and title reflect session state.
13. Manual and automatic capture behave as on the protected Chrome baseline.
14. Supported same-tab navigation restarts capture without duplicate listeners.
15. The shared report opens and renders stored records.
16. The shared Lens editor opens and preserves Lens Pack behavior.
17. The shared Alpha Guide opens.
18. JSON and CSV export behavior and destination are recorded.
19. Fix Capture produces sanitized diagnostics.
20. Repair File preview, test, activation, and last-known-good rollback work.
21. Browser restart/session recovery follows the existing contract.
22. Reopening views and navigating do not duplicate listeners.
23. No network transmission, telemetry, new permissions, or Feed runtime was added.

## macOS result record

```text
Tester and date:
Mac model:
macOS and Safari versions:
Xcode and packager versions:
Branch and commit:
Artifact SHA-256:
Conversion/build warnings:
Checks 1–23:
Sanitized evidence:
Failure layer, if any:
Overall verdict: PASSED | BLOCKED | FAILED
```

## iOS/iPadOS prerequisites

- A Mac with Xcode and an iOS/iPadOS SDK supporting the chosen target.
- An iOS/iPadOS containing-app target generated from the reviewed staging directory.
- An iOS/iPadOS simulator, or a physical device with valid signing and provisioning.
- Safari enabled and the extension enabled in device settings.

## iOS/iPadOS gate

Run the macOS functional checks where applicable, then additionally record:

```text
Simulator or physical device:
Device model and iOS/iPadOS version:
Safari version:
Containing-app source commit:
Signing provenance (no secrets):
Popup/sheet viewport and touch behavior:
Active-tab permission behavior:
Extension-page navigation:
Local-storage persistence:
Export/share destination and errors:
LinkedIn and SEEK web surfaces tested:
Background/foreground lifecycle:
Unavailable or platform-limited APIs:
Sanitized evidence:
Overall verdict: PASSED | BLOCKED | FAILED
```

A macOS pass does not establish iOS/iPadOS behavior. A simulator pass does not establish signed physical-device or distribution readiness.

## Signing and distribution gate

Local development, simulator testing, physical-device signing, Developer ID/notarized distribution, TestFlight, and App Store distribution are separate gates. Do not commit credentials or user-specific signing configuration, and do not infer runtime correctness from successful conversion, signing, upload, review, or installation.
