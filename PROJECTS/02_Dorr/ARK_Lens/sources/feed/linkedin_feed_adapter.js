(function initializeArkLinkedInFeedAdapter(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ARK_LINKEDIN_FEED_ADAPTER = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkLinkedInFeedAdapterModule() {
  const ADAPTER_ID = "linkedin_feed";
  const ADAPTER_VERSION = "0.1.0";
  const ITEM_TYPE = "feed_post";
  const SELECTORS = Object.freeze({
    feed_root: Object.freeze([
      "[data-feed-root]",
      ".scaffold-finite-scroll__content",
      "main"
    ]),
    post: Object.freeze([
      "[data-feed-post]",
      "[data-urn^=\"urn:li:activity:\"]",
      "[data-urn^=\"urn:li:share:\"]",
      ".feed-shared-update-v2",
      "[data-view-name=\"feed-full-update\"]"
    ]),
    author: Object.freeze([
      "[data-feed-author]",
      ".update-components-actor__name",
      ".feed-shared-actor__name"
    ]),
    text: Object.freeze([
      "[data-feed-post-text]",
      ".feed-shared-update-v2__description",
      ".update-components-text"
    ]),
    timestamp: Object.freeze([
      "[data-feed-timestamp]",
      "time",
      ".update-components-actor__sub-description",
      ".feed-shared-actor__sub-description"
    ]),
    label: Object.freeze([
      "[data-feed-label]",
      "[data-sponsored-label]",
      "[data-recommendation-label]",
      ".update-components-actor__description"
    ]),
    repost: Object.freeze([
      "[data-repost-context]",
      ".feed-shared-header",
      ".update-components-header"
    ])
  });

  function create(context = {}) {
    const {
      adapterDiagnostics,
      document,
      domUtils,
      extractionResults,
      feedItemMapper,
      feedRegistry,
      location
    } = context;
    const cryptoRuntime = context.crypto || globalThis.crypto;
    if (!adapterDiagnostics || !document || !domUtils || !extractionResults ||
      !feedItemMapper || !feedRegistry || !location) {
      throw new Error("LinkedIn Feed adapter dependencies were not provided.");
    }

    const cleanText = domUtils.cleanText;
    const safeQuerySelector = (root, selector) => domUtils.safeQuerySelector(root, selector);
    const safeQuerySelectorAll = (root, selector) => domUtils.safeQuerySelectorAll(root, selector);

    function canHandleLocation(locationLike = location) {
      const definition = feedRegistry.getAdapterDefinition(ADAPTER_ID);
      return feedRegistry.definitionMatchesLocation(definition, locationLike);
    }

    function firstMatch(root, selectors) {
      return domUtils.firstMatchSelector(root, selectors);
    }

    function firstText(root, selectors) {
      return domUtils.firstText([root], selectors, 1);
    }

    function isRendered(element) {
      return Boolean(element) && !element.hidden && element.getAttribute?.("aria-hidden") !== "true";
    }

    function getFeedRoot() {
      return firstMatch(document, SELECTORS.feed_root);
    }

    function discoverItems(root = getFeedRoot()) {
      if (!canHandleLocation() || !root) return [];
      const candidates = new Set();
      SELECTORS.post.forEach((selector) => {
        if (root.matches?.(selector)) candidates.add(root);
        safeQuerySelectorAll(root, selector).forEach((element) => candidates.add(element));
      });
      return [...candidates].filter(isRendered).map((element, index) => ({ element, index }));
    }

    function cleanHttpUrl(value) {
      try {
        const url = new URL(value, location.href);
        if (!/^https?:$/.test(url.protocol)) return "";
        [...url.searchParams.keys()].forEach((key) => {
          if (/(?:token|auth|session|tracking|trk|lipi|midtoken)/i.test(key)) url.searchParams.delete(key);
        });
        url.hash = "";
        return url.href;
      } catch (_error) {
        return "";
      }
    }

    function linksFrom(element) {
      return [...new Set(safeQuerySelectorAll(element, "a[href]")
        .map((anchor) => cleanHttpUrl(anchor.href || anchor.getAttribute?.("href") || ""))
        .filter(Boolean))];
    }

    function getPermalink(element, links) {
      const direct = safeQuerySelector(element, 'a[href*="/feed/update/"], a[href*="/posts/"]');
      return cleanHttpUrl(direct?.href || direct?.getAttribute?.("href") ||
        links.find((href) => /linkedin\.com\/(?:feed\/update|posts)\//i.test(href)) || "");
    }

    function stableIdentityFrom(element, permalink) {
      const renderedIds = [
        element.getAttribute?.("data-urn"),
        element.getAttribute?.("data-id"),
        element.getAttribute?.("data-activity-urn")
      ].map(cleanText).filter(Boolean);
      const rendered = renderedIds.find((value) => /^urn:li:(?:activity|share):\d+$/i.test(value));
      if (rendered) return rendered;
      const decoded = decodeURIComponent(permalink || "");
      return decoded.match(/urn:li:(?:activity|share):\d+/i)?.[0] ||
        decoded.match(/activity[-:]?(\d{6,})/i)?.[1] || "";
    }

    async function sha256(value) {
      if (typeof context.hashText === "function") return context.hashText(value);
      if (!cryptoRuntime?.subtle || typeof TextEncoder === "undefined") return "";
      const buffer = await cryptoRuntime.subtle.digest("SHA-256", new TextEncoder().encode(value));
      return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    function normalisedPublishedAt(element) {
      const datetime = firstMatch(element, SELECTORS.timestamp)?.getAttribute?.("datetime") || "";
      if (!datetime || Number.isNaN(Date.parse(datetime))) return null;
      return new Date(datetime).toISOString();
    }

    function visibleLabels(element) {
      return [...new Set(SELECTORS.label.flatMap((selector) =>
        safeQuerySelectorAll(element, selector).map((node) => cleanText(node.textContent || node.getAttribute?.("aria-label") || ""))
      ).filter((value) => /sponsored|promoted|suggested|recommended|because you follow/i.test(value)))];
    }

    function mediaTypes(element) {
      return [
        safeQuerySelector(element, "video") && "video",
        safeQuerySelector(element, "img:not([data-emoji])") && "image",
        safeQuerySelector(element, '[data-feed-article], .feed-shared-article') && "article",
        safeQuerySelector(element, '[data-feed-document], .feed-shared-document') && "document"
      ].filter(Boolean);
    }

    async function extractSource(candidate) {
      const element = candidate?.element || candidate;
      if (!canHandleLocation() || !element || !isRendered(element)) return null;
      const author = firstText(element, SELECTORS.author);
      const visibleText = firstText(element, SELECTORS.text);
      const visibleTimestamp = firstText(element, SELECTORS.timestamp);
      const links = linksFrom(element);
      const sourceUrl = getPermalink(element, links);
      const authorLink = safeQuerySelector(element, 'a[href*="/in/"], a[href*="/company/"]');
      const authorUrl = cleanHttpUrl(authorLink?.href || authorLink?.getAttribute?.("href") || "");
      const labels = visibleLabels(element);
      const media = mediaTypes(element);
      const repostContext = firstText(element, SELECTORS.repost);
      const sponsored = labels.some((label) => /sponsored|promoted/i.test(label));
      const recommendation = labels.some((label) => /suggested|recommended|because you follow/i.test(label));
      const stableId = stableIdentityFrom(element, sourceUrl);
      const meaningful = Boolean(visibleText || author || links.length || media.length || labels.length || repostContext);
      let sourceItemId = stableId;
      let identityQuality = stableId ? "stable" : "unknown";
      if (!sourceItemId && meaningful) {
        const fallback = await sha256([author, visibleTimestamp, visibleText, links[0] || ""].join("|"));
        if (fallback) {
          sourceItemId = `fallback:${fallback}`;
          identityQuality = "fallback";
        }
      }
      return {
        adapter_id: ADAPTER_ID,
        adapter_version: ADAPTER_VERSION,
        source_item_id: sourceItemId,
        identity_quality: identityQuality,
        source_url: sourceUrl,
        author,
        author_url: authorUrl,
        visible_text: visibleText,
        visible_timestamp: visibleTimestamp,
        published_at: normalisedPublishedAt(element),
        visible_labels: labels,
        links,
        media_types: media,
        repost_context: repostContext,
        capture_metadata: {
          captured_at: new Date().toISOString(),
          sponsored,
          recommendation,
          rendered_evidence_only: true
        }
      };
    }

    function capturedCapabilities(source) {
      return [
        "item_discovery",
        source.identity_quality === "stable" && "stable_item_identity",
        source.visible_text && "primary_text",
        source.source_url && "source_url",
        source.author && "content.author",
        source.author_url && "content.author_url",
        source.published_at && "content.published_at",
        source.links.length && "content.links",
        source.media_types.length && "content.media_types",
        source.visible_labels.length && "platform.visible_labels",
        source.capture_metadata.sponsored && "platform.sponsored_label",
        source.capture_metadata.recommendation && "platform.recommendation_label",
        source.repost_context && "platform.repost_context"
      ].filter(Boolean);
    }

    async function extractItem(candidate) {
      if (!canHandleLocation()) {
        return extractionResults.createExtractionResult({
          status: "unsupported",
          required_capabilities: ["item_discovery", "primary_text", "content.author"],
          warnings: [{ code: "unsupported_location", message: "The current location is not the LinkedIn home feed." }]
        });
      }
      const source = await extractSource(candidate);
      if (!source || !source.source_item_id || !(
        source.visible_text || source.author || source.links.length || source.media_types.length ||
        source.visible_labels.length || source.repost_context
      )) {
        return extractionResults.createExtractionResult({
          status: "unsupported",
          source_data: source,
          required_capabilities: ["item_discovery", "primary_text", "content.author"],
          warnings: [{ code: "unsupported_feed_structure", message: "Rendered post evidence was insufficient for safe extraction." }]
        });
      }
      const item = feedItemMapper.mapFeedSourceToLensItem(source);
      const complete = source.identity_quality === "stable" && source.visible_text && source.author &&
        source.source_url && source.author_url && source.published_at;
      const warnings = source.identity_quality === "fallback"
        ? [{ code: "fallback_identity", message: "Post identity uses a deterministic hash of visible evidence." }]
        : [];
      return extractionResults.createExtractionResult({
        status: complete ? "complete" : "partial",
        item,
        source_data: source,
        required_capabilities: ["item_discovery", "primary_text", "content.author"],
        optional_capabilities: ["stable_item_identity", "source_url", "content.author_url", "content.published_at"],
        captured_capabilities: capturedCapabilities(source),
        warnings
      });
    }

    function deriveItemId(candidate, result) {
      return result?.item?.item_id || candidate?.element?.getAttribute?.("data-urn") || null;
    }

    function selectorObservation(root, selectorKey, required) {
      const matches = SELECTORS[selectorKey].flatMap((selector) => safeQuerySelectorAll(root, selector));
      return adapterDiagnostics.createSelectorObservation({
        selector_key: selectorKey,
        matched: matches.length > 0,
        match_count: matches.length,
        required,
        observation: matches.length ? "Rendered structure matched." : "Rendered structure was not observed."
      });
    }

    async function diagnose(candidate = null) {
      const root = getFeedRoot() || document;
      const candidates = discoverItems();
      const result = await extractionResults.guardExtraction(
        () => extractItem(candidate || candidates[0] || null),
        { required_capabilities: ["item_discovery", "primary_text", "content.author"] }
      );
      return adapterDiagnostics.fromExtractionResult({
        adapter_id: ADAPTER_ID,
        item_type: ITEM_TYPE,
        location_supported: canHandleLocation(),
        structure_detected: candidates.length > 0,
        discovered_item_count: candidates.length,
        extraction_result: result,
        selector_observations: [
          selectorObservation(root, "post", true),
          selectorObservation(root, "author", true),
          selectorObservation(root, "text", false),
          selectorObservation(root, "timestamp", false)
        ]
      });
    }

    return Object.freeze({
      adapterId: ADAPTER_ID,
      adapterVersion: ADAPTER_VERSION,
      itemType: ITEM_TYPE,
      selectors: SELECTORS,
      canHandleLocation,
      diagnose,
      discoverItems,
      deriveItemId,
      extractItem,
      extractSource,
      getFeedRoot
    });
  }

  return { ADAPTER_ID, ADAPTER_VERSION, ITEM_TYPE, SELECTORS, create };
});
