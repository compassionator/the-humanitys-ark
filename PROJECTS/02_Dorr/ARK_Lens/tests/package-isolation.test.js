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

  return { entryCount: archive.entryCount, hash: sha256Bytes(bytes) };
}

run("tests/tools/build-peer-alpha-package.js");
run("tests/tools/build-linkedin-feed-proof-package.js");

const jobName = `ark-lens-v${packageJson.version}-peer-alpha`;
const feedName = "ark-lens-linkedin-feed-extraction-proof-v0.1";
const jobDir = path.join(root, "dist", jobName);
const feedDir = path.join(root, "dist", feedName);
const jobFiles = list(jobDir);
const feedFiles = list(feedDir);

assert.equal(jobFiles.length, 51);
assert.ok(jobFiles.includes("sources/jobs/job_source_catalogue.js"));
assert.ok(jobFiles.includes("sources/jobs/linkedin_jobs_adapter.js"));
assert.equal(jobFiles.some((file) => /(^|\/)feeds?(\/|[-_.])/i.test(file)), false);
assert.equal(jobFiles.some((file) => /(^|\/)(?:tests?|fixtures?)(\/|$)/i.test(file)), false);

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

const jobZip = path.join(root, "dist", `${jobName}.zip`);
const feedZip = path.join(root, "dist", `${feedName}.zip`);
assert.ok(fs.statSync(jobZip).size > 0);
assert.ok(fs.statSync(feedZip).size > 0);
assert.match(fs.readFileSync(`${jobZip}.sha256.txt`, "utf8"), new RegExp(sha256(jobZip), "i"));
assert.match(fs.readFileSync(`${feedZip}.sha256.txt`, "utf8"), new RegExp(sha256(feedZip), "i"));

const jobArchive = validateZip(jobZip, jobName, jobFiles);
const feedArchive = validateZip(feedZip, feedName, FEED_FILES);
assert.equal(jobArchive.entryCount, 51);
assert.equal(feedArchive.entryCount, 17);

console.log("ARK Lens Job/Feed exact-file package isolation passed (51 Job, 17 Feed entries)");
console.log(`Job ZIP valid (${jobArchive.entryCount} files, SHA-256 ${jobArchive.hash})`);
console.log(`Feed ZIP valid (${feedArchive.entryCount} files, SHA-256 ${feedArchive.hash})`);
