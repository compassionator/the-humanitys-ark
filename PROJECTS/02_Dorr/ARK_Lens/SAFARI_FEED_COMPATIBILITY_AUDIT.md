# ARK Lens Safari Feed Compatibility and Distribution Audit

## Purpose and verdict boundary

This audit determines whether Safari can distribute and run the existing LinkedIn Feed extraction proof without copying its runtime, source adapter, domain policy, popup, or bootstrap.

The audit is based on repository commit `0d28197884d643589c4dff2193fde651033d3985`, the current Chrome and Firefox proof packages, and primary Apple documentation. It was performed on Windows. Safari was not run, an Apple package was not generated, and no macOS or iOS success is claimed.

The architecture evidence supports a thin Safari shell. Implementation and runtime validation require an Apple environment and remain a separate stage.

## Verified current baseline

The current Feed proof has:

- one canonical fourteen-file popup/bootstrap/runtime allow-list;
- a Chrome Manifest V3 shell with only `activeTab` and `scripting`;
- a Firefox Manifest V3 shell with the same runtime and permissions plus Gecko metadata;
- one shared popup, content bootstrap, LinkedIn Feed adapter, Feed mapper, Feed policy, and in-memory observer;
- portable in-process Node ZIP generation;
- exact package-isolation tests requiring 17 packaged files;
- browser-boundary tests for native `browser` and `chrome` namespaces;
- user-recorded manual passes on Chrome desktop and Firefox desktop.

The proof has no background process, content-script declaration, host permission, storage permission, download permission, network call, Job runtime, Dorr evaluation, or page-mutation behavior.

The current operation path is:

```text
Action popup
  -> query active tab
  -> verify LinkedIn /feed/ URL
  -> inject eleven runtime files in canonical order
  -> send an ARK_FEED_PROOF_* tab message
  -> content bootstrap dispatches to the in-memory Feed probe
  -> popup renders the returned snapshot
  -> optional user-triggered Blob/anchor JSON export
```

## Environment audit

| Requirement | This audit host |
|---|---|
| Operating system | Windows 10 (`10.0.19045`, AMD64) |
| macOS | Unavailable |
| Safari | Unavailable |
| Xcode / `xcodebuild` | Unavailable |
| `xcrun` | Unavailable |
| `safari-web-extension-packager` | Unavailable; Apple tooling is macOS/Xcode-owned |
| Legacy `safari-web-extension-converter` name | Unavailable |
| Apple `codesign` / `security` tools | Unavailable |
| Apple signing identity | Not inspectable on this Windows host |
| Connected iPhone or iPad | None detected by the available Windows device inspection |

Apple now calls the command-line conversion tool `safari-web-extension-packager`; it was previously named `safari-web-extension-converter`. It creates an Xcode project and macOS and/or iOS containing-app targets from an existing web-extension directory. See [Packaging a web extension for Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari?changes=_5).

The implementation gate for this task is not satisfied because the required Apple tools and execution targets are absent. No Safari shell is implemented here.

## Exact Feed browser API inventory

Only two files touch an extension API:

- `proofs/linkedin_feed/popup.js` selects `globalThis.browser || globalThis.chrome`, calls `tabs.query`, `scripting.executeScript`, and `tabs.sendMessage`, and performs a popup-local Blob export.
- `proofs/linkedin_feed/proof_content_bootstrap.js` selects the same namespace and registers `runtime.onMessage.addListener` once.

No canonical model, source adapter, Feed policy, or Feed probe imports or branches on a browser name.

### Compatibility matrix

| Current capability | Exact current use | Primary Apple evidence | Audit conclusion | Required live evidence |
|---|---|---|---|---|
| API namespace | `globalThis.browser || globalThis.chrome` | Apple states that Safari web extensions support both `chrome.*` and `browser.*`, and both callback and Promise styles. [Browser compatibility](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility?changes=_1_2&language=objc) | Compatible in principle; Safari should select `browser` when exposed, otherwise `chrome` | Confirm the selected namespace and error-free popup initialization on macOS and iOS |
| Manifest V3 | `manifest_version: 3` | Safari 15.4 added Manifest V3 and `browser.scripting`. [Safari 15.4 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-15_4-release-notes?changes=_4) | Supported from Safari 15.4 | Run the current packager and record warnings against the chosen deployment targets |
| User-scoped page access | `activeTab` only; no host permission | Apple explicitly recommends `activeTab` for least-privilege Safari extensions and describes its site-permission prompt behavior on macOS and iOS. [Managing permissions](https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions?changes=_7) | Correct privacy boundary; do not add a LinkedIn host permission speculatively | Confirm the action invocation grants the expected single-tab access on both platforms |
| Active-tab lookup | `tabs.query({ active: true, currentWindow: true })` and reads `tab.id` and `tab.url` | Safari supports WebExtension namespaces and the `tabs` API, with permission-dependent access to tab details. [Browser compatibility](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility?changes=_1_2&language=objc) | Expected to work after the user action/permission grant, but the returned URL is a gate-critical assumption | Confirm `tab.id`, `tab.url`, current-window semantics, and the LinkedIn route check |
| Ordered injection | `scripting.executeScript({ target: { tabId }, files })` | Apple documents Manifest V3 scripting support and lists `scripting.executeScript` in its compatibility guidance. [Browser compatibility](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility?changes=_1_2&language=objc) | API shape is supported; the existing ordered file array can remain canonical | Confirm all eleven globals load in order and repeated injection remains harmless |
| Popup-to-tab messaging | `tabs.sendMessage(tabId, message)` | Safari web extensions use the common WebExtension API model; Apple release notes record continued `tabs.sendMessage` support and later `documentId` additions. [Safari 18.4 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes?_2___6_5=&objc=) | Current call uses no unsupported `documentId` option and should remain unchanged | Confirm scan/start/stop/snapshot/clear round trips on macOS and iOS |
| Content listener | `runtime.onMessage.addListener`, callback `sendResponse`, `return true` | Apple supports callback and Promise asynchronous styles; Safari 15.4 also corrected Promise message responses. [Browser compatibility](https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility?changes=_1_2&language=objc), [Safari 15.4 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-15_4-release-notes?changes=_4) | Current callback/retained-channel pattern is the conservative shared form | Confirm the asynchronous response channel remains open on both platforms |
| Action popup | Manifest `action.default_popup` points to the shared HTML | Apple documents that Safari displays a web-extension popup webpage from its toolbar item. [Running a Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension) | Manifest concept is compatible; presentation is browser-owned | Confirm toolbar/action visibility, popup opening, dismissal, dimensions, keyboard and touch use |
| Local JSON export | Popup creates `Blob`, object URL, hidden anchor download, then revokes URL | This is a web-platform path rather than a WebExtension `downloads` API. The reviewed Apple extension documentation does not establish identical macOS/iOS popup download behavior | No manifest permission change is justified; behavior is unknown until executed | Record filename, destination/share sheet, user feedback, and whether immediate URL revocation is safe |

The audit does not find a current need for a Safari-specific JavaScript capability adapter. One should be added only if the live shell gate proves a behavioral delta that cannot be contained in the Safari shell.

## Manifest delta

A Safari-owned source manifest is recommended even if its first revision is functionally equivalent to the Chrome proof manifest. Separate ownership prevents later Apple metadata or compatibility changes from leaking into Chrome or Firefox.

The expected web-extension manifest remains:

```text
manifest_version: 3
name/version/description
action.default_popup
action.default_title
permissions: activeTab, scripting
```

Safari must not inherit Firefox-only `browser_specific_settings.gecko` or `gecko_android` fields. It does not currently need:

- a background page or service worker;
- host permissions;
- declarative content scripts;
- `downloads`, `storage`, `tabs`, notifications, cookies, or web-request permissions;
- an update URL;
- native messaging.

The generated containing apps additionally own Apple bundle identifiers, deployment targets, `Info.plist` values, app icons, entitlements, signing configuration, and distribution metadata. Those are Xcode/App Store concerns and must not be copied into the canonical Feed runtime.

The packager must be run on a Mac before the manifest delta is considered verified. Any warning it emits is evidence to review, not a reason to silently add permissions.

## macOS development and validation path

Apple supports two distinct macOS paths:

1. **Fast temporary gate:** Safari can temporarily load a valid web-extension folder or ZIP without an Xcode project. The temporary extension is removed after 24 hours or when Safari quits. [Running a Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)
2. **Containing-app gate:** Run `xcrun safari-web-extension-packager <staging-directory>` to create an Xcode project and macOS containing app, then build/run the app and enable the extension in Safari. [Packaging a web extension for Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari?changes=_5)

The temporary folder gate should precede committing an Xcode project. It can establish manifest acceptance, permissions, popup, injection, messaging, observer behavior, and export without introducing Apple container files prematurely.

Unsigned macOS development is possible when Safari is configured to allow unsigned extensions. Signed distribution requires a signed containing app; App Store distribution requires Apple Developer Program and App Store Connect, while Developer ID signing/notarization is an alternative outside the Mac App Store. See [Distributing a Safari web extension](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension).

## iOS development and validation path

iOS requires a containing iOS app to deploy the Safari web extension. Xcode builds the extension, embeds it in the app, and deploys it to an iOS simulator or device. The user must then enable it in Safari settings or the Safari Extensions menu. [Running a Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)

- An unsigned extension can be tested in the iOS simulator.
- Testing on a physical iPhone/iPad requires Apple Developer Program membership and signing.
- Beta distribution may use a signed ad-hoc build or TestFlight.
- App Store distribution requires the normal signed app review path.

One canonical web-extension resource set can serve macOS and iOS targets in one generated Xcode project. It is not one cross-platform app binary: macOS and iOS retain platform-specific containing-app targets and validation. Apple’s packager supports creating both platforms and can add iOS to an existing macOS project with `--rebuild-project`.

The popup’s fixed `360px` body width is a specific iPhone risk, not evidence of failure. Do not redesign it before an iOS simulator/device records the actual extension-sheet viewport and touch behavior.

## Packaging design

Safari should reuse `tests/tools/linkedin-feed-proof-package.js` and its existing `SHARED_ENTRIES` allow-list.

The smallest package addition is:

```text
Safari source manifest
  + existing fourteen shared runtime/UI entries
  + generated BUILD_INFO.json
  + generated SHA256SUMS.txt
  = 17 files in the Safari web-extension staging directory
```

The existing helper already accepts `manifestSource` and `releaseName`, so a Safari builder can be a thin invocation comparable to the Chrome and Firefox builders. Package tests should verify:

- exactly 17 entries;
- the canonical shared entries are byte-identical across Chrome, Firefox, and Safari staging;
- only the selected manifest is staged as root `manifest.json`;
- no Chrome, Firefox, Gecko, Job, test, fixture, or Apple/Xcode development file enters the web-extension ZIP;
- no Safari file enters Chrome, Firefox, or Job artifacts.

The Node ZIP is the portable web-extension resource artifact. An Xcode project or App Store package is a separate Safari-shell artifact and must not replace or redefine the canonical allow-list. Feed resources should be staged first, then supplied to Apple’s packager.

Apple also offers a web-based Safari Web Extension Packager through App Store Connect, but it requires Apple Developer Program enrollment and is a distribution path, not a substitute for local Safari behavior validation. [Packaging with App Store Connect](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect)

## Shared-runtime decision

### Can the canonical Feed runtime remain unchanged?

**Yes, as the implementation starting point.**

Repository evidence shows no browser API in canonical models, adapter code, Feed mapping/policy, or the observer. The two boundary files already choose a native WebExtension namespace supported by Safari. No Safari selector, browser-name conditional, polyfill, native bridge, or runtime copy is justified before live evidence.

### Can the popup/view remain shared?

**Yes, provisionally.**

The HTML, controls, rendering, and export should remain shared through the macOS temporary gate and iOS simulator gate. Platform-specific presentation belongs to Safari. A narrow shared responsive CSS correction is permitted only after measured viewport evidence; an independent Safari popup is not the default.

### What is Safari-shell-owned?

- Safari source manifest;
- staging/build command;
- package-isolation assertions;
- Apple packager invocation and generated containing-app project;
- bundle identifiers, deployment targets, entitlements, icons, and signing settings;
- macOS/iOS installation and validation records;
- a capability shim only if a live failure proves one necessary.

## Answers to the Safari audit questions

1. **Can the canonical runtime remain unchanged?** Yes as the first implementation and test candidate.
2. **Does `browser || chrome` fit Safari?** Yes in principle; Apple supports both namespaces. Live execution remains required.
3. **Are the used APIs supported?** `activeTab`, Manifest V3 scripting, common tab/runtime messaging, and an action popup are supported concepts. Popup-local Blob export remains a live macOS/iOS behavior gate.
4. **Which manifest fields differ?** Safari excludes Gecko metadata and moves Apple app identity/signing/deployment metadata into the generated containing-app project.
5. **Is a Safari-specific manifest required?** Yes as a shell ownership boundary, even if initially functionally identical to Chrome.
6. **Can one Safari bundle serve macOS and iOS?** One web-resource set can feed both targets in one project; the platform app targets/binaries and gates remain distinct.
7. **What requires an Xcode containing app?** iOS deployment, native app-extension communication, normal macOS app installation, and signed distribution.
8. **What requires macOS hardware?** Local Apple command-line packaging, Xcode builds, macOS Safari execution, simulator use, and physical iOS deployment.
9. **What requires signing or an Apple Developer account?** Physical iOS testing and user distribution require signing/program membership. App Store/TestFlight distribution requires the program. Temporary macOS and iOS simulator development can be unsigned.
10. **What can be tested without paid distribution?** A temporary extension in macOS Safari, an unsigned macOS containing app with Safari’s development setting, and an iOS simulator build on a Mac.
11. **Can the existing helper stage Safari resources?** Yes; its manifest-source/release-name parameters and canonical allow-list already support a thin third builder.
12. **Should Safari reuse the canonical allow-list?** Yes. A new copied allow-list would be an architecture defect.
13. **What popup/sheet differences exist on iPhone?** The system presentation, available viewport, touch behavior, dismissal, and export destination may differ; exact behavior is unknown until simulator/device execution.
14. **What lifecycle differences require testing?** Popup reopening, repeated script injection, listener guard persistence, observer stop/restart, tab switching, Safari/background suspension, and LinkedIn SPA navigation.
15. **What remains unknown without Mac/iPhone testing?** Manifest warnings, permission prompts, active-tab URL access, API round trips, popup dimensions, Blob export, lifecycle, mobile LinkedIn DOM, and signed/container behavior.
16. **What is the smallest safe Safari slice?** A Safari-specific 17-file staging package followed by a macOS temporary-extension gate; create the Xcode project only after that passes.

## Smallest safe implementation stage

### Stage

`SAFARI_P0.1 — Thin Safari Feed Staging and macOS Temporary Gate`

### Proposed branch

```text
codex/safari-feed-p0-macos-shell
```

### Scope

1. Add one Safari-owned source manifest with only the current proof capabilities.
2. Add one thin Node builder that reuses `SHARED_ENTRIES`.
3. Extend package-isolation and browser-boundary tests to include Safari staging.
4. Run existing Chrome, Firefox, Job, and Feed gates unchanged.
5. On macOS, temporarily load the exact Safari staging folder before generating an Xcode project.
6. Record the result without claiming iOS success.

### Likely files

- `proofs/linkedin_feed/manifests/manifest.safari.json`
- `tests/tools/build-linkedin-feed-proof-safari-package.js`
- `tests/package-isolation.test.js`
- `tests/feed-browser-api-boundary.test.js`, only if a Safari-specific contract is evidenced
- `package.json`
- this audit or a separate Safari gate record
- generated Xcode/container files only in a later, separately reviewed commit after the temporary gate

### Explicitly forbidden files and changes

- canonical Feed adapter, mapper, capture policy, probe, models, or diagnostics;
- LinkedIn selectors or fixtures without live sanitized failure evidence;
- Chrome or Firefox runtime copies;
- Job runtime, Job manifest, Job packages, Lens Packs, schemas, or Fix Capture;
- Dorr grammar or rules;
- shared Feed UI redesign;
- storage, host permissions, background scripts, network behavior, telemetry, or AI;
- Safari Job Lens or F3B.

### Automated gate

```text
npm.cmd test
npm.cmd run build:linkedin-feed-proof
npm.cmd run build:linkedin-feed-proof:firefox
npm.cmd run build:linkedin-feed-proof:safari
npm.cmd run package:alpha
npm.cmd run lint:linkedin-feed-proof:firefox
git diff --check
```

The Safari artifact must contain exactly 17 entries and preserve isolation in every direction.

### Commit boundary

Commit 1 should contain only the Safari manifest, thin package invocation, scripts, and exact package tests. A later documentation-only commit may record the user-executed macOS gate. Xcode project generation is a separate commit and review boundary.

### Stop conditions

Stop before runtime changes if:

- Apple’s packager rejects or rewrites the manifest unexpectedly;
- `activeTab` does not expose the selected LinkedIn tab after user interaction;
- script ordering or messaging differs;
- a new permission appears necessary;
- shared CSS requires a Safari-only fork;
- export requires native app code or broader permissions;
- canonical Feed code would need a Safari name branch;
- Chrome, Firefox, Job, or Feed package isolation regresses.

## Manual test checklist

### Safari macOS temporary extension

1. Build the exact Safari staging directory and record its SHA-256.
2. Enable Safari developer features and unsigned extensions.
3. Add the staging folder as a temporary extension.
4. Record all manifest/permission warnings.
5. Enable the extension and confirm its toolbar action is visible.
6. Open a real LinkedIn home Feed tab.
7. Open the action popup and record its usable dimensions.
8. Confirm the first action obtains only the expected current-site permission.
9. Confirm active-tab ID and URL validation succeeds.
10. Confirm the eleven runtime files inject in canonical order.
11. Confirm required runtime globals exist.
12. Confirm scan returns a snapshot.
13. Confirm observation starts.
14. Scroll manually and confirm newly rendered posts are detected.
15. Confirm duplicate suppression.
16. Stop and confirm capture remains stopped.
17. Clear and confirm only the in-memory snapshot is removed.
18. Export and record filename, destination, content, and errors.
19. Close/reopen the popup and repeat injection; confirm one listener and observer lifecycle.
20. Navigate away and back through LinkedIn SPA navigation; record behavior.
21. Confirm no extension storage appears.
22. Confirm no network transmission appears.
23. Confirm LinkedIn is not visually modified.

Classify failures as manifest/permission, browser API, popup/layout, export, lifecycle, or LinkedIn DOM.

### Safari iOS simulator, then physical device

Repeat the macOS behavioral checks and additionally record:

- containing-app installation and extension enablement;
- Safari More-menu/action discovery;
- permission prompt and active-tab behavior;
- portrait and landscape viewport/touch use;
- popup dismissal and reopening;
- export destination or share-sheet behavior;
- suspension/background/foreground behavior;
- mobile LinkedIn Feed DOM and SPA behavior.

Do not modify mobile selectors until a sanitized diagnostic and fixture isolate a real DOM failure. Simulator success does not replace a physical-device gate, and neither constitutes Safari Job Lens support.

## Risks

- Apple API support does not prove the current permission timing and popup lifecycle.
- The fixed `360px` popup width may not fit iPhone presentation.
- Immediate object-URL revocation may behave differently during Safari export.
- Mobile LinkedIn may expose a materially different DOM or redirect toward the native app.
- A generated Xcode project can become a large, drifting ownership surface if committed before its need is proven.
- App Store Connect packaging can produce an app without proving live source extraction.
- Signing/distribution success is independent from shell/API success.
- Adding host, storage, download, or native messaging permissions to bypass an unclassified failure would violate the proof boundary.

## Audit verdict

```text
SAFARI FEED AUDIT COMPLETE — SAFE TO IMPLEMENT THIN SAFARI SHELL
```

This verdict authorizes only the staged macOS-first shell slice above. It does not claim Safari macOS or Safari iOS runtime success.
