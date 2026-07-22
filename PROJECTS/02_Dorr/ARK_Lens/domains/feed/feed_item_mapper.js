(function initializeArkFeedItemMapper(root, factory) {
  const lensItems = typeof module !== "undefined" && module.exports
    ? require("../../core/lens_item.js")
    : root.ARK_LENS_ITEM_RUNTIME;
  const api = factory(lensItems);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ARK_FEED_ITEM_MAPPER = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkFeedItemMapper(lensItems) {
  if (!lensItems) throw new Error("ARK LensItem runtime must load before the Feed item mapper.");

  function mapFeedSourceToLensItem(source = {}) {
    return lensItems.createLensItem({
      item_id: source.source_item_id,
      source_adapter_id: source.adapter_id,
      item_type: "feed_post",
      source_url: source.source_url,
      captured_at: source.capture_metadata?.captured_at || null,
      primary_text: source.visible_text,
      secondary_text: source.author,
      body_text: source.visible_text,
      author: source.author ? { name: source.author, url: source.author_url || "" } : null,
      published_at: source.published_at || null,
      links: source.links,
      media_types: source.media_types,
      observable_platform_labels: source.visible_labels,
      metadata: {
        identity_quality: source.identity_quality,
        visible_timestamp: source.visible_timestamp,
        repost_context: source.repost_context,
        sponsored: Boolean(source.capture_metadata?.sponsored),
        recommendation: Boolean(source.capture_metadata?.recommendation),
        capture_metadata: source.capture_metadata || {}
      }
    });
  }

  return { mapFeedSourceToLensItem };
});
