const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { evaluate, extractFunction, plain } = require("./helpers/source-contracts");

const root = path.resolve(__dirname, "..");
const requiredFiles = [
  "alpha/guide.html",
  "alpha/guide.css",
  "alpha/guide.js",
  "peer-alpha/TESTER_GUIDE.md",
  "peer-alpha/OWNER_CHECKLIST.md",
  "peer-alpha/FEEDBACK_TEMPLATE.md",
  "peer-alpha/KNOWN_LIMITATIONS.md",
  "peer-alpha/PRIVACY.md",
  "tests/tools/build-peer-alpha-package.js"
];

[16, 32, 48, 128].forEach((size) => {
  requiredFiles.push(`icons/ark-lens-${size}.png`);
  requiredFiles.push(`icons/ark-lens-active-${size}.png`);
});

requiredFiles.forEach((relativePath) => {
  assert.equal(fs.existsSync(path.join(root, relativePath)), true, `Missing ${relativePath}`);
});

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const backgroundSource = read("background.js");
const popupHtml = read("popup/popup.html");
const popupSource = read("popup/popup.js");
const alphaHtml = read("alpha/guide.html");
const alphaSource = read("alpha/guide.js");
const packageSource = read("tests/tools/build-peer-alpha-package.js");
const manifest = JSON.parse(read("manifest.json"));

function idsFromHtml(html) {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
}

function testSessionIndicatorContract() {
  const source = extractFunction(backgroundSource, "getSessionIndicatorState");
  const { getSessionIndicatorState } = evaluate(source, ["getSessionIndicatorState"]);

  assert.deepEqual(plain(getSessionIndicatorState({ active: true })), {
    icon_paths: {
      16: "icons/ark-lens-active-16.png",
      32: "icons/ark-lens-active-32.png",
      48: "icons/ark-lens-active-48.png",
      128: "icons/ark-lens-active-128.png"
    },
    title: "ARK Lens — Session active"
  });
  assert.deepEqual(plain(getSessionIndicatorState({ active: false })), {
    icon_paths: {
      16: "icons/ark-lens-16.png",
      32: "icons/ark-lens-32.png",
      48: "icons/ark-lens-48.png",
      128: "icons/ark-lens-128.png"
    },
    title: "ARK Lens"
  });

  assert.match(backgroundSource, /chrome\.action\.setIcon/);
  assert.match(backgroundSource, /chrome\.action\.setBadgeText/);
  assert.doesNotMatch(backgroundSource, /chrome\.action\.setBadgeBackgroundColor/);
  assert.match(backgroundSource, /chrome\.storage\.onChanged\.addListener/);
  assert.match(backgroundSource, /chrome\.runtime\.onStartup\.addListener/);
  assert.match(backgroundSource, /chrome\.runtime\.onInstalled\.addListener/);
  assert.match(backgroundSource, /details\?\.reason === "install"/);
  assert.match(backgroundSource, /alpha\/guide\.html/);
  assert.equal(manifest.action.default_icon[16], "icons/ark-lens-16.png");
  assert.equal(manifest.icons[128], "icons/ark-lens-128.png");
}

function testPrivacySafeSummary() {
  const dependencies = [
    "getFeedbackValue",
    "incrementCount",
    "buildPeerTestSummary"
  ].map((name) => extractFunction(alphaSource, name)).join("\n");
  const { buildPeerTestSummary } = evaluate(dependencies, ["buildPeerTestSummary"]);
  const summary = plain(buildPeerTestSummary(
    { version: "2026.6.19" },
    {
      id: "private_person_name",
      name: "Private Person's Search",
      lens_pack_version: "v2026.06.019",
      supported_source_adapters: ["linkedin_jobs", "seek_jobs"]
    },
    [
      {
        source: { id: "linkedin_jobs", url: "https://secret.example/job?token=secret" },
        display: { primary_text: "Secret Job", secondary_text: "Secret Company" },
        content: { full_text: "Secret description" },
        classification: { workflow_state: "review" },
        memory: {
          notes: "Secret note",
          user_workflow_override: "ignore",
          relevance_feedback: {
            value: "not_relevant",
            reason: "other",
            detail: "Secret feedback detail"
          }
        }
      }
    ],
    {
      active: true,
      session_id: "secret-session",
      tab_id: 99,
      captured_count: 1
    },
    "2026-07-16T12:00:00.000Z"
  ));

  assert.equal(summary.schema_version, "1.0.0");
  assert.equal(summary.release_channel, "controlled_peer_alpha");
  assert.equal(summary.ark_lens_version, "2026.6.19");
  assert.equal(summary.counts.saved_jobs, 1);
  assert.equal(summary.counts.by_source.linkedin_jobs, 1);
  assert.equal(summary.counts.by_effective_fit.ignore, 1);
  assert.equal(summary.counts.by_relevance.not_relevant, 1);
  assert.equal(summary.session.active, true);
  assert.equal(summary.session.captured_count, 1);

  const serialized = JSON.stringify(summary);
  [
    "private_person_name",
    "Private Person's Search",
    "Secret Job",
    "Secret Company",
    "Secret description",
    "Secret note",
    "Secret feedback detail",
    "secret-session",
    "token=secret"
  ].forEach((secret) => assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
}

function testAlphaUserSurface() {
  const ids = idsFromHtml(alphaHtml);
  [
    "buildVersion",
    "readinessOverall",
    "checkLens",
    "checkSources",
    "checkStorage",
    "checkSession",
    "refreshReadiness",
    "openLensEditor",
    "openReport",
    "downloadAlphaSummary",
    "copyFeedbackTemplate",
    "alphaNotice"
  ].forEach((id) => assert.equal(ids.has(id), true, `Missing Alpha Guide control ${id}`));

  assert.equal(idsFromHtml(popupHtml).has("alphaGuide"), true);
  assert.match(popupHtml, /Getting Started/);
  assert.match(popupSource, /alpha\/guide\.html/);
  assert.match(alphaHtml, /5-minute first run/i);
  assert.match(alphaHtml, /What the match percentage means/i);
  assert.match(alphaHtml, /Your data stays in this browser/i);
  assert.match(alphaHtml, /Known alpha limits/i);
  assert.match(alphaHtml, /Fix Capture/);
  assert.doesNotMatch(alphaSource, /\.innerHTML\s*=/);
  assert.doesNotMatch(popupSource, /\.innerHTML\s*=/);
}

function testRepeatablePackageContract() {
  assert.match(packageSource, /dist/);
  assert.match(packageSource, /peer-alpha/);
  assert.match(packageSource, /SHA256SUMS\.txt/);
  assert.match(packageSource, /BUILD_INFO\.json/);
  assert.match(packageSource, /\.zip/);
  assert.match(packageSource, /icons\/ark-lens-16\.png/);
  assert.match(packageSource, /core\/lens_item\.js/);
  assert.match(packageSource, /core\/deterministic_matcher\.js/);
  assert.match(packageSource, /core\/extraction_result\.js/);
  assert.match(packageSource, /sources\/source_adapter_registry\.js/);
  assert.match(packageSource, /compatibility\/job_extraction_compat\.js/);
  assert.match(packageSource, /policies\/job_capture_policy\.js/);
  assert.match(packageSource, /policies\/job_policy_runtime\.js/);
  assert.match(packageSource, /feed_lens_runtime:\s*Object\.freeze\(\[\]\)/);
  assert.match(packageSource, /outside the Job peer-alpha allow-list/i);
  assert.match(packageSource, /Feed implementation is forbidden/i);
  assert.doesNotMatch(packageSource, /^\s*"(?:core|sources|policies)",?$/m);
  assert.match(packageSource, /tests\/fixtures/);
  assert.match(packageSource, /must not be packaged/i);

  [
    "peer-alpha/TESTER_GUIDE.md",
    "peer-alpha/OWNER_CHECKLIST.md",
    "peer-alpha/FEEDBACK_TEMPLATE.md",
    "peer-alpha/KNOWN_LIMITATIONS.md",
    "peer-alpha/PRIVACY.md"
  ].forEach((relativePath) => assert.ok(read(relativePath).length > 300));
}

testSessionIndicatorContract();
testPrivacySafeSummary();
testAlphaUserSurface();
testRepeatablePackageContract();

console.log("ARK Lens controlled peer alpha contracts passed");
