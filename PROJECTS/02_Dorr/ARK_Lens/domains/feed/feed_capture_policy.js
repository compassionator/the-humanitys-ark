(function initializeArkFeedCapturePolicy(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ARK_FEED_CAPTURE_POLICY = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkFeedCapturePolicy() {
  function canInspect(extractionResult) {
    if (!extractionResult || !["complete", "partial"].includes(extractionResult.status)) return false;
    const item = extractionResult.item;
    if (!item?.item_id || item.item_type !== "feed_post") return false;
    return Boolean(
      item.primary_text ||
      item.author?.name ||
      item.links?.length ||
      item.media_types?.length ||
      item.observable_platform_labels?.length ||
      item.metadata?.repost_context
    );
  }

  return { canInspect };
});
