(function initializeArkDomReadUtils(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.ARK_DOM_READ_UTILS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkDomReadUtils() {
  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function selectorsFromProfile(profile, section, fallback = []) {
    const selectors = profile?.fields?.[section];
    return Array.isArray(selectors) && selectors.length > 0 ? [...selectors] : [...fallback];
  }

  function safeQuerySelector(root, selector, onError = null) {
    try {
      return root?.querySelector(selector) || null;
    } catch (error) {
      if (typeof onError === "function") onError({ selector, error });
      return null;
    }
  }

  function safeQuerySelectorAll(root, selector, onError = null) {
    try {
      return root ? [...root.querySelectorAll(selector)] : [];
    } catch (error) {
      if (typeof onError === "function") onError({ selector, error });
      return [];
    }
  }

  function firstMatchSelector(root, selectors, onError = null) {
    for (const selector of selectors || []) {
      const element = safeQuerySelector(root, selector, onError);
      if (element) return element;
    }
    return null;
  }

  function textOf(root, selector, onError = null) {
    return cleanText(safeQuerySelector(root, selector, onError)?.textContent || "");
  }

  function firstText(roots, selectors, minimumLength = 1, onError = null) {
    for (const root of roots || []) {
      for (const selector of selectors || []) {
        const selfMatches = root?.matches?.(selector) ? [root] : [];
        const matches = [
          ...selfMatches,
          ...safeQuerySelectorAll(root, selector, onError)
        ];

        for (const match of matches) {
          const value = cleanText(
            match.textContent || match.getAttribute?.("aria-label") || ""
          );
          if (value.length >= minimumLength) return value;
        }
      }
    }
    return "";
  }

  function isElementVisible(element) {
    return Boolean(element) &&
      (element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects?.().length > 0);
  }

  function getCurrentItemIdParam(href, profile, baseHref = "") {
    try {
      if (!href) return null;
      const url = new URL(href, baseHref || undefined);
      const queryParams = profile?.job_id?.query_params || ["currentJobId"];
      for (const param of queryParams) {
        const value = url.searchParams.get(param);
        if (value) return value;
      }
    } catch (_error) {
      return null;
    }
    return null;
  }

  return {
    cleanText,
    firstMatchSelector,
    firstText,
    getCurrentItemIdParam,
    isElementVisible,
    safeQuerySelector,
    safeQuerySelectorAll,
    selectorsFromProfile,
    textOf
  };
});
