const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  CENTRAL_DIRECTORY_SIGNATURE,
  END_OF_CENTRAL_DIRECTORY_SIGNATURE,
  LOCAL_FILE_SIGNATURE,
  inspectZip
} = require("./tools/portable-zip");
const { SHARED_ENTRIES } = require("./tools/linkedin-feed-proof-package");
const { SHARED_JOB_ENTRIES } = require("./tools/job-lens-package");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const FEED_FILES = Object.freeze([
  "BUILD_INFO.json",
  "SHA256SUMS.txt",
  "core/extraction_result.js",
  "core/lens_item.js",
  "domains/feed/feed_capture_policy.js",
  "domains/feed/feed_item_mapper.js",
  "manifest.json",
  "orchestration/feed/linkedin_feed_probe.js",
  "proofs/linkedin_feed/popup.css",
  "proofs/linkedin_feed/popup.html",
  "proofs/linkedin_feed/popup.js",
  "proofs/linkedin_feed/proof_content_bootstrap.js",
  "sources/adapter_diagnostics.js",
  "sources/dom_read_utils.js",
  "sources/feed/feed_source_catalogue.js",
  "sources/feed/linkedin_feed_adapter.js",
  "sources/source_adapter_registry.js"
]);
const SHARED_FEED_FILES = Object.freeze(SHARED_ENTRIES.map(([, target]) => target).sort());
const JOB_FILES = Object.freeze([
  "BUILD_INFO.json",
  "SHA256SUMS.txt",
  "alpha/guide.css",
  "alpha/guide.html",
  "alpha/guide.js",
  "background.js",
  "compatibility/job_extraction_compat.js",
  "content_bundle.js",
  "contracts/job_contracts.js",
  "core/deterministic_matcher.js",
  "core/extraction_result.js",
  "core/lens_item.js",
  "icons/ark-lens-128.png",
  "icons/ark-lens-16.png",
  "icons/ark-lens-32.png",
  "icons/ark-lens-48.png",
  "icons/ark-lens-active-128.png",
  "icons/ark-lens-active-16.png",
  "icons/ark-lens-active-32.png",
  "icons/ark-lens-active-48.png",
  "lens-editor/editor.css",
  "lens-editor/editor.html",
  "lens-editor/editor.js",
  "lens-packs/README.md",
  "lens-packs/bob_job_search.json",
  "lens-packs/bundled_lens_pack.js",
  "lens-packs/lens_pack_runtime.js",
  "manifest.json",
  "peer-alpha/FEEDBACK_TEMPLATE.md",
  "peer-alpha/KNOWN_LIMITATIONS.md",
  "peer-alpha/OWNER_CHECKLIST.md",
  "peer-alpha/PRIVACY.md",
  "peer-alpha/TESTER_GUIDE.md",
  "platform/browser_capabilities.js",
  "policies/job_capture_policy.js",
  "policies/job_policy_runtime.js",
  "popup/popup.css",
  "popup/popup.html",
  "popup/popup.js",
  "report/report.css",
  "report/report.html",
  "report/report.js",
  "runtime/job_runtime_order.js",
  "schemas/adapter-profile.schema.json",
  "schemas/lens-pack.schema.json",
  "schemas/relevance-feedback.schema.json",
  "sources/adapter_diagnostics.js",
  "sources/dom_read_utils.js",
  "sources/jobs/job_adapter_result.js",
  "sources/jobs/job_extraction_builder.js",
  "sources/jobs/job_source_catalogue.js",
  "sources/jobs/linkedin_jobs_adapter.js",
  "sources/jobs/seek_jobs_adapter.js",
  "sources/source_adapter_registry.js"
]);
const SHARED_JOB_FILES = Object.freeze(
  JOB_FILES.filter((file) => !["BUILD_INFO.json", "SHA256SUMS.txt", "manifest.json"].includes(file)).sort()
);

function run(relativePath) {
  const result = spawnSync(process.execPath, [path.join(root, relativePath)], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function list(directory) {
  const files = [];
  function visit(current) {
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else files.push(path.relative(directory, full).replace(/\\/g, "/"));
    });
  }
  visit(directory);
  return files.sort();
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function parseChecksums(bytes) {
  return new Map(bytes.toString("utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const match = /^([a-f0-9]{64})\s{2}(.+)$/i.exec(line);
    assert.ok(match, `Invalid checksum line: ${line}`);
    return [match[2], match[1].toLowerCase()];
  }));
}

function validateZip(zipPath, releaseName, expectedFiles) {
  const bytes = fs.readFileSync(zipPath);
  assert.equal(bytes.readUInt32LE(0), LOCAL_FILE_SIGNATURE, "ZIP local-file signature");

  const centralSignature = Buffer.alloc(4);
  centralSignature.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE);
  const endSignature = Buffer.alloc(4);
  endSignature.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE);
  assert.ok(bytes.indexOf(centralSignature) > 0, "ZIP central-directory record");
  assert.ok(bytes.lastIndexOf(endSignature) > 0, "ZIP end-of-central-directory record");

  const archive = inspectZip(zipPath);
  const prefix = `${releaseName}/`;
  const topLevels = new Set(archive.entries.map((entry) => entry.name.split("/")[0]));
  assert.deepEqual([...topLevels], [releaseName], "ZIP top-level release folder");

  const archivedFiles = archive.entries.map((entry) => {
    assert.ok(entry.name.startsWith(prefix), `ZIP entry outside ${releaseName}: ${entry.name}`);
    return entry.name.slice(prefix.length);
  }).sort();
  assert.deepEqual(archivedFiles, [...expectedFiles].sort(), "ZIP exact-file allow-list");

  const entriesByRelativePath = new Map(archive.entries.map((entry) => [
    entry.name.slice(prefix.length),
    entry.data
  ]));
  const checksums = parseChecksums(entriesByRelativePath.get("SHA256SUMS.txt"));
  checksums.forEach((expectedHash, relativePath) => {
    const archivedBytes = entriesByRelativePath.get(relativePath);
    assert.ok(archivedBytes, `Checksum target missing from ZIP: ${relativePath}`);
    assert.equal(sha256Bytes(archivedBytes), expectedHash, `ZIP checksum mismatch: ${relativePath}`);
  });

  const sidecar = fs.readFileSync(`${zipPath}.sha256.txt`, "utf8").trim();
  const sidecarMatch = /^([a-f0-9]{64})\s{2}(.+)$/i.exec(sidecar);
  assert.ok(sidecarMatch, "ZIP SHA-256 sidecar format");
  assert.equal(sidecarMatch[2], path.basename(zipPath), "ZIP SHA-256 sidecar filename");
  assert.equal(sidecarMatch[1].toLowerCase(), sha256Bytes(bytes), "ZIP SHA-256 sidecar bytes");

  return { entriesByRelativePath, entryCount: archive.entryCount, hash: sha256Bytes(bytes) };
}

run("tests/tools/build-peer-alpha-package.js");
run("tests/tools/build-job-firefox-package.js");
run("tests/tools/build-job-safari-package.js");
run("tests/tools/build-linkedin-feed-proof-package.js");
run("tests/tools/build-linkedin-feed-proof-firefox-package.js");
run("tests/tools/build-linkedin-feed-proof-safari-package.js");

const jobName = `ark-lens-v${packageJson.version}-peer-alpha`;
const firefoxJobName = `ark-lens-job-search-firefox-v${packageJson.version}`;
const safariJobName = `ark-lens-job-search-safari-v${packageJson.version}`;
const feedName = "ark-lens-linkedin-feed-extraction-proof-v0.1";
const firefoxFeedName = "ark-lens-linkedin-feed-extraction-proof-firefox-v0.1";
const safariFeedName = "ark-lens-linkedin-feed-extraction-proof-safari-v0.1";
const jobDir = path.join(root, "dist", jobName);
const firefoxJobDir = path.join(root, "dist", firefoxJobName);
const safariJobDir = path.join(root, "dist", safariJobName);
const feedDir = path.join(root, "dist", feedName);
const firefoxFeedDir = path.join(root, "dist", firefoxFeedName);
const safariFeedDir = path.join(root, "dist", safariFeedName);
const jobFiles = list(jobDir);
const firefoxJobFiles = list(firefoxJobDir);
const safariJobFiles = list(safariJobDir);
const feedFiles = list(feedDir);
const firefoxFeedFiles = list(firefoxFeedDir);
const safariFeedFiles = list(safariFeedDir);

assert.equal(jobFiles.length, 54);
assert.deepEqual(jobFiles, [...JOB_FILES].sort(), "Chrome Job exact-file allow-list");
assert.ok(jobFiles.includes("platform/browser_capabilities.js"));
assert.ok(jobFiles.includes("contracts/job_contracts.js"));
assert.ok(jobFiles.includes("runtime/job_runtime_order.js"));
assert.ok(jobFiles.includes("sources/jobs/job_source_catalogue.js"));
assert.ok(jobFiles.includes("sources/jobs/linkedin_jobs_adapter.js"));
assert.equal(jobFiles.some((file) => /(^|\/)feeds?(\/|[-_.])/i.test(file)), false);
assert.equal(jobFiles.some((file) => /(^|\/)(?:tests?|fixtures?)(\/|$)/i.test(file)), false);

for (const [browserName, files] of [["Firefox", firefoxJobFiles], ["Safari", safariJobFiles]]) {
  assert.equal(files.length, 54, `${browserName} Job file count`);
  assert.deepEqual(files, [...JOB_FILES].sort(), `${browserName} Job exact-file allow-list`);
  assert.equal(files.some((file) => /(^|\/)(?:feed|feeds)(?:\/|[-_.])/i.test(file)), false);
  assert.equal(files.some((file) => /(^|\/)(?:tests?|fixtures?)(\/|$)/i.test(file)), false);
  assert.equal(files.some((file) => /manifests\/|manifest\.job\./i.test(file)), false);
}

assert.deepEqual(
  [...SHARED_JOB_ENTRIES].sort(),
  [...SHARED_JOB_FILES].sort(),
  "Job package test oracle must cover the canonical shared source allow-list"
);
SHARED_JOB_FILES.forEach((file) => {
  const chromeBytes = fs.readFileSync(path.join(jobDir, file));
  assert.deepEqual(fs.readFileSync(path.join(firefoxJobDir, file)), chromeBytes, `Firefox shared Job entry drift: ${file}`);
  assert.deepEqual(fs.readFileSync(path.join(safariJobDir, file)), chromeBytes, `Safari shared Job entry drift: ${file}`);
});

assert.equal(feedFiles.length, 17);
[
  "manifest.json",
  "sources/source_adapter_registry.js",
  "sources/feed/feed_source_catalogue.js",
  "sources/feed/linkedin_feed_adapter.js",
  "domains/feed/feed_item_mapper.js",
  "domains/feed/feed_capture_policy.js",
  "orchestration/feed/linkedin_feed_probe.js"
].forEach((file) => assert.ok(feedFiles.includes(file), file));
assert.equal(feedFiles.some((file) => /(^|\/)(?:tests?|fixtures?)(\/|$)/i.test(file)), false);
assert.equal(feedFiles.some((file) => /sources\/jobs|policies\/job|compatibility\/job|content_bundle|report\/|lens-packs\//i.test(file)), false);
assert.equal(feedFiles.some((file) => /firefox|gecko/i.test(file)), false);
assert.deepEqual(feedFiles, [...FEED_FILES].sort());

assert.equal(firefoxFeedFiles.length, 17);
assert.deepEqual(firefoxFeedFiles, [...FEED_FILES].sort());
assert.equal(firefoxFeedFiles.some((file) => /(^|\/)(?:tests?|fixtures?)(\/|$)/i.test(file)), false);
assert.equal(
  firefoxFeedFiles.some((file) => /sources\/jobs|policies\/job|compatibility\/job|content_bundle|report\/|lens-packs\//i.test(file)),
  false
);
assert.equal(firefoxFeedFiles.some((file) => /manifests\/|manifest\.firefox|manifest\.chrome/i.test(file)), false);

assert.equal(safariFeedFiles.length, 17);
assert.deepEqual(safariFeedFiles, [...FEED_FILES].sort());
assert.equal(safariFeedFiles.some((file) => /(^|\/)(?:tests?|fixtures?)(\/|$)/i.test(file)), false);
assert.equal(
  safariFeedFiles.some((file) => /sources\/jobs|policies\/job|compatibility\/job|content_bundle|report\/|lens-packs\//i.test(file)),
  false
);
assert.equal(safariFeedFiles.some((file) => /manifests\/|manifest\.(?:chrome|firefox|safari)/i.test(file)), false);

const chromeJobSourceManifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const firefoxJobSourceManifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifests", "manifest.job.firefox.json"), "utf8")
);
const safariJobSourceManifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifests", "manifest.job.safari.json"), "utf8")
);
const chromeJobStagedManifest = JSON.parse(fs.readFileSync(path.join(jobDir, "manifest.json"), "utf8"));
const firefoxJobStagedManifest = JSON.parse(fs.readFileSync(path.join(firefoxJobDir, "manifest.json"), "utf8"));
const safariJobStagedManifest = JSON.parse(fs.readFileSync(path.join(safariJobDir, "manifest.json"), "utf8"));
const expectedJobPermissions = ["activeTab", "scripting", "storage"];
const expectedJobHosts = [
  "https://www.linkedin.com/*",
  "https://www.seek.com.au/*",
  "https://au.seek.com/*"
];

assert.deepEqual(chromeJobStagedManifest, chromeJobSourceManifest, "Chrome Job package must select the root manifest");
assert.equal("browser_specific_settings" in chromeJobStagedManifest, false, "Chrome Job package forbids Gecko metadata");
assert.deepEqual(firefoxJobStagedManifest, firefoxJobSourceManifest, "Firefox Job package must select its manifest");
assert.deepEqual(safariJobStagedManifest, safariJobSourceManifest, "Safari Job package must select its manifest");

for (const [browserName, manifest] of [
  ["Chrome", chromeJobStagedManifest],
  ["Firefox", firefoxJobStagedManifest],
  ["Safari", safariJobStagedManifest]
]) {
  assert.equal(manifest.manifest_version, 3, `${browserName} Job manifest version`);
  assert.equal(manifest.name, chromeJobStagedManifest.name, `${browserName} Job product name`);
  assert.equal(manifest.version, chromeJobStagedManifest.version, `${browserName} Job product version`);
  assert.equal(manifest.description, chromeJobStagedManifest.description, `${browserName} Job product description`);
  assert.deepEqual(manifest.icons, chromeJobStagedManifest.icons, `${browserName} Job icons`);
  assert.deepEqual(manifest.action, chromeJobStagedManifest.action, `${browserName} Job action and popup`);
  assert.deepEqual(manifest.permissions, expectedJobPermissions, `${browserName} Job permissions`);
  assert.deepEqual(manifest.host_permissions, expectedJobHosts, `${browserName} Job supported hosts`);
  [
    "content_scripts",
    "optional_host_permissions",
    "optional_permissions",
    "downloads",
    "notifications",
    "nativeMessaging",
    "webRequest"
  ].forEach((key) => assert.equal(key in manifest, false, `${browserName} Job manifest forbids ${key}`));
}

assert.deepEqual(firefoxJobStagedManifest.background, {
  scripts: [
    "platform/browser_capabilities.js",
    "contracts/job_contracts.js",
    "runtime/job_runtime_order.js",
    "sources/source_adapter_registry.js",
    "sources/jobs/job_source_catalogue.js",
    "background.js"
  ]
});
assert.deepEqual(firefoxJobStagedManifest.browser_specific_settings, {
  gecko: {
    id: "@ark-lens-job-search",
    strict_min_version: "140.0",
    data_collection_permissions: { required: ["none"] }
  },
  gecko_android: { strict_min_version: "142.0" }
});
assert.equal("service_worker" in firefoxJobStagedManifest.background, false);
assert.deepEqual(safariJobStagedManifest.background, { service_worker: "background.js" });
assert.equal("browser_specific_settings" in safariJobStagedManifest, false, "Safari Job package forbids Gecko metadata");

const chromeSourceManifest = JSON.parse(fs.readFileSync(path.join(root, "proofs", "linkedin_feed", "manifest.json"), "utf8"));
const firefoxSourceManifest = JSON.parse(
  fs.readFileSync(path.join(root, "proofs", "linkedin_feed", "manifests", "manifest.firefox.json"), "utf8")
);
const safariSourceManifest = JSON.parse(
  fs.readFileSync(path.join(root, "proofs", "linkedin_feed", "manifests", "manifest.safari.json"), "utf8")
);
const chromeStagedManifest = JSON.parse(fs.readFileSync(path.join(feedDir, "manifest.json"), "utf8"));
const firefoxStagedManifest = JSON.parse(fs.readFileSync(path.join(firefoxFeedDir, "manifest.json"), "utf8"));
const safariStagedManifest = JSON.parse(fs.readFileSync(path.join(safariFeedDir, "manifest.json"), "utf8"));
assert.deepEqual(chromeStagedManifest, chromeSourceManifest, "Chrome package must stage only the Chrome manifest");
assert.equal("browser_specific_settings" in chromeStagedManifest, false, "Chrome package must contain no Firefox metadata");
assert.deepEqual(firefoxStagedManifest, firefoxSourceManifest, "Firefox package must stage only the Firefox manifest");
assert.notDeepEqual(firefoxStagedManifest, chromeSourceManifest, "Firefox package must not stage the Chrome manifest");
assert.equal(firefoxStagedManifest.manifest_version, 3);
assert.deepEqual(firefoxStagedManifest.permissions, ["activeTab", "scripting"]);
[
  "background",
  "host_permissions",
  "content_scripts",
  "cookies",
  "downloads",
  "notifications",
  "webRequest"
].forEach((key) => assert.equal(key in firefoxStagedManifest, false, `Firefox manifest forbids ${key}`));
assert.deepEqual(firefoxStagedManifest.browser_specific_settings, {
  gecko: {
    id: "@ark-linkedin-feed-proof",
    strict_min_version: "140.0",
    data_collection_permissions: {
      required: ["none"]
    }
  },
  gecko_android: {
    strict_min_version: "142.0"
  }
});

assert.deepEqual(safariStagedManifest, safariSourceManifest, "Safari package must stage only the Safari manifest");
assert.notDeepEqual(safariStagedManifest, chromeSourceManifest, "Safari package must not stage the Chrome manifest");
assert.notDeepEqual(safariStagedManifest, firefoxSourceManifest, "Safari package must not stage the Firefox manifest");
assert.equal(safariStagedManifest.manifest_version, 3);
assert.deepEqual(safariStagedManifest.permissions, ["activeTab", "scripting"]);
[
  "background",
  "host_permissions",
  "optional_host_permissions",
  "optional_permissions",
  "content_scripts",
  "browser_specific_settings",
  "externally_connectable",
  "cookies",
  "downloads",
  "notifications",
  "storage",
  "webRequest"
].forEach((key) => assert.equal(key in safariStagedManifest, false, `Safari manifest forbids ${key}`));

assert.deepEqual(
  SHARED_FEED_FILES,
  FEED_FILES.filter((file) => !["BUILD_INFO.json", "SHA256SUMS.txt", "manifest.json"].includes(file)).sort(),
  "Feed package test must cover the canonical shared runtime allow-list"
);
SHARED_FEED_FILES.forEach((file) => {
  const chromeBytes = fs.readFileSync(path.join(feedDir, file));
  assert.deepEqual(fs.readFileSync(path.join(firefoxFeedDir, file)), chromeBytes, `Firefox shared entry drift: ${file}`);
  assert.deepEqual(fs.readFileSync(path.join(safariFeedDir, file)), chromeBytes, `Safari shared entry drift: ${file}`);
});

const jobZip = path.join(root, "dist", `${jobName}.zip`);
const firefoxJobZip = path.join(root, "dist", `${firefoxJobName}.zip`);
const safariJobZip = path.join(root, "dist", `${safariJobName}.zip`);
const feedZip = path.join(root, "dist", `${feedName}.zip`);
const firefoxFeedZip = path.join(root, "dist", `${firefoxFeedName}.zip`);
const safariFeedZip = path.join(root, "dist", `${safariFeedName}.zip`);
assert.ok(fs.statSync(jobZip).size > 0);
assert.ok(fs.statSync(firefoxJobZip).size > 0);
assert.ok(fs.statSync(safariJobZip).size > 0);
assert.ok(fs.statSync(feedZip).size > 0);
assert.ok(fs.statSync(firefoxFeedZip).size > 0);
assert.ok(fs.statSync(safariFeedZip).size > 0);
assert.match(fs.readFileSync(`${jobZip}.sha256.txt`, "utf8"), new RegExp(sha256(jobZip), "i"));
assert.match(fs.readFileSync(`${firefoxJobZip}.sha256.txt`, "utf8"), new RegExp(sha256(firefoxJobZip), "i"));
assert.match(fs.readFileSync(`${safariJobZip}.sha256.txt`, "utf8"), new RegExp(sha256(safariJobZip), "i"));
assert.match(fs.readFileSync(`${feedZip}.sha256.txt`, "utf8"), new RegExp(sha256(feedZip), "i"));
assert.match(fs.readFileSync(`${firefoxFeedZip}.sha256.txt`, "utf8"), new RegExp(sha256(firefoxFeedZip), "i"));
assert.match(fs.readFileSync(`${safariFeedZip}.sha256.txt`, "utf8"), new RegExp(sha256(safariFeedZip), "i"));

const jobArchive = validateZip(jobZip, jobName, jobFiles);
const firefoxJobArchive = validateZip(firefoxJobZip, firefoxJobName, firefoxJobFiles);
const safariJobArchive = validateZip(safariJobZip, safariJobName, safariJobFiles);
const feedArchive = validateZip(feedZip, feedName, FEED_FILES);
const firefoxFeedArchive = validateZip(firefoxFeedZip, firefoxFeedName, FEED_FILES);
const safariFeedArchive = validateZip(safariFeedZip, safariFeedName, FEED_FILES);
assert.equal(jobArchive.entryCount, 54);
assert.equal(firefoxJobArchive.entryCount, 54);
assert.equal(safariJobArchive.entryCount, 54);
assert.equal(feedArchive.entryCount, 17);
assert.equal(firefoxFeedArchive.entryCount, 17);
assert.equal(safariFeedArchive.entryCount, 17);
assert.deepEqual(
  JSON.parse(firefoxJobArchive.entriesByRelativePath.get("manifest.json").toString("utf8")),
  firefoxJobSourceManifest,
  "Firefox Job ZIP manifest"
);
assert.deepEqual(
  JSON.parse(safariJobArchive.entriesByRelativePath.get("manifest.json").toString("utf8")),
  safariJobSourceManifest,
  "Safari Job ZIP manifest"
);
assert.deepEqual(
  JSON.parse(firefoxFeedArchive.entriesByRelativePath.get("manifest.json").toString("utf8")),
  firefoxSourceManifest,
  "Firefox ZIP manifest"
);
assert.equal(
  "browser_specific_settings" in JSON.parse(feedArchive.entriesByRelativePath.get("manifest.json").toString("utf8")),
  false,
  "Chrome ZIP must contain no Firefox manifest metadata"
);
assert.deepEqual(
  JSON.parse(safariFeedArchive.entriesByRelativePath.get("manifest.json").toString("utf8")),
  safariSourceManifest,
  "Safari ZIP manifest"
);

console.log("ARK Lens Job/Feed exact-file package isolation passed (54 Chrome Job, 54 Firefox Job, 54 Safari Job, and 17 files per Feed package)");
console.log(`Chrome Job ZIP valid (${jobArchive.entryCount} files, SHA-256 ${jobArchive.hash})`);
console.log(`Firefox Job ZIP valid (${firefoxJobArchive.entryCount} files, SHA-256 ${firefoxJobArchive.hash})`);
console.log(`Safari Job ZIP valid (${safariJobArchive.entryCount} files, SHA-256 ${safariJobArchive.hash})`);
console.log(`Chrome Feed ZIP valid (${feedArchive.entryCount} files, SHA-256 ${feedArchive.hash})`);
console.log(`Firefox Feed ZIP valid (${firefoxFeedArchive.entryCount} files, SHA-256 ${firefoxFeedArchive.hash})`);
console.log(`Safari Feed ZIP valid (${safariFeedArchive.entryCount} files, SHA-256 ${safariFeedArchive.hash})`);
