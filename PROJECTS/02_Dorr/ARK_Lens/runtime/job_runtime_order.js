(function initArkJobRuntimeOrder(root, factory) {
  const api = factory();

  if (root) root.ARK_JOB_RUNTIME_ORDER = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkJobRuntimeOrder() {
  const CONTENT_SCRIPT_FILES = Object.freeze([
    "platform/browser_capabilities.js",
    "contracts/job_contracts.js",
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

  return Object.freeze({ CONTENT_SCRIPT_FILES });
});
