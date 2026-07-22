(function initializeArkLensItemRuntime(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.ARK_LENS_ITEM_RUNTIME = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkLensItemRuntime() {
  const LENS_ITEM_CONTRACT_VERSION = "1.0.0";

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function stringArray(value) {
    return Array.isArray(value)
      ? value
        .filter((entry) => typeof entry === "string")
        .map(cleanText)
        .filter(Boolean)
      : [];
  }

  function createLensItem(value = {}) {
    return {
      contract_version: LENS_ITEM_CONTRACT_VERSION,
      item_id: cleanText(value.item_id),
      source_adapter_id: cleanText(value.source_adapter_id),
      item_type: cleanText(value.item_type),
      source_url: cleanText(value.source_url),
      captured_at: value.captured_at || null,
      primary_text: cleanText(value.primary_text),
      secondary_text: cleanText(value.secondary_text),
      body_text: cleanText(value.body_text),
      author: value.author || null,
      published_at: value.published_at || null,
      tags: stringArray(value.tags),
      links: stringArray(value.links),
      media_types: stringArray(value.media_types),
      observable_platform_labels: stringArray(value.observable_platform_labels),
      metadata: value.metadata && typeof value.metadata === "object"
        ? { ...value.metadata }
        : {}
    };
  }

  return {
    LENS_ITEM_CONTRACT_VERSION,
    createLensItem
  };
});
