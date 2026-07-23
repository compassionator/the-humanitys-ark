const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createZip } = require("./portable-zip");

const root = path.resolve(__dirname, "..", "..");
const distRoot = path.join(root, "dist");
const SHARED_ENTRIES = Object.freeze([
  ["proofs/linkedin_feed/popup.html", "proofs/linkedin_feed/popup.html"],
  ["proofs/linkedin_feed/popup.css", "proofs/linkedin_feed/popup.css"],
  ["proofs/linkedin_feed/popup.js", "proofs/linkedin_feed/popup.js"],
  ["proofs/linkedin_feed/proof_content_bootstrap.js", "proofs/linkedin_feed/proof_content_bootstrap.js"],
  ["core/lens_item.js", "core/lens_item.js"],
  ["core/extraction_result.js", "core/extraction_result.js"],
  ["sources/source_adapter_registry.js", "sources/source_adapter_registry.js"],
  ["sources/dom_read_utils.js", "sources/dom_read_utils.js"],
  ["sources/adapter_diagnostics.js", "sources/adapter_diagnostics.js"],
  ["sources/feed/feed_source_catalogue.js", "sources/feed/feed_source_catalogue.js"],
  ["sources/feed/linkedin_feed_adapter.js", "sources/feed/linkedin_feed_adapter.js"],
  ["domains/feed/feed_item_mapper.js", "domains/feed/feed_item_mapper.js"],
  ["domains/feed/feed_capture_policy.js", "domains/feed/feed_capture_policy.js"],
  ["orchestration/feed/linkedin_feed_probe.js", "orchestration/feed/linkedin_feed_probe.js"]
]);

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function listFiles(directory) {
  const files = [];
  function visit(current) {
    fs.readdirSync(current, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else files.push(fullPath);
    });
  }
  visit(directory);
  return files.sort();
}

function buildFeedProofPackage({ manifestSource, releaseName }) {
  const releaseDir = path.join(distRoot, releaseName);
  const zipPath = path.join(distRoot, `${releaseName}.zip`);
  const zipHashPath = `${zipPath}.sha256.txt`;
  const entries = Object.freeze([[manifestSource, "manifest.json"], ...SHARED_ENTRIES]);

  function copyExact(sourceRelative, targetRelative) {
    const source = path.join(root, sourceRelative);
    const target = path.join(releaseDir, targetRelative);
    if (!fs.statSync(source).isFile()) {
      throw new Error(`Feed proof entry must be an exact file: ${sourceRelative}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }

  const relativeTarget = path.relative(distRoot, releaseDir);
  if (!relativeTarget || relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
    throw new Error("Unsafe Feed proof release target.");
  }
  fs.mkdirSync(distRoot, { recursive: true });
  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  fs.rmSync(zipHashPath, { force: true });
  fs.mkdirSync(releaseDir, { recursive: true });
  entries.forEach(([source, target]) => copyExact(source, target));

  const buildInfo = {
    schema_version: "1.0.0",
    proof_version: "0.1.0",
    release_name: releaseName,
    generated_at: new Date().toISOString(),
    packaged_file_count: entries.length + 2,
    release_gate: "npm.cmd test"
  };
  fs.writeFileSync(path.join(releaseDir, "BUILD_INFO.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
  const checksummed = listFiles(releaseDir);
  fs.writeFileSync(
    path.join(releaseDir, "SHA256SUMS.txt"),
    `${checksummed.map((file) => `${sha256(file)}  ${path.relative(releaseDir, file).replace(/\\/g, "/")}`).join("\n")}\n`
  );

  const allowed = new Set([...entries.map(([, target]) => target), "BUILD_INFO.json", "SHA256SUMS.txt"]);
  const packaged = listFiles(releaseDir).map((file) => path.relative(releaseDir, file).replace(/\\/g, "/"));
  packaged.forEach((relativePath) => {
    if (!allowed.has(relativePath)) {
      throw new Error(`Feed proof file is outside the exact allow-list: ${relativePath}`);
    }
    if (/(^|\/)(?:jobs?|policies|compatibility|report|lens-packs|schemas)(?:\/|$)/i.test(relativePath) ||
      /content_bundle|job_|linkedin_jobs|seek_jobs|peer-alpha/i.test(relativePath)) {
      throw new Error(`Job domain file is forbidden in the Feed proof: ${relativePath}`);
    }
    if (/(^|\/)(?:tests?|fixtures?)(?:\/|$)/i.test(relativePath)) {
      throw new Error(`Development file is forbidden in the Feed proof: ${relativePath}`);
    }
  });
  if (packaged.length !== allowed.size) {
    throw new Error("Feed proof package is missing an exact allow-list entry.");
  }

  createZip({
    files: listFiles(releaseDir),
    baseDir: releaseDir,
    rootName: releaseName,
    targetPath: zipPath
  });
  const hash = sha256(zipPath);
  fs.writeFileSync(zipHashPath, `${hash}  ${path.basename(zipPath)}\n`);
  console.log(`Built ${path.relative(root, releaseDir)}`);
  console.log(`Built ${path.relative(root, zipPath)}`);
  console.log(`ZIP SHA-256 ${hash}`);

  return Object.freeze({ hash, releaseDir, zipPath });
}

module.exports = Object.freeze({
  SHARED_ENTRIES,
  buildFeedProofPackage
});
