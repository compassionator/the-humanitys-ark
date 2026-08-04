const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createZip } = require("./portable-zip");

const root = path.resolve(__dirname, "..", "..");
const distRoot = path.join(root, "dist");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const SHARED_JOB_ENTRIES = Object.freeze([
  "core/lens_item.js",
  "core/deterministic_matcher.js",
  "core/extraction_result.js",
  "sources/source_adapter_registry.js",
  "sources/dom_read_utils.js",
  "sources/adapter_diagnostics.js",
  "lens-packs/lens_pack_runtime.js",
  "contracts/job_contracts.js",
  "runtime/job_runtime_order.js",
  "content_bundle.js",
  "sources/jobs/job_source_catalogue.js",
  "sources/jobs/job_extraction_builder.js",
  "sources/jobs/job_adapter_result.js",
  "sources/jobs/linkedin_jobs_adapter.js",
  "sources/jobs/seek_jobs_adapter.js",
  "compatibility/job_extraction_compat.js",
  "policies/job_capture_policy.js",
  "policies/job_policy_runtime.js",
  "lens-packs/bob_job_search.json",
  "lens-packs/bundled_lens_pack.js",
  "lens-packs/README.md",
  "background.js",
  "platform/browser_capabilities.js",
  "alpha/guide.css",
  "alpha/guide.html",
  "alpha/guide.js",
  "lens-editor/editor.css",
  "lens-editor/editor.html",
  "lens-editor/editor.js",
  "popup/popup.css",
  "popup/popup.html",
  "popup/popup.js",
  "report/report.css",
  "report/report.html",
  "report/report.js",
  "schemas/adapter-profile.schema.json",
  "schemas/lens-pack.schema.json",
  "schemas/relevance-feedback.schema.json",
  "icons/ark-lens-16.png",
  "icons/ark-lens-32.png",
  "icons/ark-lens-48.png",
  "icons/ark-lens-128.png",
  "icons/ark-lens-active-16.png",
  "icons/ark-lens-active-32.png",
  "icons/ark-lens-active-48.png",
  "icons/ark-lens-active-128.png",
  "peer-alpha/FEEDBACK_TEMPLATE.md",
  "peer-alpha/KNOWN_LIMITATIONS.md",
  "peer-alpha/OWNER_CHECKLIST.md",
  "peer-alpha/PRIVACY.md",
  "peer-alpha/TESTER_GUIDE.md"
]);

const FORBIDDEN_PACKAGE_PATHS = Object.freeze([
  "tests",
  "fixtures",
  ".git",
  ".agents",
  ".codex",
  "dist"
]);

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function listFiles(directory) {
  const files = [];
  function visit(current) {
    fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach((entry) => {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) visit(fullPath);
        else files.push(fullPath);
      });
  }
  visit(directory);
  return files;
}

function buildJobLensPackage({ manifestSource, releaseName, releaseChannel }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestSource), "utf8"));
  const releaseDir = path.join(distRoot, releaseName);
  const zipPath = path.join(distRoot, `${releaseName}.zip`);
  const zipHashPath = `${zipPath}.sha256.txt`;
  const entries = Object.freeze([[manifestSource, "manifest.json"], ...SHARED_JOB_ENTRIES.map((entry) => [entry, entry])]);

  const relativeTarget = path.relative(distRoot, releaseDir);
  if (!relativeTarget || relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
    throw new Error("Unsafe Job Lens release target.");
  }
  if (packageJson.version !== manifest.version) {
    throw new Error(`Package version ${packageJson.version} does not match manifest ${manifest.version}.`);
  }
  if (!/^2026\.6\.\d+$/.test(packageJson.version)) {
    throw new Error(`Unexpected release version ${packageJson.version}.`);
  }

  fs.mkdirSync(distRoot, { recursive: true });
  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  fs.rmSync(zipHashPath, { force: true });
  fs.mkdirSync(releaseDir, { recursive: true });

  entries.forEach(([sourceRelative, targetRelative]) => {
    const source = path.join(root, sourceRelative);
    const target = path.join(releaseDir, targetRelative);
    if (!fs.statSync(source).isFile()) {
      throw new Error(`Job Lens package entry must be an exact file: ${sourceRelative}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  });

  const buildInfo = {
    schema_version: "1.0.0",
    release_name: releaseName,
    release_channel: releaseChannel,
    extension_version: manifest.version,
    generated_at: new Date().toISOString(),
    packaged_file_count: entries.length + 2,
    release_gate: "npm.cmd test"
  };
  fs.writeFileSync(path.join(releaseDir, "BUILD_INFO.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);

  const checksumFiles = listFiles(releaseDir);
  const checksumLines = checksumFiles.map((filePath) => {
    const relative = path.relative(releaseDir, filePath).replace(/\\/g, "/");
    return `${sha256(filePath)}  ${relative}`;
  });
  fs.writeFileSync(path.join(releaseDir, "SHA256SUMS.txt"), `${checksumLines.join("\n")}\n`);

  const allowed = new Set([...entries.map(([, target]) => target), "BUILD_INFO.json", "SHA256SUMS.txt"]);
  const releaseFiles = listFiles(releaseDir);
  const packaged = releaseFiles.map((filePath) => path.relative(releaseDir, filePath).replace(/\\/g, "/"));
  packaged.forEach((relativePath) => {
    if (!allowed.has(relativePath)) {
      throw new Error(`File is outside the Job Lens allow-list: ${relativePath}`);
    }
    if (/(^|\/)(?:feed|feeds)(?:\/|[-_.])/i.test(relativePath)) {
      throw new Error(`Feed implementation is forbidden in the Job Lens package: ${relativePath}`);
    }
    if (/(^|\/)(?:tests?|fixtures?)(?:\/|$)/i.test(relativePath)) {
      throw new Error(`Development file is forbidden in the Job Lens package: ${relativePath}`);
    }
  });
  FORBIDDEN_PACKAGE_PATHS.forEach((forbidden) => {
    if (packaged.some((file) => file === forbidden || file.startsWith(`${forbidden}/`))) {
      throw new Error(`Forbidden Job Lens package content detected: ${forbidden}`);
    }
  });
  if (packaged.length !== allowed.size) {
    throw new Error("Job Lens package is missing an exact allow-list entry.");
  }

  createZip({ files: releaseFiles, baseDir: releaseDir, rootName: releaseName, targetPath: zipPath });
  const hash = sha256(zipPath);
  fs.writeFileSync(zipHashPath, `${hash}  ${path.basename(zipPath)}\n`);

  console.log(`Built ${path.relative(root, releaseDir)}`);
  console.log(`Built ${path.relative(root, zipPath)}`);
  console.log(`ZIP SHA-256 ${hash}`);

  return Object.freeze({ hash, releaseDir, zipPath });
}

module.exports = Object.freeze({
  SHARED_JOB_ENTRIES,
  buildJobLensPackage
});
