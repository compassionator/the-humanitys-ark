(function initializeArkExtractionResultRuntime(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.ARK_EXTRACTION_RESULTS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkExtractionResultRuntime() {
  const EXTRACTION_STATUSES = Object.freeze([
    "complete",
    "partial",
    "unsupported",
    "failed"
  ]);

  function uniqueStrings(value) {
    return [...new Set(
      (Array.isArray(value) ? value : [])
        .filter((entry) => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )];
  }

  function isSerializablePlainData(value, seen = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || seen.has(value)) return false;

    seen.add(value);
    if (Array.isArray(value)) {
      const valid = value.every((entry) => isSerializablePlainData(entry, seen));
      seen.delete(value);
      return valid;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      seen.delete(value);
      return false;
    }

    const valid = Object.entries(value).every(([key, entry]) =>
      typeof key === "string" && isSerializablePlainData(entry, seen)
    );
    seen.delete(value);
    return valid;
  }

  function clonePlainData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function serializableMessages(value, kind) {
    return (Array.isArray(value) ? value : []).map((entry) => {
      if (isSerializablePlainData(entry)) return clonePlainData(entry);
      return {
        code: `non_serializable_${kind}`,
        message: `${kind === "warning" ? "Warning" : "Error"} detail was not serialisable.`
      };
    });
  }

  function createCaptureQuality(status, required, optional, captured) {
    const requiredCaptured = required.filter((capability) => captured.includes(capability));
    const optionalCaptured = optional.filter((capability) => captured.includes(capability));

    return {
      level: status === "complete"
        ? "complete"
        : status === "partial"
          ? "degraded"
          : "insufficient",
      required_total: required.length,
      required_captured: requiredCaptured.length,
      optional_total: optional.length,
      optional_captured: optionalCaptured.length
    };
  }

  function createExtractionResult(input = {}) {
    const required = uniqueStrings(input.required_capabilities);
    const optional = uniqueStrings(input.optional_capabilities)
      .filter((capability) => !required.includes(capability));
    const captured = uniqueStrings(input.captured_capabilities);
    const supported = [...required, ...optional];
    const missing = supported.filter((capability) => !captured.includes(capability));
    const warnings = serializableMessages(input.warnings, "warning");
    const errors = serializableMessages(input.errors, "error");
    let status = EXTRACTION_STATUSES.includes(input.status) ? input.status : "failed";
    let item = input.item ?? null;
    let sourceData = input.source_data ?? null;

    if (!EXTRACTION_STATUSES.includes(input.status)) {
      errors.push({ code: "invalid_extraction_status", message: "Extraction status was invalid." });
    }
    if (item !== null && !isSerializablePlainData(item)) {
      status = "failed";
      item = null;
      sourceData = null;
      errors.push({
        code: "non_serializable_item",
        message: "Extraction item must contain serialisable plain data only."
      });
    }
    if (sourceData !== null && !isSerializablePlainData(sourceData)) {
      status = "failed";
      item = null;
      sourceData = null;
      errors.push({
        code: "non_serializable_source_data",
        message: "Extraction source data must contain serialisable plain data only."
      });
    }
    if (status === "complete" && missing.length > 0) status = "partial";
    if (status === "partial" && item === null) status = "unsupported";
    if (status === "unsupported" || status === "failed") item = null;

    return {
      status,
      item,
      capture_quality: createCaptureQuality(status, required, optional, captured),
      captured_capabilities: captured,
      missing_capabilities: missing,
      warnings,
      errors,
      source_data: sourceData
    };
  }

  function isExtractionResult(value) {
    return Boolean(value) &&
      EXTRACTION_STATUSES.includes(value.status) &&
      isSerializablePlainData(value) &&
      Array.isArray(value.captured_capabilities) &&
      Array.isArray(value.missing_capabilities) &&
      Array.isArray(value.warnings) &&
      Array.isArray(value.errors) &&
      Boolean(value.capture_quality);
  }

  async function guardExtraction(operation, failureContext = {}) {
    try {
      const result = await operation();
      if (isExtractionResult(result)) return result;

      return createExtractionResult({
        status: "failed",
        required_capabilities: failureContext.required_capabilities,
        optional_capabilities: failureContext.optional_capabilities,
        captured_capabilities: [],
        errors: [{
          code: "invalid_extraction_result",
          message: "Source adapter did not return a valid ExtractionResult."
        }]
      });
    } catch (error) {
      return createExtractionResult({
        status: "failed",
        required_capabilities: failureContext.required_capabilities,
        optional_capabilities: failureContext.optional_capabilities,
        captured_capabilities: [],
        errors: [{
          code: "unexpected_extraction_error",
          name: typeof error?.name === "string" ? error.name : "Error",
          message: typeof error?.message === "string" ? error.message : "Unexpected extraction failure."
        }]
      });
    }
  }

  return {
    EXTRACTION_STATUSES,
    createCaptureQuality,
    createExtractionResult,
    guardExtraction,
    isExtractionResult,
    isSerializablePlainData
  };
});
