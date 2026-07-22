(function initializeArkJobExtractionCompatibility(root, factory) {
  const lensItems = typeof module !== "undefined" && module.exports
    ? require("../core/lens_item.js")
    : root.ARK_LENS_ITEM_RUNTIME;
  const api = factory(lensItems);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.ARK_JOB_EXTRACTION_COMPATIBILITY = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createJobExtractionCompatibility(
  lensItems
) {
  if (!lensItems) {
    throw new Error("ARK LensItem runtime must load before Job extraction compatibility.");
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function toLensItem(extracted = {}) {
    const sourceUrl = cleanText(extracted.source?.url);
    const platformState = extracted.platform_state || {};
    const labels = platformState.applied
      ? [cleanText(platformState.applied_text) || "Applied"]
      : [];

    return lensItems.createLensItem({
      item_id: extracted.source?.source_item_id,
      source_adapter_id: extracted.source?.id,
      item_type: extracted.type || "job",
      source_url: sourceUrl,
      captured_at: extracted.captured_at || null,
      primary_text: extracted.display?.primary_text,
      secondary_text: extracted.display?.secondary_text,
      body_text: extracted.content?.full_text,
      author: null,
      published_at: extracted.metadata?.posted || null,
      tags: [],
      links: sourceUrl ? [sourceUrl] : [],
      media_types: [],
      observable_platform_labels: labels,
      metadata: {
        tertiary_text: cleanText(extracted.display?.tertiary_text),
        summary_text: cleanText(extracted.content?.summary),
        platform_state: { ...platformState },
        source_metadata: { ...(extracted.metadata || {}) }
      }
    });
  }

  return { toLensItem };
});
