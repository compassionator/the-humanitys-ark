(function initializeArkJobCapturePolicy(root, factory) {
  const extractionResults = typeof module !== "undefined" && module.exports
    ? require("../core/extraction_result.js")
    : root.ARK_EXTRACTION_RESULTS;
  const api = factory(extractionResults);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.ARK_JOB_CAPTURE_POLICY = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkJobCapturePolicy(
  extractionResults
) {
  if (!extractionResults) {
    throw new Error("ARK ExtractionResult runtime must load before Job capture policy.");
  }

  const MINIMUM_CAPABILITIES = Object.freeze([
    "stable_item_identity",
    "primary_text",
    "secondary_text",
    "body_text",
    "source_url"
  ]);

  function canProcess(result) {
    if (!extractionResults.isExtractionResult(result) || !result.item) return false;
    if (result.status !== "complete" && result.status !== "partial") return false;

    return MINIMUM_CAPABILITIES.every((capability) =>
      result.captured_capabilities.includes(capability)
    );
  }

  return {
    MINIMUM_CAPABILITIES,
    canProcess
  };
});
