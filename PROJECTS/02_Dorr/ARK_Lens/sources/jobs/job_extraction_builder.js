(function initializeArkJobExtractionBuilder(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.ARK_JOB_EXTRACTION_BUILDER = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkJobExtractionBuilder() {
  function create(context = {}) {
    const {
      adapterVersion,
      cleanText,
      location,
      sha256
    } = context;

    if (!adapterVersion || !cleanText || !location || !sha256) {
      throw new Error("Job extraction builder requires adapter version, text, location and hash dependencies.");
    }

    return async function buildExtractedJob({
      title,
      company,
      locationText,
      description,
      platformState,
      jobId,
      url,
      selectorProfileId,
      adapterWarning,
      extractionMode,
      adapterProfile,
      sourceId = "linkedin_jobs",
      metadata = {},
      contextBadge = ""
    }) {
      const fullText = cleanText(`${title} ${company} ${locationText} ${description}`);
      const profile = adapterProfile;
      const contentHash = await sha256(fullText);

      return {
        source: {
          id: sourceId,
          adapter_version: adapterVersion,
          source_item_id: jobId || contentHash.slice(0, 16),
          url: url || location.href
        },
        type: "job",
        entity: {
          name: company || null,
          type: "company"
        },
        display: {
          primary_text: title,
          secondary_text: company,
          tertiary_text: locationText,
          context_badge: contextBadge || (platformState.applied ? "Applied" : "")
        },
        content: {
          summary: fullText.slice(0, 300),
          full_text: description,
          content_hash: contentHash
        },
        platform_state: platformState,
        capture: {
          selector_profile_id: selectorProfileId,
          adapter_profile_id: profile.id,
          adapter_profile_version: profile.version,
          adapter_warning: adapterWarning
        },
        metadata: {
          raw_location_text: locationText,
          ...metadata,
          extraction_mode: extractionMode,
          adapter_profile_id: profile.id,
          adapter_profile_version: profile.version
        }
      };
    };
  }

  return { create };
});
