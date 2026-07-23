(() => {
  if (!globalThis.__arkLinkedInFeedProofRuntime) {
    const feedRegistry = globalThis.ARK_FEED_SOURCE_ADAPTERS;
    const adapter = globalThis.ARK_LINKEDIN_FEED_ADAPTER.create({
      adapterDiagnostics: globalThis.ARK_ADAPTER_DIAGNOSTICS,
      crypto: globalThis.crypto,
      document,
      domUtils: globalThis.ARK_DOM_READ_UTILS,
      extractionResults: globalThis.ARK_EXTRACTION_RESULTS,
      feedItemMapper: globalThis.ARK_FEED_ITEM_MAPPER,
      feedRegistry,
      location
    });
    globalThis.__arkLinkedInFeedProofRuntime = globalThis.ARK_LINKEDIN_FEED_PROBE.create({
      adapter,
      capturePolicy: globalThis.ARK_FEED_CAPTURE_POLICY,
      clearTimeout,
      document,
      extractionResults: globalThis.ARK_EXTRACTION_RESULTS,
      location,
      MutationObserver,
      setTimeout
    });
  }

  if (!globalThis.__arkLinkedInFeedProofListener) {
    globalThis.__arkLinkedInFeedProofListener = (message, _sender, sendResponse) => {
      if (!String(message?.type || "").startsWith("ARK_FEED_PROOF_")) return;
      Promise.resolve(globalThis.__arkLinkedInFeedProofRuntime.handleMessage(message))
        .then((snapshot) => sendResponse({ ok: true, snapshot }))
        .catch((error) => sendResponse({ ok: false, message: error?.message || "Feed proof operation failed." }));
      return true;
    };
    chrome.runtime.onMessage.addListener(globalThis.__arkLinkedInFeedProofListener);
  }
})();
