const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

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

const jobZip = path.join(root, "dist", `${jobName}.zip`);
const feedZip = path.join(root, "dist", `${feedName}.zip`);
assert.ok(fs.statSync(jobZip).size > 0);
assert.ok(fs.statSync(feedZip).size > 0);
assert.match(fs.readFileSync(`${jobZip}.sha256.txt`, "utf8"), new RegExp(sha256(jobZip), "i"));
assert.match(fs.readFileSync(`${feedZip}.sha256.txt`, "utf8"), new RegExp(sha256(feedZip), "i"));

console.log("ARK Lens Job/Feed exact-file package isolation passed (51 Job, 17 Feed entries)");
