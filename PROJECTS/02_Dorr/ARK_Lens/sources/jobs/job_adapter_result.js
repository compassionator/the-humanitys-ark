(function initializeArkJobAdapterResult(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.ARK_JOB_ADAPTER_RESULT = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkJobAdapterResult() {
  function create(adapterId, extracted, context = {}) {
    const {
      extractionResults,
      jobCompatibility,
      sourceAdaptersRuntime
    } = context;
    const definition = sourceAdaptersRuntime.getAdapterDefinition(adapterId);
    const capabilities = definition?.capabilities || { required: [], optional: [] };

    if (!extracted) {
      return extractionResults.createExtractionResult({
        status: "unsupported",
        required_capabilities: capabilities.required,
        optional_capabilities: capabilities.optional,
        warnings: [{
          code: "item_not_ready_or_unsupported",
          message: "No supported current item was ready for extraction."
        }]
      });
    }

    const item = jobCompatibility.toLensItem(extracted);
    const capturedCapabilities = ["item_discovery"];
    if (item.item_id) capturedCapabilities.push("stable_item_identity");
    if (item.primary_text) capturedCapabilities.push("primary_text");
    if (item.secondary_text) capturedCapabilities.push("secondary_text");
    if (item.body_text) capturedCapabilities.push("body_text");
    if (item.source_url) capturedCapabilities.push("source_url");
    if (item.metadata?.platform_state) capturedCapabilities.push("platform_state");
    if (item.metadata?.tertiary_text) capturedCapabilities.push("location");
    const adapterWarning = Boolean(extracted.capture?.adapter_warning);

    return extractionResults.createExtractionResult({
      status: adapterWarning ? "partial" : "complete",
      item,
      source_data: extracted,
      required_capabilities: capabilities.required,
      optional_capabilities: capabilities.optional,
      captured_capabilities: capturedCapabilities,
      warnings: adapterWarning
        ? [{
            code: "adapter_capture_warning",
            message: "The source adapter reported a degraded capture."
          }]
        : []
    });
  }

  return { create };
});
