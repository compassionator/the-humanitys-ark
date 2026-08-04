# ARK Lens — Safari P0.1 Manual Gate

## Status

```text
SAFARI_P0.1 AUTOMATED REPOSITORY GATE ONLY
SAFARI MACOS EXECUTION NOT YET VERIFIED
SAFARI IOS/IPADOS EXECUTION NOT YET VERIFIED
```

This gate validates the thin Safari delivery shell produced from the canonical LinkedIn Feed runtime. It does not redefine Feed semantics, selectors, capture policy, diagnostics, popup behavior, or browser-neutral models.

The current Windows repository gate cannot prove Safari execution. Apple-host results must be recorded from the exact staged package without inventing success from API documentation or package construction alone. See the [Safari compatibility audit](SAFARI_FEED_COMPATIBILITY_AUDIT.md) for the evidence and ownership boundary.

## Gate boundaries

| Gate | Proves | Does not prove |
|---|---|---|
| Automated repository gate | Exact Safari manifest selection, 17-file package isolation, valid ZIP construction, canonical shared runtime bytes, and existing contract/regression tests | Safari installation, permissions, popup presentation, runtime API behavior, LinkedIn DOM behavior, or export |
| macOS temporary/manual gate | Manifest acceptance and live Feed proof behavior in desktop Safari on the tested Mac/Safari version | iPhone/iPad behavior, signing, App Store acceptance, or general Safari support |
| iOS/iPadOS signed-device gate | Containing-app deployment and live behavior on the recorded device, OS, Safari, and LinkedIn surface | Other devices, desktop Safari, or distribution approval |
| Distribution/App Store gate | Signing, packaging, installation, and the selected distribution channel | Feed extraction correctness or cross-device runtime parity |

Each gate is independent. Passing a later packaging or distribution gate does not replace the behavioral gates.

## Automated repository gate

From `PROJECTS/02_Dorr/ARK_Lens`:

```powershell
npm.cmd test
npm.cmd run build:linkedin-feed-proof
npm.cmd run build:linkedin-feed-proof:firefox
npm.cmd run build:linkedin-feed-proof:safari
npm.cmd run package:alpha
npm.cmd run lint:linkedin-feed-proof:firefox
git diff --check
```

The Safari staging directory is:

```text
dist/ark-lens-linkedin-feed-extraction-proof-safari-v0.1/
```

The portable repository artifact is:

```text
dist/ark-lens-linkedin-feed-extraction-proof-safari-v0.1.zip
```

Required automated result:

- exactly 17 packaged files;
- one Safari-selected root `manifest.json`;
- the same 14 shared runtime/UI files used by Chrome and Firefox;
- generated `BUILD_INFO.json` and `SHA256SUMS.txt`;
- no Job, test, fixture, documentation, browser-manifest source, Apple-container, `node_modules`, or generated-package file inside the staged extension;
- permissions limited to `activeTab` and `scripting`;
- no background process, storage, host permission, downloads permission, external-network permission, or declarative page injection;
- the canonical script load order remains covered by the shared Feed browser-boundary tests.

## macOS prerequisites

- A Mac running a macOS release supported by the installed Xcode and Safari versions.
- Safari 15.4 or later for the Manifest V3 and `scripting` capability used by this proof; test against the actual product deployment targets rather than treating the minimum as a support promise.
- Current Xcode and its command-line tools, including `xcrun` and Safari Web Extension packaging support.
- Safari developer features enabled. Allow unsigned extensions only for an explicitly controlled local-development gate.
- A clean checkout of the exact commit under review and its freshly built Safari staging directory.
- A test LinkedIn account and consent to inspect only content already rendered in the visible Feed.

Primary Apple references:

- [Assessing browser compatibility](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility?changes=_1_2&language=objc)
- [Packaging a web extension for Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari?changes=_5)
- [Running a Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)
- [Managing Safari web-extension permissions](https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions?changes=_7)
- [Distributing a Safari web extension](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)

## macOS manual gate

### Prepare the exact shell

1. Check out the reviewed Safari shell commit on the Mac.
2. Run the automated repository gate above.
3. Record the commit SHA, Node/npm versions, Safari version, macOS version, Xcode version, staging ZIP SHA-256, and any package warnings.
4. First attempt Safari's temporary/development loading path with the exact staged directory where the installed Safari version permits it.
5. For the containing-app path, supply that same staged directory to Apple's installed packaging tool, for example:

   ```bash
   xcrun safari-web-extension-packager PROJECTS/02_Dorr/ARK_Lens/dist/ark-lens-linkedin-feed-extraction-proof-safari-v0.1
   ```

6. Review the generated project before building. Do not commit generated Apple files as part of this gate.
7. Build and run the containing app locally, then enable its extension in Safari.

### Validate live behavior

Record pass, fail, or blocked plus sanitized evidence for every item:

1. Safari accepts the extension and reports any manifest or permission warnings.
2. The extension remains enabled for the test session.
3. The toolbar action is visible.
4. The shared action popup opens and remains usable.
5. The active LinkedIn Feed tab is identified only after the user action.
6. `activeTab` authorizes the intended single-tab access without a broader host permission.
7. All eleven canonical runtime scripts inject in their existing order.
8. The expected runtime globals exist.
9. Popup-to-tab and tab-to-popup message round trips succeed.
10. Scan returns the current in-memory snapshot.
11. Observation starts.
12. Newly visible posts are detected after manual scrolling.
13. Duplicate suppression works.
14. Stop cancels observation.
15. Clear removes the in-memory snapshot.
16. Local JSON export works; record filename, destination, errors, and whether Safari presents another flow.
17. Closing and reopening the popup does not duplicate listeners or observers.
18. LinkedIn SPA navigation is handled safely.
19. No extension storage is introduced.
20. No network transmission is introduced.
21. LinkedIn is not visually modified.

Classify a failure before proposing a fix:

```text
manifest or permission
browser API or messaging
popup or layout
export
observer or lifecycle
LinkedIn desktop DOM
```

Do not add permissions, a background process, Safari selectors, a popup fork, or copied runtime files to bypass an unclassified failure.

## iOS/iPadOS prerequisites

- A Mac with Xcode and an Apple platform SDK supporting the chosen iOS/iPadOS deployment target.
- An Apple containing app with iOS/iPadOS extension target generated from the reviewed staging directory.
- An iOS/iPadOS simulator for the unsigned simulator gate.
- For a physical iPhone or iPad: an Apple Developer Program team, a valid signing identity/provisioning configuration, and a connected registered device.
- Safari enabled on the test device and the extension enabled in device Safari settings.

An iOS/iPadOS containing app is required. A Windows-built ZIP cannot be installed directly as an iPhone/iPad Safari extension.

## iOS/iPadOS manual gate

Run the simulator gate first, then repeat on a signed physical device. Record the containing-app commit/project provenance and keep simulator and device results separate.

1. The containing app installs and launches.
2. The Safari extension can be enabled and remains enabled.
3. The action is discoverable in Safari.
4. The popup or extension sheet opens.
5. Controls fit portrait and landscape viewports and are usable by touch.
6. Active-tab permission behavior is recorded exactly.
7. The active LinkedIn Feed tab is identified.
8. Canonical ordered injection completes.
9. Runtime globals and message round trip succeed.
10. Scan works against the mobile LinkedIn Feed surface.
11. Observation and scrolling detect newly visible posts.
12. Duplicate suppression works.
13. Stop and clear work.
14. Export/share behavior, destination, filename, and errors are recorded exactly.
15. Backgrounding and foregrounding do not duplicate listeners or observers.
16. LinkedIn SPA navigation remains safe.
17. No storage is introduced.
18. No network transmission is introduced.
19. LinkedIn is not visually modified.

Classify mobile failures separately as popup/sheet layout, active-tab permission, Apple lifecycle, export/share, or mobile LinkedIn DOM. Do not change selectors until sanitized diagnostics and a fixture demonstrate a source-layer failure.

## Signing and distribution boundary

Local macOS development, iOS simulator execution, physical-device signing, TestFlight, Developer ID/notarized distribution, and App Store distribution are different gates.

- Do not place bundle identifiers, entitlements, provisioning profiles, certificates, signing secrets, App Store metadata, or generated Xcode project assumptions in the WebExtension manifest.
- Do not commit credentials or user-specific signing configuration.
- Do not claim signed distribution from a temporary or simulator run.
- Do not claim runtime correctness from successful signing, conversion, upload, review, or installation.

## Result record

```text
Gate: automated repository | macOS temporary/manual | iOS simulator | iOS/iPadOS physical device | distribution
Result: PASS | FAIL | BLOCKED
Commit SHA:
Artifact SHA-256:
Host/device:
OS and Safari:
Xcode/tooling:
Checks completed:
Failure classification:
Sanitized evidence:
Follow-up boundary:
```

Until an Apple host records the relevant result, the authoritative status remains:

```text
SAFARI_P0.1 AUTOMATED GATE ONLY — MACOS VALIDATION REQUIRED
```
