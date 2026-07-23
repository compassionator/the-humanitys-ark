(function initializeArkFeedSourceCatalogue(root, factory) {
  const registryCore = typeof module !== "undefined" && module.exports
    ? require("../source_adapter_registry.js")
    : root.ARK_SOURCE_REGISTRY_CORE;
  const api = factory(registryCore);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ARK_FEED_SOURCE_ADAPTERS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkFeedSourceCatalogue(registryCore) {
  if (!registryCore) throw new Error("ARK source registry core must load before the Feed catalogue.");

  const definitions = [{
    id: "linkedin_feed",
    display_name: "LinkedIn Home Feed",
    item_type: "feed_post",
    status: "implemented",
    url_patterns: ["https://www.linkedin.com/feed/*"],
    capabilities: {
      required: ["item_discovery", "primary_text", "content.author"],
      optional: [
        "stable_item_identity",
        "source_url",
        "content.author_url",
        "content.published_at",
        "content.links",
        "content.media_types",
        "platform.visible_labels",
        "platform.sponsored_label",
        "platform.recommendation_label",
        "platform.repost_context"
      ],
      operations: ["runtime.lazy_insert_observation"],
      unsupported: []
    },
    matches_location: (url) => /(^|\.)linkedin\.com$/i.test(url.hostname) && /^\/feed(?:\/|$)/.test(url.pathname)
  }];

  return registryCore.createSourceRegistry({ definitions });
});
