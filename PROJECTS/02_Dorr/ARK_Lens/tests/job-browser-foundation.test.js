const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const productionFiles = [
  "background.js",
  "content_bundle.js",
  "popup/popup.js",
  "report/report.js",
  "lens-editor/editor.js",
  "alpha/guide.js"
];
const sources = Object.fromEntries(productionFiles.map((file) => [file, read(file)]));
const manifest = JSON.parse(read("manifest.json"));
const jobContracts = require("../contracts/job_contracts.js");
const jobRuntimeOrder = require("../runtime/job_runtime_order.js");

const EXPECTED_RUNTIME_ORDER = Object.freeze([
  "lens-packs/bundled_lens_pack.js",
  "lens-packs/lens_pack_runtime.js",
  "core/lens_item.js",
  "core/deterministic_matcher.js",
  "core/extraction_result.js",
  "sources/source_adapter_registry.js",
  "sources/jobs/job_source_catalogue.js",
  "sources/dom_read_utils.js",
  "sources/adapter_diagnostics.js",
  "sources/jobs/job_extraction_builder.js",
  "sources/jobs/job_adapter_result.js",
  "sources/jobs/linkedin_jobs_adapter.js",
  "sources/jobs/seek_jobs_adapter.js",
  "compatibility/job_extraction_compat.js",
  "policies/job_capture_policy.js",
  "policies/job_policy_runtime.js",
  "content_bundle.js"
]);
const EXPECTED_STORAGE_KEYS = Object.freeze([
  "ark_lens_active_lens_pack_id",
  "ark_lens_adapter_profile_last_known_good",
  "ark_lens_adapter_profile_overrides",
  "ark_lens_adapter_profile_rollbacks",
  "ark_lens_packs",
  "ark_lens_records",
  "ark_lens_session"
]);
const EXPECTED_MESSAGES = Object.freeze([
  "ARK_ADAPTER_DIAGNOSTICS",
  "ARK_ADAPTER_DOCTOR_EXPORT_DEBUG",
  "ARK_ADAPTER_DOCTOR_EXPORT_PROFILE",
  "ARK_ADAPTER_DOCTOR_HEALTH_CHECK",
  "ARK_ADAPTER_DOCTOR_STATUS",
  "ARK_ADAPTER_DOCTOR_TEST_EXTRACTION",
  "ARK_ADAPTER_DOCTOR_TEST_REPAIR",
  "ARK_ADAPTER_DOCTOR_VALIDATE_REPAIR",
  "ARK_CAPTURE_NOW",
  "ARK_START_LISTENING",
  "ARK_STOP_LISTENING"
]);
const EXPECTED_FOUNDATION_RUNTIME_ORDER = Object.freeze([
  "platform/browser_capabilities.js",
  "contracts/job_contracts.js",
  ...EXPECTED_RUNTIME_ORDER
]);

function uniqueLiterals(pattern) {
  return [...new Set(
    Object.values(sources).flatMap((source) => [...source.matchAll(pattern)].map((match) => match[1]))
  )].sort();
}

function extractInjectedFiles(source) {
  const match = source.match(/files:\s*\[([\s\S]*?)\]\s*\n\s*\}/);
  assert.ok(match, "Expected a Job executeScript file list");
  return [...match[1].matchAll(/"([^"]+\.js)"/g)].map((entry) => entry[1]);
}

assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
assert.deepEqual(manifest.host_permissions, [
  "https://www.linkedin.com/*",
  "https://www.seek.com.au/*",
  "https://au.seek.com/*"
]);
assert.equal("content_scripts" in manifest, false);

assert.deepEqual(jobRuntimeOrder.CONTENT_SCRIPT_FILES, EXPECTED_FOUNDATION_RUNTIME_ORDER);
assert.deepEqual(Object.values(jobContracts.STORAGE_KEYS).sort(), EXPECTED_STORAGE_KEYS);
assert.deepEqual(Object.values(jobContracts.MESSAGES).sort(), EXPECTED_MESSAGES);
assert.deepEqual(jobContracts.VERSIONS, {
  ADAPTER: "v2026.06.003",
  CONTENT_BUNDLE: "v2026.06.019-fixed-fit-columns",
  RECORD_SCHEMA: "v2026.06.001"
});
assert.deepEqual(jobContracts.SESSION, {
  ID_PREFIX: "session_",
  STOPPED_REASON_BROWSER_RESTART: "browser_restart"
});

assert.deepEqual(extractInjectedFiles(sources["background.js"]), EXPECTED_RUNTIME_ORDER);
assert.deepEqual(extractInjectedFiles(sources["popup/popup.js"]), EXPECTED_RUNTIME_ORDER);
assert.deepEqual(uniqueLiterals(/"(ark_lens_[^"]+)"/g), EXPECTED_STORAGE_KEYS);
assert.deepEqual(uniqueLiterals(/"(ARK_[A-Z0-9_]+)"/g), EXPECTED_MESSAGES);
assert.match(sources["background.js"], /stopped_reason:\s*"browser_restart"/);
assert.match(sources["popup/popup.js"], /session_id:\s*`session_\$\{Date\.now\(\)\}`/);

const rawApiPattern = /\b(?:chrome|browser)(?:\?\.|\.)(?:storage|tabs|scripting|runtime|action|windows)\b/g;
const rawApiCounts = Object.fromEntries(
  Object.entries(sources).map(([file, source]) => [file, [...source.matchAll(rawApiPattern)].length])
);
assert.deepEqual(rawApiCounts, {
  "background.js": 16,
  "content_bundle.js": 13,
  "popup/popup.js": 25,
  "report/report.js": 5,
  "lens-editor/editor.js": 4,
  "alpha/guide.js": 11
});

console.log("ARK Lens JOB_XB1 baseline browser, runtime, storage, and message contracts characterized");
