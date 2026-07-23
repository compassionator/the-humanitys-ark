(function initializeArkAdapterDiagnostics(root, factory) {
  const extractionResults = typeof module !== "undefined" && module.exports
    ? require("../core/extraction_result.js")
    : root.ARK_EXTRACTION_RESULTS;
  const api = factory(extractionResults);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.ARK_ADAPTER_DIAGNOSTICS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkAdapterDiagnostics(
  extractionResults
) {
  if (!extractionResults) {
    throw new Error("ARK ExtractionResult runtime must load before adapter diagnostics.");
  }

  function integer(value) {
    return Number.isInteger(value) && value >= 0 ? value : 0;
  }

  function cleanString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function createSelectorObservation(value = {}) {
    return {
      selector_key: cleanString(value.selector_key),
      matched: Boolean(value.matched),
      match_count: integer(value.match_count),
      required: Boolean(value.required),
      observation: cleanString(value.observation)
    };
  }

  function createAdapterDiagnostic(value = {}) {
    const selectorObservations = (Array.isArray(value.selector_observations)
      ? value.selector_observations
      : []).map(createSelectorObservation);
    const diagnostic = {
      adapter_id: cleanString(value.adapter_id),
      item_type: cleanString(value.item_type),
      location_supported: Boolean(value.location_supported),
      structure_detected: Boolean(value.structure_detected),
      discovered_item_count: integer(value.discovered_item_count),
      capture_status: extractionResults.EXTRACTION_STATUSES.includes(value.capture_status)
        ? value.capture_status
        : "failed",
      captured_capabilities: [...new Set(
        (Array.isArray(value.captured_capabilities) ? value.captured_capabilities : [])
          .filter((entry) => typeof entry === "string" && entry.trim())
      )],
      missing_capabilities: [...new Set(
        (Array.isArray(value.missing_capabilities) ? value.missing_capabilities : [])
          .filter((entry) => typeof entry === "string" && entry.trim())
      )],
      selector_observations: selectorObservations,
      warnings: Array.isArray(value.warnings) ? value.warnings : [],
      errors: Array.isArray(value.errors) ? value.errors : [],
      timestamp: cleanString(value.timestamp) || new Date().toISOString()
    };

    if (!extractionResults.isSerializablePlainData(diagnostic)) {
      throw new TypeError("Adapter diagnostics must contain serialisable plain data only.");
    }

    return JSON.parse(JSON.stringify(diagnostic));
  }

  function fromExtractionResult(value = {}) {
    const result = extractionResults.isExtractionResult(value.extraction_result)
      ? value.extraction_result
      : extractionResults.createExtractionResult({
          status: "failed",
          errors: [{
            code: "invalid_diagnostic_extraction_result",
            message: "Diagnostic extraction did not return an ExtractionResult."
          }]
        });

    return createAdapterDiagnostic({
      ...value,
      capture_status: result.status,
      captured_capabilities: result.captured_capabilities,
      missing_capabilities: result.missing_capabilities,
      warnings: result.warnings,
      errors: result.errors
    });
  }

  return {
    createAdapterDiagnostic,
    createSelectorObservation,
    fromExtractionResult
  };
});
