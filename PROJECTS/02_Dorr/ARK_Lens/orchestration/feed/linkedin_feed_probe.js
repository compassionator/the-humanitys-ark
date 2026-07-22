(function initializeArkLinkedInFeedProbe(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ARK_LINKEDIN_FEED_PROBE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkLinkedInFeedProbeModule() {
  const SNAPSHOT_SCHEMA_VERSION = "1.0.0";
  const PROOF_VERSION = "0.1.0";

  function create(context = {}) {
    const { adapter, capturePolicy, document, location, MutationObserver, setTimeout, clearTimeout } = context;
    if (!adapter || !capturePolicy || !document || !location || !MutationObserver) {
      throw new Error("LinkedIn Feed probe dependencies were not provided.");
    }

    const results = new Map();
    let seenNodes = new WeakSet();
    let observer = null;
    let debounceTimer = null;
    let startedAt = null;
    let observedAt = null;
    let unsupportedSequence = 0;
    const counts = {
      discovered: 0,
      complete: 0,
      partial: 0,
      unsupported: 0,
      failed: 0,
      deduplicated: 0
    };

    function safePageUrl() {
      try {
        const url = new URL(location.href);
        return `${url.origin}${url.pathname}`;
      } catch (_error) {
        return "";
      }
    }

    function diagnosticSummary(result) {
      return {
        capture_status: result.status,
        captured_capabilities: [...result.captured_capabilities],
        missing_capabilities: [...result.missing_capabilities],
        warning_count: result.warnings.length,
        error_count: result.errors.length
      };
    }

    function snapshot() {
      return JSON.parse(JSON.stringify({
        schema_version: SNAPSHOT_SCHEMA_VERSION,
        proof_version: PROOF_VERSION,
        adapter_id: adapter.adapterId,
        page_url: safePageUrl(),
        started_at: startedAt,
        observed_at: observedAt,
        observation_active: Boolean(observer),
        counts,
        items: [...results.values()]
      }));
    }

    async function inspectCandidate(candidate) {
      const node = candidate?.element || candidate;
      if (node && seenNodes.has(node)) return;
      if (node) seenNodes.add(node);
      counts.discovered += 1;
      const result = await context.extractionResults.guardExtraction(
        () => adapter.extractItem(candidate),
        { required_capabilities: ["item_discovery", "primary_text", "content.author"] }
      );
      const identity = result.item?.item_id || result.source_data?.source_item_id || "";
      const key = identity ? `${adapter.adapterId}:${identity}` : `unsupported:${unsupportedSequence += 1}`;
      if (identity && results.has(key)) {
        counts.deduplicated += 1;
        return;
      }
      counts[result.status] += 1;
      results.set(key, {
        extraction_result: result,
        inspectable: capturePolicy.canInspect(result),
        identity_quality: result.source_data?.identity_quality || "unknown",
        diagnostic_summary: diagnosticSummary(result)
      });
      observedAt = new Date().toISOString();
    }

    async function scan() {
      if (!startedAt) startedAt = new Date().toISOString();
      const candidates = adapter.discoverItems();
      for (const candidate of candidates) await inspectCandidate(candidate);
      observedAt = new Date().toISOString();
      return snapshot();
    }

    function queueScan() {
      if (!observer || debounceTimer) return;
      debounceTimer = setTimeout(async () => {
        debounceTimer = null;
        if (observer) await scan();
      }, 120);
    }

    async function start() {
      if (!startedAt) startedAt = new Date().toISOString();
      await scan();
      if (!observer) {
        observer = new MutationObserver((mutations) => {
          if (mutations.some((mutation) => mutation.addedNodes?.length)) queueScan();
        });
        observer.observe(adapter.getFeedRoot() || document.body || document.documentElement, {
          childList: true,
          subtree: true
        });
      }
      return snapshot();
    }

    function stop() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      observer?.disconnect();
      observer = null;
      return snapshot();
    }

    function clear() {
      results.clear();
      seenNodes = new WeakSet();
      Object.keys(counts).forEach((key) => { counts[key] = 0; });
      unsupportedSequence = 0;
      observedAt = new Date().toISOString();
      return snapshot();
    }

    async function handleMessage(message) {
      switch (message?.type) {
        case "ARK_FEED_PROOF_SCAN": return scan();
        case "ARK_FEED_PROOF_START": return start();
        case "ARK_FEED_PROOF_STOP": return stop();
        case "ARK_FEED_PROOF_SNAPSHOT": return snapshot();
        case "ARK_FEED_PROOF_CLEAR": return clear();
        default: return null;
      }
    }

    return Object.freeze({ clear, handleMessage, scan, snapshot, start, stop });
  }

  return { PROOF_VERSION, SNAPSHOT_SCHEMA_VERSION, create };
});
