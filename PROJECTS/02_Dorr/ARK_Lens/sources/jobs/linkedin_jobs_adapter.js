(function initializeArkLinkedInJobsAdapter(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ARK_LINKEDIN_JOBS_ADAPTER = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLinkedInJobsAdapterModule() {
  const DEFAULT_PROFILE = {
      id: "linkedin_jobs_default_profile",
      adapter_id: "linkedin_jobs",
      version: "v2026.06.005f",
      display_name: "LinkedIn Jobs Default Profile",
      item_type: "job",
      fields: {
        detail_root: [
          ".jobs-search__job-details--container",
          ".scaffold-layout__detail.jobs-search__job-details",
          ".jobs-search__job-details",
          ".jobs-search__job-details--wrapper",
          ".job-view-layout.jobs-details",
          '[data-sdui-screen*="SemanticJobDetails"]',
          '[data-sdui-screen*="JobDetails"]'
        ],
        fallback_root: [
          "main"
        ],
        title: [
          ".job-details-jobs-unified-top-card__job-title h1 a",
          ".job-details-jobs-unified-top-card__job-title h1",
          ".job-details-jobs-unified-top-card__job-title",
          ".jobs-unified-top-card__job-title",
          ".jobs-details-top-card__job-title",
          "[data-test-job-title]",
          'a[href*="/jobs/view/"]',
          "h1"
        ],
        company: [
          ".job-details-jobs-unified-top-card__company-name a",
          ".job-details-jobs-unified-top-card__company-name",
          ".jobs-unified-top-card__company-name a",
          ".jobs-unified-top-card__company-name",
          ".jobs-details-top-card__company-url",
          ".jobs-details-top-card__company-info a",
          ".jobs-unified-top-card__primary-description a",
          ".job-details-jobs-unified-top-card__primary-description-container a",
          ".artdeco-entity-lockup__subtitle a"
        ],
        location: [
          ".job-details-jobs-unified-top-card__tertiary-description-container",
          ".job-details-jobs-unified-top-card__primary-description-container",
          ".jobs-unified-top-card__primary-description",
          ".jobs-unified-top-card__bullet",
          ".jobs-details-top-card__bullet",
          ".artdeco-entity-lockup__caption"
        ],
        description: [
          "#job-details",
          ".jobs-description__content",
          ".jobs-box__html-content",
          ".jobs-description-content__text",
          ".jobs-description"
        ],
        applied_message: [
          ".artdeco-inline-feedback__message"
        ],
        applied_link: [
          "#jobs-apply-see-application-link"
        ],
        apply_button: [
          "button"
        ],
        workspace_root: [
          "main#workspace"
        ],
        recommendation_link: [
          'a[href*="/jobs/view/"]'
        ]
      },
      job_id: {
        url_patterns: [
          "/jobs/view/<id>/"
        ],
        query_params: [
          "currentJobId"
        ],
        link_selectors: [
          'a[href*="/jobs/view/"]'
        ]
      },
      readiness: {
        min_description_length: 50,
        allow_applied_without_description: true
      }
    };
  function create(context = {}) {
    const { adapterDiagnostics, buildExtractedJob, console, document, domUtils,
      escapeRegExp, extractionResults, getLastObservedJobId, jobAdapterResult,
      jobCompatibility, location, normalize, sha256, sourceAdaptersRuntime } = context;
    if (!adapterDiagnostics || !buildExtractedJob || !document || !domUtils ||
      !extractionResults || !jobAdapterResult || !jobCompatibility || !location ||
      !sourceAdaptersRuntime) throw new Error("LinkedIn Jobs adapter dependencies were not provided.");
    const cleanText = domUtils.cleanText;
    let recentClickedCollectionSnapshot = null;
    let lastCapturedLinkedInDetailSignature = "";

    function getLinkedInProfile(profile) {
      return profile || DEFAULT_PROFILE;
    }

    const LINKEDIN_ESSENTIAL_FIELD_SELECTORS = {
      detail_root: [
        ".jobs-search__job-details--container",
        ".scaffold-layout__detail.jobs-search__job-details",
        ".jobs-search__job-details",
        ".jobs-search__job-details--wrapper",
        ".job-view-layout.jobs-details",
        '[data-sdui-screen*="SemanticJobDetails"]',
        '[data-sdui-screen*="JobDetails"]'
      ],
      title: [
        ".job-details-jobs-unified-top-card__job-title h1 a",
        ".job-details-jobs-unified-top-card__job-title h1",
        ".job-details-jobs-unified-top-card__job-title",
        ".jobs-unified-top-card__job-title",
        ".jobs-details-top-card__job-title",
        "[data-test-job-title]",
        'a[href*="/jobs/view/"]',
        "h1"
      ],
      company: [
        ".job-details-jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name",
        ".jobs-details-top-card__company-url",
        ".jobs-details-top-card__company-info a",
        ".jobs-unified-top-card__primary-description a",
        ".job-details-jobs-unified-top-card__primary-description-container a",
        ".artdeco-entity-lockup__subtitle a",
        '[aria-label^="Company,"] a[href*="/company/"]',
        '[aria-label^="Company,"]',
        'a[href*="/company/"]'
      ],
      location: [
        ".job-details-jobs-unified-top-card__tertiary-description-container",
        ".job-details-jobs-unified-top-card__primary-description-container",
        ".jobs-unified-top-card__primary-description",
        ".jobs-unified-top-card__bullet",
        ".jobs-details-top-card__bullet",
        ".artdeco-entity-lockup__caption"
      ],
      description: [
        "#job-details",
        ".jobs-description__content",
        ".jobs-box__html-content",
        ".jobs-description-content__text",
        ".jobs-description",
        '[data-testid="expandable-text-box"]'
      ],
      workspace_root: [
        "main#workspace"
      ],
      recommendation_link: [
        'a[href*="/jobs/view/"]',
        'a[href*="currentJobId="]'
      ]
    };

    function selectorsFromProfile(profile, section, fallback = []) {
      const adapterProfile = getLinkedInProfile(profile);
      const selectors = adapterProfile?.fields?.[section];
      const baseSelectors = Array.isArray(selectors) && selectors.length > 0
        ? selectors
        : fallback;
      const essentialSelectors = adapterProfile?.adapter_id === "linkedin_jobs"
        ? LINKEDIN_ESSENTIAL_FIELD_SELECTORS[section] || []
        : [];

      return [...new Set([...baseSelectors, ...essentialSelectors])];
    }

    function safeQuerySelector(root, selector) {
      try {
        return root?.querySelector(selector) || null;
      } catch (error) {
        console.warn("[ARK Lens] invalid selector skipped", { selector, error });
        return null;
      }
    }

    function safeQuerySelectorAll(root, selector) {
      try {
        return root ? [...root.querySelectorAll(selector)] : [];
      } catch (error) {
        console.warn("[ARK Lens] invalid selector skipped", { selector, error });
        return [];
      }
    }

    function firstMatchSelector(selectors) {
      for (const selector of selectors || []) {
        const el = safeQuerySelector(document, selector);

        if (el) {
          return el;
        }
      }

      return null;
    }

    let linkedInDomScopesCache = { timestamp: 0, scopes: [] };

    function getLinkedInDomScopes() {
      const now = Date.now();

      if (
        now - linkedInDomScopesCache.timestamp < 250 &&
        linkedInDomScopesCache.scopes.length
      ) {
        return linkedInDomScopesCache.scopes;
      }

      const scopes = [];
      const queue = [document];
      const seen = new Set();

      while (queue.length && scopes.length < 32) {
        const scope = queue.shift();

        if (!scope || seen.has(scope)) {
          continue;
        }

        seen.add(scope);
        scopes.push(scope);

        for (const iframe of safeQuerySelectorAll(scope, "iframe")) {
          try {
            if (iframe.contentDocument) {
              queue.push(iframe.contentDocument);
            }
          } catch (_error) {
            // Cross-origin frames are intentionally inaccessible.
          }
        }

        for (const element of safeQuerySelectorAll(scope, "*")) {
          if (element.shadowRoot) {
            queue.push(element.shadowRoot);
          }
        }
      }

      linkedInDomScopesCache = { timestamp: now, scopes };
      return scopes;
    }

    function queryLinkedInDom(selector) {
      return [...new Set(
        getLinkedInDomScopes().flatMap((scope) => safeQuerySelectorAll(scope, selector))
      )];
    }

    function firstLinkedInDomMatch(selectors) {
      for (const selector of selectors || []) {
        const match = queryLinkedInDom(selector)[0];

        if (match) {
          return match;
        }
      }

      return null;
    }

    function getJobIdFromRoot(root, profile) {
      if (!root) return null;

      const directId = cleanText(
        root.getAttribute?.("data-job-id") ||
        root.getAttribute?.("data-occludable-job-id") ||
        ""
      );

      if (/^\d+$/.test(directId)) {
        return directId;
      }

      const rootHref = root.href || root.getAttribute?.("href") || "";
      const rootHrefJobId = rootHref
        ? getJobIdFromHref(rootHref) || getCurrentJobIdParam(rootHref, profile)
        : null;

      if (rootHrefJobId) {
        return rootHrefJobId;
      }

      const configuredSelectors = getLinkedInProfile(profile)?.job_id?.link_selectors || [];
      const linkSelectors = [...new Set([
        ...configuredSelectors,
        'a[href*="/jobs/view/"]',
        'a[href*="currentJobId="]'
      ])];

      for (const selector of linkSelectors) {
        const links = safeQuerySelectorAll(root, selector);

        for (const link of links) {
          const jobId = getJobIdFromHref(link.href) ||
            getCurrentJobIdParam(link.href, profile);

          if (jobId) return jobId;
        }
      }

      return null;
    }

    function getLinkedInRequestedJobId(profile) {
      return getCurrentJobIdParam(location.href, profile) ||
        getJobIdFromHref(location.href) ||
        null;
    }

    function hasTextMatch(root, selectors, minimumLength = 1) {
      return selectors.some((selector) => {
        const selfMatches = root?.matches?.(selector) ? [root] : [];
        const matches = [...selfMatches, ...safeQuerySelectorAll(root, selector)];

        return matches.some((element) =>
          cleanText(element?.textContent || element?.getAttribute?.("aria-label") || "")
            .length >= minimumLength
        );
      });
    }

    function getLinkedInDetailEvidenceScore(root, profile, requestedJobId = null) {
      if (!root) return -1;

      const rootJobId = getJobIdFromRoot(root, profile);

      if (requestedJobId && rootJobId && rootJobId !== requestedJobId) {
        return -1;
      }

      let score = 0;
      const textLength = cleanText(root.textContent || "").length;

      if (rootJobId && rootJobId === requestedJobId) score += 100;
      if (LINKEDIN_ESSENTIAL_FIELD_SELECTORS.detail_root.some((selector) =>
        root.matches?.(selector)
      )) score += 20;
      if (hasTextMatch(root, LINKEDIN_ESSENTIAL_FIELD_SELECTORS.title, 3)) score += 30;
      if (hasTextMatch(root, LINKEDIN_ESSENTIAL_FIELD_SELECTORS.company, 2)) score += 15;
      if (hasTextMatch(root, LINKEDIN_ESSENTIAL_FIELD_SELECTORS.description, 30)) score += 35;
      if (safeQuerySelector(root, 'button[aria-label^="Apply to "]')) score += 10;
      if (isLikelyVisible(root)) score += 5;
      if (textLength > 25000) score -= 25;
      else if (textLength > 12000) score -= 10;

      return score;
    }

    function hasLinkedInDetailContent(root) {
      const hasTitle = hasTextMatch(
        root,
        LINKEDIN_ESSENTIAL_FIELD_SELECTORS.title,
        3
      );
      const hasDescription = hasTextMatch(
        root,
        LINKEDIN_ESSENTIAL_FIELD_SELECTORS.description,
        30
      );
      const hasCompany = hasTextMatch(
        root,
        LINKEDIN_ESSENTIAL_FIELD_SELECTORS.company,
        2
      );
      const hasApplyControl = Boolean(
        safeQuerySelector(root, 'button[aria-label^="Apply to "]')
      );

      return hasTitle && (hasDescription || (hasCompany && hasApplyControl));
    }

    function firstLinkedInDetailText(root, selectors, minimumLength = 1) {
      for (const selector of selectors) {
        const selfMatches = root?.matches?.(selector) ? [root] : [];
        const matches = [...selfMatches, ...safeQuerySelectorAll(root, selector)];

        for (const element of matches) {
          const text = cleanText(
            element?.textContent || element?.getAttribute?.("aria-label") || ""
          );

          if (text.length >= minimumLength) {
            return text;
          }
        }
      }

      return "";
    }

    function getLinkedInDetailContentSignature(root) {
      if (!root) return "";

      const title = firstLinkedInDetailText(
        root,
        LINKEDIN_ESSENTIAL_FIELD_SELECTORS.title,
        3
      );
      const company = firstLinkedInDetailText(
        root,
        LINKEDIN_ESSENTIAL_FIELD_SELECTORS.company,
        2
      );
      const description = firstLinkedInDetailText(
        root,
        LINKEDIN_ESSENTIAL_FIELD_SELECTORS.description,
        30
      ).slice(0, 1200);
      const applyLabel = cleanText(
        safeQuerySelector(root, 'button[aria-label^="Apply to "]')
          ?.getAttribute?.("aria-label") || ""
      );

      return cleanText(`${title}\n${company}\n${description}\n${applyLabel}`);
    }

    function findLinkedInDetailAncestor(element, profile, requestedJobId) {
      let candidate = element || null;

      while (candidate && candidate !== document.body) {
        if (
          hasLinkedInDetailContent(candidate) &&
          getLinkedInDetailEvidenceScore(candidate, profile, requestedJobId) >= 65
        ) {
          return candidate;
        }

        candidate = candidate.parentElement;
      }

      return null;
    }

    function getLinkedInDetailRootCandidates(profile, requestedJobId) {
      const selectors = selectorsFromProfile(profile, "detail_root", [
        ".jobs-search__job-details--container"
      ]);
      const directCandidates = selectors.flatMap((selector) =>
        queryLinkedInDom(selector)
      );
      const matchingJobLinks = queryLinkedInDom('a[href*="/jobs/view/"]')
        .filter((link) =>
          !requestedJobId || getJobIdFromHref(link.href) === requestedJobId
        );
      const semanticSeeds = [
        ...matchingJobLinks,
        ...queryLinkedInDom('button[aria-label^="Apply to "]'),
        ...queryLinkedInDom('button[aria-label^="Easy Apply to "]'),
        ...selectorsFromProfile(profile, "description", ["#job-details"])
          .flatMap((selector) => queryLinkedInDom(selector))
      ];
      const derivedCandidates = [...new Set(semanticSeeds)]
        .map((element) => findLinkedInDetailAncestor(element, profile, requestedJobId))
        .filter(Boolean);

      return [...new Set([...directCandidates, ...derivedCandidates])];
    }

    function getLinkedInJobDetailRoot(profile) {
      const adapterProfile = getLinkedInProfile(profile);
      const isLinkedInProfile = adapterProfile?.adapter_id === "linkedin_jobs";
      const desiredJobId = isLinkedInProfile
        ? getLinkedInRequestedJobId(adapterProfile)
        : null;
      const candidates = isLinkedInProfile
        ? getLinkedInDetailRootCandidates(adapterProfile, desiredJobId)
        : selectorsFromProfile(adapterProfile, "detail_root", [])
            .flatMap((selector) => safeQuerySelectorAll(document, selector));
      const rankedCandidates = candidates
        .map((root, index) => ({
          root,
          index,
          jobId: isLinkedInProfile ? getJobIdFromRoot(root, adapterProfile) : null,
          score: isLinkedInProfile
            ? getLinkedInDetailEvidenceScore(root, adapterProfile, desiredJobId)
            : 0
        }))
        .filter((candidate) => !isLinkedInProfile || candidate.score >= 0)
        .sort((a, b) => b.score - a.score || a.index - b.index);

      if (desiredJobId) {
        const matchedByJobId = rankedCandidates.find((candidate) =>
          candidate.jobId === desiredJobId ||
          candidate.root.getAttribute?.("componentkey")?.includes(desiredJobId)
        )?.root;

        if (matchedByJobId) {
          return matchedByJobId;
        }

        // Split-pane pages reuse the old detail DOM while currentJobId changes.
        // Wait for a matching embedded ID instead of saving stale content. A
        // direct /jobs/view/<id> page can safely use a strongly evidenced root.
        if (getJobIdFromHref(location.href) === desiredJobId) {
          return rankedCandidates.find((candidate) =>
            !candidate.jobId && candidate.score >= 65
          )?.root || null;
        }

        const unkeyedCandidate = rankedCandidates.find((candidate) =>
          !candidate.jobId && candidate.score >= 65
        );

        if (unkeyedCandidate) {
          const candidateSignature = getLinkedInDetailContentSignature(unkeyedCandidate.root);
          const selectedJobWasAlreadyCaptured =
            getLastObservedJobId() === `linkedin_jobs:${desiredJobId}`;

          if (
            !lastCapturedLinkedInDetailSignature ||
            selectedJobWasAlreadyCaptured ||
            candidateSignature !== lastCapturedLinkedInDetailSignature
          ) {
            return unkeyedCandidate.root;
          }
        }

        return null;
      }

      return rankedCandidates.find((candidate) =>
        !isLinkedInProfile || candidate.score >= 65
      )?.root || null;
    }

    function getFallbackRoot(profile) {
      return firstMatchSelector(selectorsFromProfile(profile, "fallback_root", [
        "main"
      ]));
    }

    function getScopedRoots(profile) {
      const detailRoot = getLinkedInJobDetailRoot(profile);

      if (detailRoot) {
        return [detailRoot];
      }

      const fallbackRoot = getFallbackRoot(profile);
      return fallbackRoot ? [fallbackRoot] : [];
    }

    function textOfIn(root, selector) {
      if (!root) return "";
      const el = safeQuerySelector(root, selector);
      return cleanText(el?.textContent || "");
    }

    function getJobIdFromHref(href) {
      const hrefMatch = (href || "").match(/\/jobs\/view\/(\d+)/);
      return hrefMatch?.[1] || null;
    }

    function getLinkedInRecordUrl(jobId) {
      return /^\d+$/.test(String(jobId || ""))
        ? `https://www.linkedin.com/jobs/view/${encodeURIComponent(jobId)}/`
        : location.href;
    }

    function getCurrentJobIdParam(href, profile) {
      try {
        if (!href) {
          return null;
        }

        const url = new URL(href, location.href);
        const queryParams = getLinkedInProfile(profile)?.job_id?.query_params || ["currentJobId"];

        for (const param of queryParams) {
          const value = url.searchParams.get(param);

          if (value) {
            return value;
          }
        }

        return null;
      } catch (_error) {
        return null;
      }
    }

    function isLinkedInJobsPage() {
      return sourceAdaptersRuntime.definitionMatchesLocation(
        sourceAdaptersRuntime.getAdapterDefinition("linkedin_jobs"),
        location
      );
    }

    function getJobIdFromUrlOrLinks(profile) {
      const currentJobId = getCurrentJobIdParam(location.href, profile);
      if (currentJobId) return currentJobId;

      const urlJobId = getJobIdFromHref(location.href);
      if (urlJobId) return urlJobId;

      const linkSelectors = getLinkedInProfile(profile)?.job_id?.link_selectors || [
        'a[href*="/jobs/view/"]'
      ];

      for (const root of getScopedRoots(profile)) {
        for (const selector of linkSelectors) {
          const selectedLink = safeQuerySelector(root, selector);
          const href = selectedLink?.href || "";
          const hrefMatch = getJobIdFromHref(href) || getCurrentJobIdParam(href, profile);

          if (hrefMatch) return hrefMatch;
        }
      }

      return null;
    }

    function getJobRoot(profile) {
      return getLinkedInJobDetailRoot(profile) || getFallbackRoot(profile);
    }

    function firstScopedText(selectors, minimumLength = 1, profile) {
      for (const root of getScopedRoots(profile)) {
        for (const selector of selectors) {
          const selfMatches = root.matches?.(selector) ? [root] : [];
          const matches = [...selfMatches, ...safeQuerySelectorAll(root, selector)];

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

    function cleanLinkedInMetaText(value) {
      return cleanText(value)
        .replace(/\u00c2\u00b7/g, "\u00b7")
        .replace(/applyPromoted/g, "apply \u00b7 Promoted")
        .replace(/hirerResponses/g, "hirer \u00b7 Responses")
        .replace(/applicantsPromoted/g, "applicants \u00b7 Promoted")
        .replace(/\s*\u00b7\s*/g, " \u00b7 ");
    }

    function getLinkedInSemanticDetailRoot() {
      return firstLinkedInDomMatch([
        '[data-sdui-screen*="SemanticJobDetails"]',
        '[data-sdui-screen*="JobDetails"]'
      ]);
    }

    function getLinkedInSemanticTitle(profile) {
      const root = getLinkedInSemanticDetailRoot();
      const jobId = getCurrentJobIdParam(location.href, profile) || getJobIdFromHref(location.href);
      const pageTitle = /^\/jobs\/view\/\d+/.test(location.pathname)
        ? cleanText(document.title).split("|")[0].trim()
        : "";

      if (!root) {
        return "";
      }

      if (isUsefulLinkedInJobTitle(pageTitle)) {
        return pageTitle;
      }

      const links = safeQuerySelectorAll(root, 'a[href*="/jobs/view/"]');
      const selected = links.find((link) =>
        !jobId ||
        getJobIdFromHref(link.href) === jobId ||
        getCurrentJobIdParam(link.href, profile) === jobId
      ) || links[0];

      return cleanText(selected?.textContent || "");
    }

    function getLinkedInSemanticCompany() {
      const root = getLinkedInSemanticDetailRoot();

      if (!root) {
        return "";
      }

      const labeledCompany = safeQuerySelector(root, '[aria-label^="Company,"]');
      const aria = cleanText(labeledCompany?.getAttribute("aria-label") || "");
      const ariaCompany = aria.match(/^Company,\s*(.+?)\.?$/i)?.[1] || "";

      if (ariaCompany) {
        return cleanText(ariaCompany);
      }

      return cleanText(
        safeQuerySelector(root, '[aria-label^="Company,"] a[href*="/company/"]')?.textContent ||
        safeQuerySelector(root, 'a[href*="/company/"][href*="/life/"]')?.textContent ||
        ""
      );
    }

    function getLinkedInLocationFromRoot(root) {
      if (!root) {
        return "";
      }

      const postedPattern = /\b(?:\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago|just now|today)\b/i;
      const interestPattern = /\b(?:Over\s+)?\d+\s+(?:people clicked apply|applicants?)\b/i;
      const candidates = safeQuerySelectorAll(root, "p, span")
        .map((el) => cleanLinkedInMetaText(el.textContent || ""))
        .filter((text) =>
          text &&
          (getLinkedInLocationPattern().test(text) || /^Australia\b/i.test(text)) &&
          (postedPattern.test(text) || interestPattern.test(text))
        );

      return candidates.sort((a, b) => a.length - b.length)[0] || "";
    }

    function getLinkedInSemanticLocation() {
      return getLinkedInLocationFromRoot(getLinkedInSemanticDetailRoot());
    }

    function getLinkedInSemanticDescription() {
      const root = getLinkedInSemanticDetailRoot();

      if (!root) {
        return "";
      }

      const expandableTexts = safeQuerySelectorAll(root, '[data-testid="expandable-text-box"]')
        .map((el) => cleanText(el.textContent || ""))
        .filter((text) =>
          text.length >= 50 &&
          !/^Viatris Inc\./i.test(text) &&
          !/Social Media Guidelines|Corporate Social Responsibility|Connect with/i.test(text)
        );

      if (expandableTexts[0]) {
        return expandableTexts[0];
      }

      return cleanText(root.textContent || "");
    }

    function getBestTitle(profile) {
      const selectedTitle = getLinkedInSemanticTitle(profile) || firstScopedText(selectorsFromProfile(profile, "title", [
        ".job-details-jobs-unified-top-card__job-title h1 a",
        ".job-details-jobs-unified-top-card__job-title h1",
        ".job-details-jobs-unified-top-card__job-title",
        ".jobs-unified-top-card__job-title",
        ".jobs-details-top-card__job-title",
        "[data-test-job-title]",
        'a[href*="/jobs/view/"]',
        "h1"
      ]), 1, profile);

      if (selectedTitle) {
        return selectedTitle;
      }

      const root = getLinkedInJobDetailRoot(profile);
      const applyAria = cleanText(
        safeQuerySelector(root, 'button[aria-label^="Apply to "]')
          ?.getAttribute("aria-label") || ""
      );

      return cleanText(
        applyAria.match(/^Apply to\s+(.+?)(?:\s+(?:at|on)\s+|$)/i)?.[1] || ""
      );
    }

    function getBestCompany(profile) {
      const selectedCompany = firstScopedText(selectorsFromProfile(profile, "company", [
        ".job-details-jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name",
        ".jobs-details-top-card__company-url",
        ".jobs-details-top-card__company-info a",
        ".jobs-unified-top-card__primary-description a",
        ".job-details-jobs-unified-top-card__primary-description-container a",
        ".artdeco-entity-lockup__subtitle a"
      ]), 1, profile) || getLinkedInSemanticCompany();

      if (selectedCompany) {
        return cleanInferredCompany(
          selectedCompany.replace(/^Company,\s*/i, "").replace(/\.$/, "")
        );
      }

      const root = getLinkedInJobDetailRoot(profile);
      const title = getBestTitle(profile);
      const saveText = cleanText(
        safeQuerySelector(root, ".jobs-save-button .a11y-text")?.textContent ||
        safeQuerySelector(root, 'button[aria-label^="Save "]')?.getAttribute("aria-label") ||
        ""
      );
      const escapedTitle = escapeRegExp(title);
      const company = title
        ? saveText.match(new RegExp(`^Save\\s+${escapedTitle}\\s+at\\s+(.+)$`, "i"))?.[1]
        : "";

      return cleanInferredCompany(company || "");
    }

    function getBestLocation(profile) {
      const selectedLocation = firstScopedText(selectorsFromProfile(profile, "location", [
        ".job-details-jobs-unified-top-card__tertiary-description-container",
        ".job-details-jobs-unified-top-card__primary-description-container",
        ".jobs-unified-top-card__primary-description",
        ".jobs-unified-top-card__bullet",
        ".jobs-details-top-card__bullet",
        ".artdeco-entity-lockup__caption"
      ]), 1, profile);
      const detailRoot = getLinkedInJobDetailRoot(profile);

      return cleanLinkedInMetaText(
        selectedLocation ||
        getLinkedInLocationFromRoot(detailRoot) ||
        getLinkedInSemanticLocation()
      );
    }

    function getDescription(profile) {
      return firstScopedText(selectorsFromProfile(profile, "description", [
        "#job-details",
        ".jobs-description__content",
        ".jobs-box__html-content",
        ".jobs-description-content__text",
        ".jobs-description"
      ]), 30, profile) || getLinkedInSemanticDescription();
    }

    function getPlatformState(profile) {
      const title = getBestTitle(profile);
      const roots = getScopedRoots(profile);
      const appliedMessageSelectors = selectorsFromProfile(profile, "applied_message", [
        ".artdeco-inline-feedback__message"
      ]);
      const appliedLinkSelectors = selectorsFromProfile(profile, "applied_link", [
        "#jobs-apply-see-application-link"
      ]);
      const applyButtonSelectors = selectorsFromProfile(profile, "apply_button", [
        "button"
      ]);
      const appliedMessages = roots.flatMap((root) => [
        ...appliedMessageSelectors.flatMap((selector) => safeQuerySelectorAll(root, selector))
      ]);
      const appliedByMessage = appliedMessages.some((el) =>
        normalize(cleanText(el.textContent)).includes("applied")
      );
      const appliedByLink = roots.some((root) =>
        appliedLinkSelectors.some((selector) => Boolean(safeQuerySelector(root, selector)))
      );
      const appliedBySemanticMessage = safeQuerySelectorAll(
        getLinkedInSemanticDetailRoot(),
        "p, span"
      ).some((element) =>
        /^applied(?:\s+on company site|\s+\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago)?$/i
          .test(cleanText(element.textContent || ""))
      );
      const applyButton = roots
        .flatMap((root) =>
          applyButtonSelectors.flatMap((selector) => safeQuerySelectorAll(root, selector))
        )
        .find((button) => {
          const text = cleanText(button.textContent);
          const aria = cleanText(button.getAttribute("aria-label"));
          const values = [text, aria].map(normalize);

          return values.some((value) =>
            value === "apply" ||
            value.startsWith("apply to ") ||
            (title && value.includes(`apply to ${normalize(title)}`))
          );
        });
      const applied = appliedByMessage || appliedByLink || appliedBySemanticMessage;

      return {
        applied,
        applied_text: applied ? "Applied" : "",
        can_apply: Boolean(applyButton) && !applied,
        apply_text: applyButton
          ? cleanText(applyButton.getAttribute("aria-label") || applyButton.textContent)
          : ""
      };
    }

    async function extractLinkedInJobDetail(profile) {
      console.log("[ARK Lens] attempted job_detail extraction");

      const adapterProfile = getLinkedInProfile(profile);
      const currentJobId = getLinkedInRequestedJobId(adapterProfile);
      const detailRoot = getLinkedInJobDetailRoot(adapterProfile);

      if (currentJobId && !detailRoot) {
        console.log("[ARK Lens] job_detail extraction waiting for matching detail root", {
          currentJobId
        });
        return null;
      }

      const detailJobId = getJobIdFromRoot(detailRoot, adapterProfile);

      if (currentJobId && detailJobId && currentJobId !== detailJobId) {
        console.log("[ARK Lens] job_detail extraction waiting for selected job DOM", {
          currentJobId,
          detailJobId
        });
        return null;
      }

      const title = getBestTitle(adapterProfile);
      const company = getBestCompany(adapterProfile);
      const locationText = getBestLocation(adapterProfile);
      const description = getDescription(adapterProfile);
      const platformState = getPlatformState(adapterProfile);
      const jobId = currentJobId || detailJobId ||
        getJobIdFromUrlOrLinks(adapterProfile);
      const minDescriptionLength =
        adapterProfile.readiness?.min_description_length ?? 50;
      const allowAppliedWithoutDescription =
        adapterProfile.readiness?.allow_applied_without_description !== false;

      const ready =
        title &&
        company &&
        (
          description.length >= minDescriptionLength ||
          (allowAppliedWithoutDescription && platformState.applied === true)
        );

      if (!ready) {
        const missingFields = [
          !title ? "title" : "",
          !company ? "company" : "",
          description.length < minDescriptionLength &&
            !(allowAppliedWithoutDescription && platformState.applied === true)
            ? "description"
            : ""
        ].filter(Boolean);

        console.log("[ARK Lens] job_detail extraction not ready", {
          title,
          company,
          descriptionLength: description.length,
          minDescriptionLength,
          applied: platformState.applied,
          missingFields
        });

        return null;
      }

      const extracted = await buildExtractedJob({
        title,
        company,
        locationText,
        description,
        platformState,
        jobId,
        url: getLinkedInRecordUrl(jobId),
        selectorProfileId: "linkedin_jobs_v1",
        adapterWarning: !description || description.length < minDescriptionLength,
        extractionMode: "job_detail",
        adapterProfile
      });

      Object.defineProperty(extracted, "_linkedinDetailSignature", {
        value: getLinkedInDetailContentSignature(detailRoot),
        enumerable: false
      });

      return extracted;
    }

    function getUsefulJobCard(link) {
      const directCard = (
        link.closest("[data-job-id]") ||
        link.closest("li") ||
        link.closest("article") ||
        link.closest(".job-card-container") ||
        link.closest(".jobs-search-results__list-item")
      );

      if (directCard) {
        return directCard;
      }

      let candidate = link?.parentElement || null;

      while (candidate && candidate !== document.body) {
        if (candidate.matches?.("main#workspace")) {
          break;
        }

        const dismissTitles = [...new Set(
          safeQuerySelectorAll(
            candidate,
            'button[aria-label^="Dismiss "][aria-label$=" job"]'
          )
            .map(getCollectionsJobTitleFromButton)
            .filter(isUsefulLinkedInJobTitle)
        )];

        // New Jobs Home cards can be classless and omit heading semantics. A
        // single unique Dismiss <title> job label identifies the card without
        // widening extraction to the surrounding recommendations module.
        if (dismissTitles.length === 1) {
          return candidate;
        }

        candidate = candidate.parentElement;
      }

      return link?.parentElement || null;
    }

    function getRecommendationCardTitle(link, card) {
      const directValues = [
        link?.textContent || "",
        link?.getAttribute?.("aria-label") || ""
      ].map(cleanText);
      const directTitle = directValues.find(isUsefulCollectionTitleHint);

      if (directTitle) {
        return directTitle;
      }

      const dismissTitle = safeQuerySelectorAll(
        card,
        'button[aria-label^="Dismiss "][aria-label$=" job"]'
      )
        .map(getCollectionsJobTitleFromButton)
        .find(isUsefulLinkedInJobTitle);

      if (dismissTitle) {
        return dismissTitle;
      }

      return safeQuerySelectorAll(card, "h1, h2, h3, [role='heading']")
        .map((heading) => cleanText(heading.textContent || heading.getAttribute?.("aria-label") || ""))
        .find(isUsefulCollectionTitleHint) || "";
    }

    function isLikelyVisible(el) {
      if (!el) return false;
      const style = el.ownerDocument?.defaultView?.getComputedStyle?.(el) ||
        getComputedStyle(el);
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        el.getClientRects().length > 0;
    }

    function scoreJobLink(link) {
      const card = getUsefulJobCard(link);
      let score = 0;

      if (isLikelyVisible(link)) score += 20;
      if (link.getAttribute("aria-current") === "true") score += 30;
      if (link.getAttribute("aria-selected") === "true") score += 30;
      if (card?.getAttribute("aria-selected") === "true") score += 25;
      if (card?.className && String(card.className).includes("selected")) score += 15;
      if (cleanText(link.textContent)) score += 5;

      return score;
    }

    function isSelectedJobLink(link) {
      const card = getUsefulJobCard(link);

      return link?.getAttribute("aria-current") === "true" ||
        link?.getAttribute("aria-selected") === "true" ||
        card?.getAttribute?.("aria-selected") === "true" ||
        /\bselected\b/i.test(String(card?.className || ""));
    }

    function getRecommendationJobCandidates(profile) {
      const workspace = firstMatchSelector(selectorsFromProfile(profile, "workspace_root", [
        "main#workspace"
      ]));
      const linkSelectors = selectorsFromProfile(profile, "recommendation_link", [
        'a[href*="/jobs/view/"]'
      ]);
      const links = workspace
        ? [...new Set(linkSelectors.flatMap((selector) => safeQuerySelectorAll(workspace, selector)))]
        : [];
      const candidates = links
        .map((link, index) => {
          const card = getUsefulJobCard(link);
          const title = getRecommendationCardTitle(link, card);
          const nearbyText = cleanText(card?.innerText || card?.textContent || "");
          const insideDetailRoot = Boolean(link.closest?.(
            LINKEDIN_ESSENTIAL_FIELD_SELECTORS.detail_root.join(",")
          ));

          return {
            link,
            card,
            index,
            jobId: getJobIdFromHref(link.href) || getCurrentJobIdParam(link.href, profile),
            title,
            nearbyText,
            selected: isSelectedJobLink(link),
            insideDetailRoot,
            score: scoreJobLink(link)
          };
        })
        .filter((candidate) =>
          candidate.jobId &&
          isUsefulLinkedInJobTitle(candidate.title) &&
          !candidate.insideDetailRoot &&
          candidate.nearbyText.length > candidate.title.length + 2
        )
        .sort((a, b) => b.score - a.score || a.index - b.index);

      return { links, candidates };
    }

    function isLinkedInCollectionsPage() {
      return location.pathname.includes("/jobs/collections/");
    }

    function getCollectionsJobTitleFromButton(button) {
      const aria = cleanText(button?.getAttribute("aria-label") || "");
      const match = aria.match(/^Dismiss\s+(.+?)\s+job$/i);
      return cleanText(match?.[1] || "");
    }

    function isUsefulLinkedInJobTitle(value) {
      const text = cleanText(value);

      return Boolean(
        text &&
        text.length >= 3 &&
        text.length <= 200 &&
        !/^(?:more|show more|see more|view job|job details?|jobs?|apply|save|saved|promoted)$/i.test(text)
      );
    }

    function isUsefulCollectionTitleHint(value) {
      const text = cleanText(value);

      return Boolean(
        isUsefulLinkedInJobTitle(text) &&
        text.length <= 140 &&
        !getLinkedInLocationPattern().test(text) &&
        !/\b(?:apply|save|saved|share|dismiss|promoted|view job|show more|see more|more options|i.?m interested|actively recruiting|people clicked apply|applicants?)\b/i.test(text)
      );
    }

    function getCollectionTitleHintFromTarget(target) {
      const candidates = [];
      let el = target || null;

      while (el && el !== document.body) {
        if (el.matches?.("main#workspace")) {
          break;
        }

        candidates.push(
          el.getAttribute?.("aria-label") || "",
          el.innerText || "",
          el.textContent || ""
        );

        el = el.parentElement;
      }

      return candidates
        .map(cleanText)
        .find(isUsefulCollectionTitleHint) || "";
    }

    function getLinkedInLocationPattern() {
      return /\b(?:remote|hybrid|onsite|on-site)\b|(?:[A-Z][A-Za-z .'-]+,\s*(?:New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Australian Capital Territory|Northern Territory|NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia)\b[^\n]*)|(?:[A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)?\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b(?:\s*\([^)]*\))?)/i;
    }

    function getLinkedInGeoLocationPattern() {
      return /(?:[A-Z][A-Za-z .'-]+,\s*(?:New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Australian Capital Territory|Northern Territory|NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia)\b[^\n]*)|(?:[A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)?\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b(?:\s*\([^)]*\))?)/g;
    }

    function getLinkedInGeoLocationMatches(text) {
      const patterns = [
        /(?=([A-Z][A-Za-z .'-]+,\s*(?:New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Australian Capital Territory|Northern Territory|NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia)\b[^\n]*))/g,
        /(?=([A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)?\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b(?:\s*\([^)]*\))?))/g
      ];
      const matches = patterns.flatMap((pattern) =>
        [...text.matchAll(pattern)].map((match) => cleanText(match[1]))
      );

      return [...new Set(matches.filter(Boolean))]
        .sort((a, b) => a.length - b.length);
    }

    function scoreCollectionCardCandidate(el, title) {
      if (!el) return -1;

      const rawText = el.innerText || el.textContent || "";
      const text = cleanText(rawText);

      if (!text || (title && !text.includes(title))) {
        return -1;
      }

      const lines = rawText
        .split(/\r?\n/)
        .map(cleanText)
        .filter(Boolean);
      let score = 0;

      if (text.length >= 40) score += 10;
      if (lines.length >= 3) score += 20;
      if (getLinkedInLocationPattern().test(text)) score += 35;
      if (el.matches?.('li, article, [role="listitem"]')) score += 8;
      if (text.length > 1800) score -= 20;

      return score;
    }

    function getUsefulCollectionCard(button, title = "") {
      if (!button) return null;

      const candidates = [];
      let el = button.parentElement;

      while (el && el !== document.body) {
        if (el.matches?.("main#workspace")) {
          break;
        }

        const score = scoreCollectionCardCandidate(el, title);

        if (score >= 0) {
          candidates.push({ el, score });
        }

        el = el.parentElement;
      }

      return candidates
        .sort((a, b) => b.score - a.score)[0]?.el ||
        button.closest("li, article, [role='listitem']") ||
        button.parentElement;
    }

    function getCollectionCardJobId(card, profile) {
      if (!card) return null;

      const links = safeQuerySelectorAll(card, 'a[href*="/jobs/view/"], a[href*="currentJobId="]');

      for (const link of links) {
        const jobId = getJobIdFromHref(link.href) ||
          getCurrentJobIdParam(link.href, profile);

        if (jobId) return jobId;
      }

      return null;
    }

    function scoreSelectedCollectionCard(card) {
      if (!card) return 0;

      const text = cleanText(card.innerText || card.textContent || "");
      const className = String(card.className || "");
      let score = 0;

      if (isLikelyVisible(card)) score += 10;
      if (card.matches?.('[aria-current="true"], [aria-selected="true"]')) score += 45;
      if (safeQuerySelector(card, '[aria-current="true"], [aria-selected="true"]')) score += 35;
      if (/\b(?:selected|active)\b/i.test(className)) score += 20;
      if (/\bactive job\b/i.test(text)) score += 35;

      return score;
    }

    function getCollectionsCardFromElement(card, profile = DEFAULT_PROFILE, titleHint = "") {
      if (!card) return null;

      const rawText = card.innerText || card.textContent || "";
      const compactText = cleanText(rawText);
      const cleanTitleHint = isUsefulCollectionTitleHint(titleHint) ? cleanText(titleHint) : "";
      const lines = rawText
        .split(/\r?\n/)
        .map(cleanText)
        .filter(Boolean)
        .filter((line, index, arr) => arr.indexOf(line) === index);
      const noisyLinePattern =
        /^(viewed|promoted|apply|save|saved|share|more|show more|see more|more options|dismiss|view job|active job|jump to|i.?m interested|act(?:ively)? recruiting)$/i;
      const metadataLinePattern =
        /\b(?:people clicked apply|applicants?|responses managed|promoted by hirer|school alum|school alumni|connection works|connections work|viewed|full-time|part-time|contract|temporary)\b/i;
      const locationIndex = lines.findIndex((line) => getLinkedInLocationPattern().test(line));

      let title = "";
      let company = "";

      if (locationIndex > 0) {
        const beforeLocation = lines
          .slice(0, locationIndex)
          .filter((line) =>
            !noisyLinePattern.test(line) &&
            !metadataLinePattern.test(line) &&
            !getLinkedInLocationPattern().test(line)
          );
        const hintedTitle = beforeLocation.find((line) =>
          cleanTitleHint &&
          (line === cleanTitleHint || line.includes(cleanTitleHint) || cleanTitleHint.includes(line))
        );
        const titleIndex = hintedTitle
          ? beforeLocation.indexOf(hintedTitle)
          : 0;

        title = cleanTitleHint || beforeLocation[titleIndex] || "";
        company = beforeLocation
          .slice(Math.max(titleIndex + 1, 1))
          .find((line) => line !== title) || "";
      }

      if ((!title || !company) && cleanTitleHint && compactText.includes(cleanTitleHint)) {
        const location = getLinkedInGeoLocationMatches(compactText)[0] || "";
        const titleOffset = compactText.indexOf(cleanTitleHint);
        const afterTitle = titleOffset >= 0
          ? compactText.slice(titleOffset + cleanTitleHint.length)
          : "";
        const companyText = location && afterTitle.includes(location)
          ? afterTitle.slice(0, afterTitle.indexOf(location))
          : afterTitle;

        title = title || cleanTitleHint;
        company = company || cleanInferredCompany(companyText, title);
      }

      if (!isUsefulLinkedInJobTitle(title) || !isUsefulLinkedInCompany(company, title)) {
        return null;
      }

      return {
        title,
        jobId: getCollectionCardJobId(card, profile),
        nearbyText: rawText,
        card,
        selectedScore: scoreSelectedCollectionCard(card)
      };
    }

    function findCollectionsCardFromTarget(target, profile = DEFAULT_PROFILE, titleHint = "") {
      let el = target?.parentElement || null;

      while (el && el !== document.body) {
        if (el.matches?.("main#workspace")) {
          break;
        }

        const snapshot = getCollectionsCardFromElement(el, profile, titleHint);

        if (snapshot) {
          return snapshot;
        }

        el = el.parentElement;
      }

      return null;
    }

    function getCollectionsCardFromButton(button, profile = DEFAULT_PROFILE) {
      const title = getCollectionsJobTitleFromButton(button);
      const card = getUsefulCollectionCard(button, title);
      const nearbyText = card?.innerText || card?.textContent || "";
      const jobId = getCollectionCardJobId(card, profile);

      if (!title) {
        return getCollectionsCardFromElement(card, profile);
      }

      if (!title || cleanText(nearbyText).length < 20) {
        return null;
      }

      return {
        title,
        jobId,
        nearbyText,
        card,
        selectedScore: scoreSelectedCollectionCard(card)
      };
    }

    function getCollectionsCardCandidates(profile) {
      const workspace = firstMatchSelector(selectorsFromProfile(profile, "workspace_root", [
        "main#workspace"
      ]));

      if (!workspace) {
        return [];
      }

      return safeQuerySelectorAll(workspace, "button")
        .map((button, index) => {
          const snapshot = getCollectionsCardFromButton(button, profile);
          return snapshot ? { ...snapshot, index } : null;
        })
        .filter(Boolean)
        .sort((a, b) =>
          (b.selectedScore || 0) - (a.selectedScore || 0) ||
          Number(Boolean(b.jobId)) - Number(Boolean(a.jobId)) ||
          a.index - b.index
        );
    }

    function getEffectiveLinkedInJobId() {
      const profile = DEFAULT_PROFILE;
      const requestedJobId = getLinkedInRequestedJobId(profile);
      if (requestedJobId) return requestedJobId;

      const detailRoot = getLinkedInJobDetailRoot(profile);
      const linkSelectors = profile.job_id?.link_selectors || ['a[href*="/jobs/view/"]'];
      const detailLink = linkSelectors
        .map((selector) => safeQuerySelector(detailRoot, selector))
        .find(Boolean);
      const detailJobId = getJobIdFromHref(detailLink?.href) ||
        getCurrentJobIdParam(detailLink?.href, profile);
      if (detailJobId) return detailJobId;

      const { candidates } = getRecommendationJobCandidates(profile);
      return candidates.find((candidate) => candidate.selected)?.jobId || null;
    }

    function inferCompanyAndLocation(title, nearbyText) {
      const lines = (nearbyText || "")
        .split(/\r?\n/)
        .map(cleanText)
        .filter(Boolean)
        .filter((line, index, arr) => arr.indexOf(line) === index);
      const titleIndex = lines.findIndex((line) => line === title || line.includes(title));
      const usefulLines = titleIndex >= 0 ? lines.slice(titleIndex + 1) : lines;
      const noisyLinePattern =
        /^(viewed|promoted|apply|save|saved|share|more|show more|see more|dismiss|view job|active job|jump to|how your profile|try premium|show match|tailor my resume|help me stand out)$/i;
      const metadataLinePattern =
        /\b(?:people clicked apply|applicants?|responses managed|promoted by hirer|school alum|school alumni|connection works|connections work|viewed|hybrid|remote|on-site|onsite|full-time|part-time|contract|temporary)\b/i;
      const locationPattern =
        /\b(?:remote|hybrid|onsite|on-site)\b|(?:[A-Z][A-Za-z .'-]+,\s*(?:New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Australian Capital Territory|Northern Territory|NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia)\b[^\n]*)/i;
      const company = usefulLines.find((line) =>
        line !== title &&
        !line.includes("/jobs/view/") &&
        !noisyLinePattern.test(line) &&
        !metadataLinePattern.test(line) &&
        !locationPattern.test(line)
      ) || "";
      const location = usefulLines.find((line) =>
        line !== company &&
        locationPattern.test(line)
      ) || "";

      const broadLocation = location || usefulLines.find((line) =>
        line !== company &&
        getLinkedInLocationPattern().test(line)
      ) || "";

      if (company || broadLocation) {
        return { company, location: broadLocation };
      }

      const compactText = cleanText(nearbyText);
      const titleOffset = compactText.indexOf(title);
      const afterTitle = titleOffset >= 0
        ? compactText.slice(titleOffset + title.length).trim()
        : compactText;
      const compactLocationMatches = [...afterTitle.matchAll(
        /(?=([A-Z][A-Za-z .'-]+,\s*(?:New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Australian Capital Territory|Northern Territory|NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia)\b[^\n]*))/g
      )].map((match) => match[1]);
      const broadCompactLocationMatches = getLinkedInGeoLocationMatches(afterTitle);
      const compactLocation = [...broadCompactLocationMatches, ...compactLocationMatches]
        .sort((a, b) => a.length - b.length)[0] ||
        afterTitle.match(/\b(?:remote|hybrid|onsite|on-site)\b/i)?.[0] ||
        "";
      const compactCompany = compactLocation
        ? cleanText(afterTitle.slice(0, afterTitle.indexOf(compactLocation)))
        : "";

      return {
        company: cleanInferredCompany(compactCompany, title),
        location: compactLocation
      };
    }

    function cleanInferredCompany(value, title = "") {
      let company = cleanText(value)
        .replace(/\u00c2\u00b7/g, "\u00b7")
        .replace(/^[\s\u00b7•|,-]+|[\s\u00b7•|,-]+$/g, "")
        .replace(/\b\d[\d,]*\+?\s+employees\b.*$/i, "")
        .replace(/\b(?:Actively recruiting|I'm interested|I’m interested)\b.*$/i, "")
        .replace(/\b(?:Viewed|Promoted|Apply|Save|Saved)\b.*$/i, "")
        .trim();

      if (title) {
        company = company
          .replace(new RegExp(`^${escapeRegExp(cleanText(title))}\\s*`, "i"), "")
          .trim();
      }

      return company
        .replace(/\s*(?:\u00b7|•|Â·)\s*$/g, "")
        .trim();
    }

    function isUsefulLinkedInCompany(value, title = "") {
      const company = cleanInferredCompany(value, title);
      const normalizedTitle = normalize(title);
      const normalizedCompany = normalize(company);

      return Boolean(company) &&
        company.length <= 120 &&
        normalizedCompany !== normalizedTitle &&
        !/\b(?:verified job|applicants?|people clicked apply|responses managed|viewed)\b/i.test(company) &&
        !(normalizedTitle && normalizedCompany.includes(normalizedTitle) && company.length > title.length + 30) &&
        !getLinkedInLocationPattern().test(company);
    }

    async function extractLinkedInRecommendationCard(profile) {
      console.log("[ARK Lens] attempted recommendation_card extraction");

      const adapterProfile = getLinkedInProfile(profile);
      const { links, candidates } = getRecommendationJobCandidates(adapterProfile);
      const requestedJobId = getLinkedInRequestedJobId(adapterProfile);
      const selected = requestedJobId
        ? candidates.find((candidate) => candidate.jobId === requestedJobId)
        : candidates.find((candidate) => candidate.selected);

      console.log("[ARK Lens] recommendation_card job links found", links.length);

      if (!selected) {
        return null;
      }

      const card = selected.card || getUsefulJobCard(selected.link);
      const rawNearbyText = card?.innerText || card?.textContent || selected.link.textContent || "";
      const nearbyText = cleanText(rawNearbyText);
      const inferred = inferCompanyAndLocation(selected.title, rawNearbyText);
      const platformState = getPlatformState(adapterProfile);

      if (!isUsefulLinkedInCompany(inferred.company, selected.title)) {
        return null;
      }

      console.log("[ARK Lens] selected recommendation_card", {
        title: selected.title,
        jobId: selected.jobId
      });

      return buildExtractedJob({
        title: selected.title,
        company: inferred.company,
        locationText: inferred.location,
        description: nearbyText,
        platformState,
        jobId: selected.jobId,
        url: getLinkedInRecordUrl(selected.jobId),
        selectorProfileId: "linkedin_jobs_recommendation_card_v1",
        adapterWarning: true,
        extractionMode: "recommendation_card",
        adapterProfile
      });
    }

    function getRecentClickedCollectionSnapshot() {
      if (
        recentClickedCollectionSnapshot &&
        Date.now() - recentClickedCollectionSnapshot.timestamp <= 3000
      ) {
        return recentClickedCollectionSnapshot;
      }

      recentClickedCollectionSnapshot = null;
      return null;
    }

    async function extractLinkedInCollectionsCard({
      allowFirstVisible = true,
      consumeRecentSnapshot = true,
      profile
    } = {}) {
      console.log("[ARK Lens] attempted collection_card extraction");

      const adapterProfile = getLinkedInProfile(profile);
      const jobId = getCurrentJobIdParam(location.href, adapterProfile);

      if (!isLinkedInCollectionsPage() || !jobId) {
        return null;
      }

      const recentSnapshot = getRecentClickedCollectionSnapshot();
      const candidates = allowFirstVisible ? getCollectionsCardCandidates(adapterProfile) : [];
      const usingRecentSnapshot = Boolean(
        recentSnapshot && (!recentSnapshot.jobId || recentSnapshot.jobId === jobId)
      );
      const selected = usingRecentSnapshot
        ? recentSnapshot
        : candidates.find((candidate) => candidate.jobId === jobId);

      if (
        !isUsefulLinkedInJobTitle(selected?.title) ||
        !selected.nearbyText ||
        selected.nearbyText.length < 20
      ) {
        console.log("[ARK Lens] collection_card extraction waiting for matching card", {
          jobId,
          candidateCount: candidates.length,
          selectedCandidateCount: candidates.filter((candidate) => candidate.selectedScore >= 35).length
        });
        return null;
      }

      const inferred = inferCompanyAndLocation(selected.title, selected.nearbyText);
      const platformState = getPlatformState(adapterProfile);

      if (!isUsefulLinkedInCompany(inferred.company, selected.title)) {
        console.log("[ARK Lens] collection_card extraction waiting for company", {
          jobId,
          title: selected.title
        });
        return null;
      }

      console.log("[ARK Lens] selected collection_card", {
        title: selected.title,
        jobId
      });

      const extracted = await buildExtractedJob({
        title: selected.title,
        company: inferred.company,
        locationText: inferred.location,
        description: selected.nearbyText,
        platformState,
        jobId,
        url: getLinkedInRecordUrl(jobId),
        selectorProfileId: "linkedin_jobs_collection_card_v1",
        adapterWarning: true,
        extractionMode: "collection_card",
        adapterProfile
      });

      if (usingRecentSnapshot && consumeRecentSnapshot) {
        recentClickedCollectionSnapshot = null;
      }

      return extracted;
    }

    async function extractCurrentLinkedInJob({
      logWaiting = false,
      allowCollectionFallback = true,
      consumeCollectionSnapshot = true,
      profile
    } = {}) {
      if (!isLinkedInJobsPage()) {
        console.log("[ARK Lens] not a LinkedIn Jobs page");
        return null;
      }

      const adapterProfile = getLinkedInProfile(profile);
      const detail = await extractLinkedInJobDetail(adapterProfile);

      if (detail) {
        return detail;
      }

      const card = await extractLinkedInRecommendationCard(adapterProfile);

      if (card) {
        return card;
      }

      const collectionCard = await extractLinkedInCollectionsCard({
        allowFirstVisible: allowCollectionFallback,
        consumeRecentSnapshot: consumeCollectionSnapshot,
        profile: adapterProfile
      });

      if (collectionCard) {
        return collectionCard;
      }

      if (logWaiting) {
        console.log("[ARK Lens] no job detail or recommendation card selected yet; listener waiting");
      }

      return null;
    }


    function rememberClickedCollectionCard(event) {
      if (!listenerActive || !isLinkedInCollectionsPage()) {
        return;
      }

      const workspace = firstMatchSelector(selectorsFromProfile(
        DEFAULT_PROFILE,
        "workspace_root",
        ["main#workspace"]
      ));
      const target = event?.target;

      if (!workspace || !target || !workspace.contains(target)) {
        return;
      }

      // Never let a failed new click reuse the previous card's title/company.
      recentClickedCollectionSnapshot = null;

      const titleHint = getCollectionTitleHintFromTarget(target);
      const directButton = target.closest?.("button");
      let snapshot = getCollectionsCardFromButton(
        directButton,
        DEFAULT_PROFILE
      );

      if (!snapshot) {
        const card = target.closest?.('li, article, [role="listitem"]');
        const dismissButton = card?.querySelector?.('button[aria-label^="Dismiss "]');
        snapshot = getCollectionsCardFromButton(
          dismissButton,
          DEFAULT_PROFILE
        ) || getCollectionsCardFromElement(
          card,
          DEFAULT_PROFILE,
          titleHint
        ) || findCollectionsCardFromTarget(
          target,
          DEFAULT_PROFILE,
          titleHint
        );
      }

      if (!snapshot) {
        snapshot = getCollectionsCardCandidates(DEFAULT_PROFILE)
          .find((candidate) => candidate.card?.contains?.(target));
      }

      if (!snapshot) {
        return;
      }

      recentClickedCollectionSnapshot = {
        title: snapshot.title,
        jobId: snapshot.jobId,
        nearbyText: snapshot.nearbyText,
        timestamp: Date.now()
      };
    }


    async function extractItem(_candidate, options = {}) {
      const extracted = await extractCurrentLinkedInJob(options);
      return jobAdapterResult.create("linkedin_jobs", extracted, { extractionResults, jobCompatibility, sourceAdaptersRuntime });
    }
    function discoverItems() {
      if (!isLinkedInJobsPage()) return [];
      return [{ item_id: getEffectiveLinkedInJobId() || null, item_type: "job", source_adapter_id: "linkedin_jobs" }];
    }
    function deriveItemId(candidate, result) {
      return result?.item?.item_id || candidate?.item_id || getEffectiveLinkedInJobId();
    }
    function selectorObservation(profile, selectorKey, required) {
      const selectors = selectorsFromProfile(profile, selectorKey);
      const roots = selectorKey === "detail_root" ? getLinkedInDomScopes() : getScopedRoots(profile);
      const count = roots.reduce((total, root) => total + selectors.reduce(
        (sum, selector) => sum + safeQuerySelectorAll(root, selector).length, 0), 0);
      return adapterDiagnostics.createSelectorObservation({ selector_key: selectorKey, matched: count > 0,
        match_count: count, required, observation: count > 0 ? "Selector structure matched." : "Selector structure was not observed." });
    }
    async function diagnose(options = {}) {
      const profile = getLinkedInProfile(options.profile), candidates = discoverItems();
      const definition = sourceAdaptersRuntime.getAdapterDefinition("linkedin_jobs");
      const extractionResult = await extractionResults.guardExtraction(
        () => extractItem(candidates[0] || null, { ...options, profile, logWaiting: false, consumeCollectionSnapshot: false }),
        { required_capabilities: definition.capabilities.required, optional_capabilities: definition.capabilities.optional });
      const selector_observations = [selectorObservation(profile,"detail_root",false), selectorObservation(profile,"title",true),
        selectorObservation(profile,"company",true), selectorObservation(profile,"description",true), selectorObservation(profile,"location",false)];
      return adapterDiagnostics.fromExtractionResult({ adapter_id:"linkedin_jobs", item_type:"job",
        location_supported:isLinkedInJobsPage(), structure_detected:selector_observations.some(x=>x.matched),
        discovered_item_count:candidates.length, extraction_result:extractionResult, selector_observations });
    }
    function recordSuccessfulExtraction(extracted) {
      if (extracted?.source?.id === "linkedin_jobs" && extracted.metadata?.extraction_mode === "job_detail" &&
        extracted._linkedinDetailSignature) lastCapturedLinkedInDetailSignature = extracted._linkedinDetailSignature;
    }
    function invalidateDomCache(){ linkedInDomScopesCache.timestamp = 0; }
    function resetTransientState(){ linkedInDomScopesCache={timestamp:0,scopes:[]}; recentClickedCollectionSnapshot=null; lastCapturedLinkedInDetailSignature=""; }
    return Object.freeze({ defaultProfile:DEFAULT_PROFILE, diagnose, discoverItems, deriveItemId, extractItem,
      extractRaw:extractCurrentLinkedInJob, findCollectionsCardFromTarget, getCollectionsCardCandidates,
      getCollectionsCardFromButton, getCollectionsCardFromElement, getDefaultProfile:getLinkedInProfile,
      getDomScopes:getLinkedInDomScopes, getEffectiveItemId:getEffectiveLinkedInJobId, getFallbackRoot,
      getJobDetailRoot:getLinkedInJobDetailRoot, getScopedRoots, getSelectors:selectorsFromProfile,
      getBestTitle, getBestCompany, getBestLocation, getDescription,
      getPlatformState, getJobIdFromUrlOrLinks, getRequestedJobId:getLinkedInRequestedJobId,
      isCollectionsPage:isLinkedInCollectionsPage,
      invalidateDomCache, recordSuccessfulExtraction, rememberClickedCollectionCard, resetTransientState });
  }
  return { DEFAULT_PROFILE, create };
});
