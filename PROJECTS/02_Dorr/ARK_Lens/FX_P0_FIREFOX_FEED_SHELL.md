# ARK Lens Firefox Feed Shell

## Purpose

FX_P0 provides a Firefox distribution shell for the existing read-only LinkedIn Feed extraction proof. It does not fork or extend Feed extraction behavior.

The shell supports packaging, linting and temporary Firefox desktop loading. Firefox Android remains a separate manual compatibility gate.

## Shared runtime boundary

Chrome and Firefox consume the same canonical Feed runtime:

- `core/lens_item.js`
- `core/extraction_result.js`
- `sources/source_adapter_registry.js`
- `sources/dom_read_utils.js`
- `sources/adapter_diagnostics.js`
- `sources/feed/feed_source_catalogue.js`
- `sources/feed/linkedin_feed_adapter.js`
- `domains/feed/feed_item_mapper.js`
- `domains/feed/feed_capture_policy.js`
- `orchestration/feed/linkedin_feed_probe.js`

The proof popup and content bootstrap are also shared. Browser distribution metadata remains outside the canonical runtime.

No Feed extraction, selector, identity, observation, deduplication, privacy or export-schema behavior is redefined by the Firefox shell.

## Manifest separation

The Chrome proof continues to own:

```text
proofs/linkedin_feed/manifest.json
```

The Firefox shell owns:

```text
proofs/linkedin_feed/manifests/manifest.firefox.json
```

Each artifact stages its selected source manifest as the root `manifest.json`. Exact package tests prevent either browser-specific source manifest from entering the opposite artifact.

The Firefox manifest uses Manifest V3 with only:

- an action popup;
- `activeTab`;
- `scripting`.

It does not add a background process, storage, host permissions, content scripts, downloads, notifications, cookies, web requests or network access.

## Firefox identity and compatibility policy

The stable Gecko ID is:

```text
@ark-linkedin-feed-proof
```

The distribution manifest declares:

- Firefox desktop minimum version `140.0`;
- Firefox Android minimum version `142.0`;
- required data collection category `none`.

Temporary development and distribution use the same manifest policy.

## Browser API namespace

The shared popup and bootstrap select the native extension API namespace locally:

```javascript
const EXTENSION_API = globalThis.browser || globalThis.chrome;
```

Firefox therefore uses the Promise-capable `browser` namespace, while Chrome continues to use its native `chrome` namespace. No repository-wide facade and no `webextension-polyfill` are introduced.

## Exact package allow-list

Both Feed builders use one packaging helper and one canonical shared-runtime allow-list. Each package contains:

- its selected manifest staged as `manifest.json`;
- the fourteen shared popup, bootstrap and canonical runtime files;
- generated `BUILD_INFO.json`;
- generated `SHA256SUMS.txt`.

Each archive contains exactly 17 files under one top-level release directory.

The Firefox artifact is:

```text
dist/ark-lens-linkedin-feed-extraction-proof-firefox-v0.1.zip
```

Its generated release directory is also the exact staging root used for linting and temporary loading:

```text
dist/ark-lens-linkedin-feed-extraction-proof-firefox-v0.1/
```

Job-domain code, tests, fixtures, development files and the Chrome source manifest are forbidden.

## Lint strategy

The repository pins `web-ext` to exact development version `10.3.0`. The lint command first rebuilds the exact Firefox staging directory and then lints that directory. Warnings are treated as errors after the initial lint completed with zero warnings:

```text
npm.cmd run lint:linkedin-feed-proof:firefox
```

The portable in-process Node ZIP builder remains the canonical artifact generator. `web-ext build`, operating-system archive tools and external unzip commands are not used.

## Firefox desktop temporary installation

Build and launch the staged proof with:

```text
npm.cmd run run:linkedin-feed-proof:firefox
```

When Firefox is not available by its default executable name, pass an explicit binary path through to `web-ext`:

```text
npm.cmd run run:linkedin-feed-proof:firefox -- --firefox="C:\Program Files\Mozilla Firefox\firefox.exe"
```

Temporary execution proves browser-shell installation and runtime wiring. Fixture results do not prove live LinkedIn selectors.

## Firefox desktop interactive gate

```text
Firefox desktop interactive gate:
EXECUTED BY USER — PASSED
```

The user successfully verified the proof interactively in Firefox desktop. The tested behavior included:

- Firefox accepted the temporary extension;
- the action popup opened;
- LinkedIn Feed scan worked;
- extraction results were available;
- observation and scrolling worked;
- duplicate suppression worked;
- stopping observation worked;
- local JSON export worked;
- clearing the in-memory snapshot worked;
- LinkedIn was not visually modified.

No additional measurements, post counts, browser logs or diagnostics are recorded by this gate.

## Current stage status

```text
FX_P0 DESKTOP COMPLETE — READY FOR FIREFOX ANDROID GATE
```

## Pending compatibility gates

The following items remain unresolved:

- Firefox Android installation;
- Android popup sizing and touch usability;
- Android active-tab behavior;
- Android export behavior;
- mobile LinkedIn Feed DOM;
- mobile single-page application and background lifecycle;
- Firefox Job Lens;
- F3B.

Live Firefox Android Feed compatibility has not yet been proven. Mobile LinkedIn Feed DOM and selectors remain unverified. Any future mobile selector correction requires sanitized live evidence and focused regression fixtures.

Native LinkedIn or other native social applications are outside the browser-extension boundary.

Firefox Job Lens work has not begun.

F3B has not begun.
