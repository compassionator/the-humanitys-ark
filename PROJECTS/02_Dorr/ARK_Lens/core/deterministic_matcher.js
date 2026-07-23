(function initializeArkDeterministicMatcher(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.ARK_DETERMINISTIC_MATCHER = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkDeterministicMatcher() {
  function normalize(text) {
    return String(text || "").toLowerCase();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function keywordToWholeTermRegex(keyword) {
    const terms = String(keyword || "")
      .trim()
      .split(/[\s-]+/)
      .filter(Boolean)
      .map(escapeRegExp);

    if (terms.length === 0) {
      return null;
    }

    return new RegExp(`(^|[^a-z0-9])${terms.join("[\\s-]+")}(?=$|[^a-z0-9])`, "i");
  }

  function containsAny(text, keywords) {
    const normalizedText = String(text || "").replace(/\s+/g, " ");

    return (keywords || []).filter((keyword) => {
      const matcher = keywordToWholeTermRegex(keyword);
      return matcher ? matcher.test(normalizedText) : false;
    });
  }

  function buildScopeTexts(lensItem = {}) {
    const metadata = lensItem.metadata || {};
    const title = lensItem.primary_text || "";
    const company = lensItem.secondary_text || "";
    const location = metadata.tertiary_text || "";
    const summary = metadata.summary_text || "";
    const description = lensItem.body_text || "";

    return {
      all: [title, company, location, summary, description].join(" "),
      title,
      company,
      location,
      description: [summary, description].join(" "),
      metadata: lensItem.source_url || ""
    };
  }

  function matchScopedText(scopeTexts, lensPolicy) {
    const matchedSignals = Object.entries(lensPolicy?.signal_groups || {})
      .flatMap(([groupName, signals]) => (signals || []).flatMap((signal) => {
        const matchScope = signal.match_scope;
        const rawText = matchScope === "all"
          ? scopeTexts.all
          : scopeTexts[matchScope];
        const matchText = matchScope === "all"
          ? String(rawText || "")
          : String(rawText || "").replace(/[,:|/()[\]{}]+/g, " ");
        const matchedKeywords = containsAny(matchText, signal.keywords || []);

        if (matchedKeywords.length === 0) {
          return [];
        }

        return [{
          ...signal,
          group: groupName,
          id: signal.id,
          keywords: matchedKeywords,
          weight: signal.weight || 0,
          penalty: signal.penalty || 0,
          reason: signal.reason || "",
          display_name: signal.display_name,
          match_scope: matchScope,
          blocker: signal.blocker,
          qualifies_role_fit: signal.qualifies_role_fit,
          role_fit_kind: signal.role_fit_kind
        }];
      }));
    const blockers = matchedSignals.filter((signal) => signal.blocker);

    return {
      matched_signals: matchedSignals,
      evidence: matchedSignals.flatMap((signal) =>
        (signal.keywords || []).map((keyword) => ({
          rule_id: signal.id,
          group: signal.group,
          match_scope: signal.match_scope,
          keyword
        }))
      ),
      score_or_priority: null,
      recommended_action: null,
      explanations: matchedSignals
        .map((signal) => signal.reason)
        .filter(Boolean),
      blockers,
      unknowns: []
    };
  }

  function matchLensItem(lensItem, lensPolicy) {
    return matchScopedText(buildScopeTexts(lensItem), lensPolicy);
  }

  return {
    buildScopeTexts,
    containsAny,
    escapeRegExp,
    keywordToWholeTermRegex,
    matchLensItem,
    matchScopedText,
    normalize
  };
});
