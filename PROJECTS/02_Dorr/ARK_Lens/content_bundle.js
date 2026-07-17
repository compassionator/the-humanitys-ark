// The async wrapper lets a reinjected bundle verify that the previous extension
// context is genuinely usable before reusing its listener.
(async () => {
  const CONTENT_BUNDLE_VERSION = "v2026.06.019-fixed-fit-columns";

  const existingContextHealthy = await (async () => {
    try {
      return typeof window.__arkLensProbeContext === "function" &&
        await window.__arkLensProbeContext();
    } catch (_error) {
      return false;
    }
  })();

  if (
    window.__arkLensInitialized &&
    window.__arkLensVersion === CONTENT_BUNDLE_VERSION &&
    existingContextHealthy
  ) {
    console.log("[ARK Lens] content bundle already initialized");
    return;
  }

  if (window.__arkLensInitialized) {
    try {
      window.__arkLensStopObserver?.();
      window.__arkLensRemoveMessageListener?.();
    } catch (error) {
      console.warn("[ARK Lens] previous content bundle cleanup failed", error);
    }
  }

  window.__arkLensInitialized = true;
  window.__arkLensVersion = CONTENT_BUNDLE_VERSION;
  console.log("[ARK Lens] content bundle initialized");

  // ============================================================
  // CONSTANTS
  // ============================================================

  const SCHEMA_VERSION = "v2026.06.001";
  const ADAPTER_VERSION = "v2026.06.003";

  const SESSION_KEY = "ark_lens_session";
  const RECORDS_KEY = "ark_lens_records";
  const LENS_PACKS_KEY = "ark_lens_packs";
  const ACTIVE_LENS_PACK_ID_KEY = "ark_lens_active_lens_pack_id";
  const ADAPTER_PROFILE_OVERRIDES_KEY = "ark_lens_adapter_profile_overrides";
  const ADAPTER_PROFILE_LAST_KNOWN_GOOD_KEY = "ark_lens_adapter_profile_last_known_good";
  const LENS_PACK_RUNTIME = globalThis.ARK_LENS_PACK_RUNTIME;
  const BUNDLED_LENS_PACK = globalThis.ARK_BUNDLED_LENS_PACK;

  if (!LENS_PACK_RUNTIME || !BUNDLED_LENS_PACK) {
    throw new Error("ARK Lens Pack runtime was not loaded before the content bundle.");
  }

  async function probeExtensionContext() {
    try {
      await chrome.storage.local.get(SESSION_KEY);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function isExtensionContextError(error) {
    const message = String(error?.message || error || "");

    return message.includes("Extension context invalidated") ||
      message.includes("chrome-extension://invalid") ||
      message.includes("Extension context was invalidated");
  }

  function isExtensionContextHealthy() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch (_error) {
      return false;
    }
  }

  function handleInvalidatedExtensionContext(error, source = "operation") {
    if (!isExtensionContextError(error)) {
      return false;
    }

    extensionContextInvalidated = true;
    console.warn(`[ARK Lens] ${source} stopped; extension context was reloaded`);

    try {
      stopObserver();
    } catch (_cleanupError) {
      // The context is already invalid; best effort cleanup only.
    }

    return true;
  }

  window.__arkLensIsContextHealthy = isExtensionContextHealthy;
  window.__arkLensProbeContext = probeExtensionContext;

  const SOURCE_ADAPTER_REGISTRY = {
    linkedin_jobs: {
      id: "linkedin_jobs",
      display_name: "LinkedIn Jobs",
      type: "job",
      status: "implemented",
      url_patterns: ["https://www.linkedin.com/jobs/*"],
      canHandleCurrentPage: () => isLinkedInJobsPage(),
      extractCurrentItem: (options) => extractCurrentLinkedInJob(options),
      getCurrentItemId: () => getEffectiveLinkedInJobId()
    },
    seek_jobs: {
      id: "seek_jobs",
      display_name: "SEEK Jobs",
      type: "job",
      status: "implemented",
      url_patterns: [
        "https://www.seek.com.au/*",
        "https://au.seek.com/*"
      ],
      canHandleCurrentPage: () => isSeekJobsPage(),
      extractCurrentItem: (options) => extractCurrentSeekJob(options),
      getCurrentItemId: () => getEffectiveSeekJobId()
    },
    hays_jobs: {
      id: "hays_jobs",
      display_name: "Hays Jobs",
      type: "job",
      status: "planned",
      url_patterns: ["https://www.hays.com.au/*"],
      canHandleCurrentPage: () => /(^|\.)hays\.com\.au$/i.test(location.hostname)
    }
  };

  const DEFAULT_ADAPTER_PROFILES = {
    linkedin_jobs: {
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
    },
    seek_jobs: {
      id: "seek_jobs_default_profile",
      adapter_id: "seek_jobs",
      version: "v2026.06.005d",
      display_name: "SEEK Jobs Default Profile",
      item_type: "job",
      fields: {
        detail_root: [
          "[data-automation=\"job-details-page\"]",
          "[data-automation=\"job-detail\"]",
          "[data-automation=\"splitViewJobDetailsWrapper\"]",
          "main"
        ],
        fallback_root: [
          "main",
          "body"
        ],
        title: [
          "[data-automation=\"job-detail-title\"]",
          "[data-automation=\"job-detail-title\"] h1",
          "[data-automation=\"jobTitle\"]",
          "h1"
        ],
        company: [
          "[data-automation=\"advertiser-name\"]",
          "[data-automation=\"job-detail-company\"]",
          "[data-automation=\"company-name\"]",
          "[data-automation=\"jobCompany\"]"
        ],
        location: [
          "[data-automation=\"job-detail-location\"]",
          "[data-automation=\"job-detail-location\"] a",
          "[data-automation=\"job-location\"]",
          "[data-automation=\"jobLocation\"]",
          "[data-automation=\"jobCardLocation\"]"
        ],
        posted: [
          "[data-automation=\"job-detail-date\"]",
          "[data-automation=\"job-detail-listed-date\"]",
          "[data-automation=\"jobListingDate\"]"
        ],
        work_type: [
          "[data-automation=\"job-detail-work-type\"]",
          "[data-automation=\"job-detail-work-arrangement\"]"
        ],
        salary: [
          "[data-automation=\"job-detail-salary\"]",
          "[data-automation=\"job-salary\"]",
          "[data-automation=\"jobSalary\"]"
        ],
        classification: [
          "[data-automation=\"job-detail-classifications\"]",
          "[data-automation=\"job-classification\"]",
          "[data-automation=\"jobClassification\"]",
          "[data-automation=\"jobSubClassification\"]",
          "[data-automation=\"searchClassification\"]"
        ],
        description: [
          "[data-automation=\"jobAdDetails\"]",
          "[data-automation=\"job-ad-details\"]",
          "[data-automation=\"job-detail-description\"]",
          "[data-automation=\"jobShortDescription\"]"
        ],
        apply_button: [
          "[data-automation=\"job-detail-apply\"]",
          "a[href*=\"/job/\"][href*=\"apply\"]",
          "a[href*=\"apply\"]",
          "button"
        ],
        recommendation_link: [
          "a[href*=\"/job/\"]"
        ]
      },
      job_id: {
        url_patterns: [
          "/job/<id>"
        ],
        query_params: [
          "jobId"
        ],
        link_selectors: [
          "a[href*=\"/job/\"]"
        ]
      },
      readiness: {
        min_description_length: 50,
        allow_applied_without_description: false
      }
    }
  };

  // ============================================================
  // UTILS
  // ============================================================

  function cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  async function sha256(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text || "");
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);

    return [...new Uint8Array(hashBuffer)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function normalize(text) {
    return (text || "").toLowerCase();
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

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // ============================================================
  // STORAGE
  // ============================================================

  async function getSession() {
    const result = await chrome.storage.local.get(SESSION_KEY);

    return result[SESSION_KEY] || {
      active: false,
      session_id: null,
      started_at: null
    };
  }

  async function getRecords() {
    const result = await chrome.storage.local.get(RECORDS_KEY);
    return result[RECORDS_KEY] || {};
  }

  function cloneDefaultAdapterProfile(adapterId) {
    const profile = DEFAULT_ADAPTER_PROFILES[adapterId];
    return profile ? JSON.parse(JSON.stringify(profile)) : null;
  }

  function isPlainObject(value) {
    return Boolean(value) &&
      typeof value === "object" &&
      !Array.isArray(value);
  }

  function validateAdapterStringArray(value, path, errors, options) {
    options = options || {};
    const add = (message) => errors.push({ path, message });

    if (!Array.isArray(value) || value.length === 0) {
      add("must be a non-empty array");
      return;
    }
    if (value.length > 100) {
      add("must contain no more than 100 entries");
    }
    if (new Set(value).size !== value.length) {
      add("must not contain duplicate entries");
    }

    value.forEach((entry, index) => {
      const entryPath = `${path}[${index}]`;

      if (typeof entry !== "string" || !entry.trim()) {
        errors.push({ path: entryPath, message: "must be a non-empty string" });
        return;
      }
      if (entry.length > 500) {
        errors.push({ path: entryPath, message: "must be 500 characters or fewer" });
      }
      if (options.selector) {
        const selectorError = validateAdapterSelector(entry);
        if (selectorError) errors.push({ path: entryPath, message: selectorError });
      }
      if (
        options.queryParam &&
        !/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(entry)
      ) {
        errors.push({ path: entryPath, message: "must be a plain query parameter name" });
      }
    });
  }

  function validateAdapterSelector(selector) {
    const classNames = String(selector || "").match(/\.-?[_a-zA-Z][\w-]*/g) || [];
    const hasHashedClassName = classNames.some((className) =>
      /^_?[a-f0-9]{8,}$/i.test(className.slice(1))
    );

    if (hasHashedClassName) {
      return "must not use a hashed class name; use stable semantic attributes";
    }
    if (/[<>]/.test(selector)) {
      return "must be a CSS selector, not HTML";
    }

    try {
      document.querySelector(selector);
      return "";
    } catch (_error) {
      return "must be a valid CSS selector";
    }
  }

  function validateAdapterRepairProfile(profile, adapterId) {
    const errors = [];
    const add = (path, message) => errors.push({ path, message });
    const allowedTopLevel = new Set([
      "id",
      "adapter_id",
      "version",
      "display_name",
      "item_type",
      "fields",
      "job_id",
      "readiness"
    ]);
    const allowedFieldIds = new Set([
      "detail_root",
      "fallback_root",
      "title",
      "company",
      "location",
      "description",
      "applied_message",
      "applied_link",
      "apply_button",
      "workspace_root",
      "recommendation_link",
      "posted",
      "work_type",
      "salary",
      "classification"
    ]);
    const requiredFieldIds = [
      "detail_root",
      "fallback_root",
      "title",
      "company",
      "location",
      "description",
      "apply_button",
      "recommendation_link"
    ];

    if (!isPlainObject(profile)) {
      add("$", "must be a JSON object");
      return { valid: false, errors };
    }

    Object.keys(profile).forEach((key) => {
      if (!allowedTopLevel.has(key)) add(`$.${key}`, "is not allowed");
    });

    if (
      typeof profile.id !== "string" ||
      !/^[a-z0-9][a-z0-9_-]{2,79}$/.test(profile.id)
    ) {
      add("$.id", "must be 3-80 lowercase letters, numbers, underscores, or hyphens");
    }
    if (profile.adapter_id !== adapterId) {
      add("$.adapter_id", `must equal detected adapter ${adapterId || "unknown"}`);
    }
    ["version", "display_name"].forEach((field) => {
      if (typeof profile[field] !== "string" || !profile[field].trim()) {
        add(`$.${field}`, "must be a non-empty string");
      }
    });
    if (typeof profile.version === "string" && profile.version.length > 80) {
      add("$.version", "must be 80 characters or fewer");
    }
    if (typeof profile.display_name === "string" && profile.display_name.length > 120) {
      add("$.display_name", "must be 120 characters or fewer");
    }
    if (profile.item_type !== "job") {
      add("$.item_type", "must equal job");
    }

    if (!isPlainObject(profile.fields)) {
      add("$.fields", "must be an object");
    } else {
      Object.keys(profile.fields).forEach((fieldId) => {
        if (!allowedFieldIds.has(fieldId)) {
          add(`$.fields.${fieldId}`, "is not an allowed extraction field");
        }
      });
      requiredFieldIds.forEach((fieldId) => {
        validateAdapterStringArray(
          profile.fields[fieldId],
          `$.fields.${fieldId}`,
          errors,
          { selector: true }
        );
      });
      Object.entries(profile.fields).forEach(([fieldId, selectors]) => {
        if (requiredFieldIds.includes(fieldId) || !allowedFieldIds.has(fieldId)) return;
        validateAdapterStringArray(selectors, `$.fields.${fieldId}`, errors, { selector: true });
      });
    }

    if (!isPlainObject(profile.job_id)) {
      add("$.job_id", "must be an object");
    } else {
      Object.keys(profile.job_id).forEach((key) => {
        if (!["url_patterns", "query_params", "link_selectors"].includes(key)) {
          add(`$.job_id.${key}`, "is not allowed");
        }
      });
      validateAdapterStringArray(
        profile.job_id.url_patterns,
        "$.job_id.url_patterns",
        errors
      );
      validateAdapterStringArray(
        profile.job_id.query_params,
        "$.job_id.query_params",
        errors,
        { queryParam: true }
      );
      validateAdapterStringArray(
        profile.job_id.link_selectors,
        "$.job_id.link_selectors",
        errors,
        { selector: true }
      );
    }

    if (!isPlainObject(profile.readiness)) {
      add("$.readiness", "must be an object");
    } else {
      Object.keys(profile.readiness).forEach((key) => {
        if (!["min_description_length", "allow_applied_without_description"].includes(key)) {
          add(`$.readiness.${key}`, "is not allowed");
        }
      });
      if (
        !Number.isInteger(profile.readiness.min_description_length) ||
        profile.readiness.min_description_length < 0 ||
        profile.readiness.min_description_length > 10000
      ) {
        add("$.readiness.min_description_length", "must be an integer from 0 to 10000");
      }
      if (typeof profile.readiness.allow_applied_without_description !== "boolean") {
        add("$.readiness.allow_applied_without_description", "must be true or false");
      }
    }

    return { valid: errors.length === 0, errors };
  }

  function formatAdapterRepairValidationErrors(result, limit = 8) {
    if (result.valid) return "Repair File is valid.";

    const shown = result.errors
      .slice(0, limit)
      .map((error) => `- ${error.path}: ${error.message}`);
    const remaining = result.errors.length - shown.length;

    return [
      "Repair File validation failed:",
      ...shown,
      remaining > 0 ? `- ...and ${remaining} more error(s)` : ""
    ].filter(Boolean).join("\n");
  }

  function redactUrlForHelpFile(value) {
    try {
      const parsed = new URL(String(value || ""));
      if (!/^https?:$/.test(parsed.protocol)) return "";
      return `${parsed.origin}${parsed.pathname}`;
    } catch (_error) {
      return "";
    }
  }

  function redactPersonalText(value) {
    return String(value || "")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
      .replace(/(?:\+?61|0)[\s().-]*(?:\d[\s().-]*){8,10}\d/g, "[redacted phone]");
  }

  function deepMergeProfile(base, override) {
    if (!isPlainObject(base)) {
      return isPlainObject(override) ? { ...override } : override;
    }

    if (!isPlainObject(override)) {
      return { ...base };
    }

    return Object.entries(override).reduce((merged, [key, value]) => {
      if (isPlainObject(value) && isPlainObject(merged[key])) {
        merged[key] = deepMergeProfile(merged[key], value);
      } else {
        merged[key] = Array.isArray(value) ? [...value] : value;
      }

      return merged;
    }, { ...base });
  }

  function isValidAdapterProfile(profile, adapterId) {
    return validateAdapterRepairProfile(profile, adapterId).valid;
  }

  async function getAdapterProfile(adapterId) {
    const { profile } = await getAdapterProfileWithSource(adapterId);
    return profile;
  }

  async function getAdapterProfileWithSource(adapterId) {
    const defaultProfile = cloneDefaultAdapterProfile(adapterId);

    if (!defaultProfile) {
      console.warn("[ARK Lens] no default adapter profile found", { adapter_id: adapterId });
      return { profile: null, profile_source: "default" };
    }

    try {
      const result = await chrome.storage.local.get(ADAPTER_PROFILE_OVERRIDES_KEY);
      const overrides = result[ADAPTER_PROFILE_OVERRIDES_KEY] || {};
      const override = overrides[adapterId];

      if (!override) {
        return { profile: defaultProfile, profile_source: "default" };
      }

      const merged = deepMergeProfile(defaultProfile, override);

      if (!isValidAdapterProfile(merged, adapterId)) {
        console.warn("[ARK Lens] adapter profile override invalid; using default", {
          adapter_id: adapterId
        });
        return { profile: defaultProfile, profile_source: "default" };
      }

      return { profile: merged, profile_source: "override" };
    } catch (error) {
      console.warn("[ARK Lens] adapter profile load failed; using default", {
        adapter_id: adapterId,
        error
      });
      return { profile: defaultProfile, profile_source: "default" };
    }
  }

  function cloneDefaultLensPack() {
    return LENS_PACK_RUNTIME.clone(BUNDLED_LENS_PACK);
  }

  function normalizeLensPack(lensPack) {
    return LENS_PACK_RUNTIME.migrateLensPack(lensPack, BUNDLED_LENS_PACK);
  }

  async function ensureLensPackStorage() {
    const result = await chrome.storage.local.get([
      LENS_PACKS_KEY,
      ACTIVE_LENS_PACK_ID_KEY
    ]);
    const migrated = LENS_PACK_RUNTIME.migrateLensPackStorage(
      result[LENS_PACKS_KEY],
      result[ACTIVE_LENS_PACK_ID_KEY],
      BUNDLED_LENS_PACK
    );

    if (migrated.changed) {
      await chrome.storage.local.set({
        [LENS_PACKS_KEY]: migrated.packs,
        [ACTIVE_LENS_PACK_ID_KEY]: migrated.activeId
      });
    }

    return { packs: migrated.packs, activeId: migrated.activeId };
  }

  async function getActiveLensPack() {
    const { packs, activeId } = await ensureLensPackStorage();
    return normalizeLensPack(packs?.[activeId]);
  }

  function getRecordCaptureQuality(record) {
    const mode = record?.metadata?.extraction_mode || "";
    const fullTextLength = cleanText(record?.content?.full_text || "").length;
    const modeScore = mode === "job_detail" || mode === "seek_job_detail"
      ? 50
      : mode === "search_result_cache"
        ? 20
        : 0;

    return modeScore +
      Math.min(60, Math.floor(fullTextLength / 100)) +
      (record?.display?.secondary_text ? 10 : 0) +
      (record?.display?.tertiary_text ? 5 : 0) +
      (record?.capture?.adapter_warning ? 0 : 10);
  }

  function preserveRicherExistingRecord(existing, incoming) {
    if (!existing || getRecordCaptureQuality(incoming) >= getRecordCaptureQuality(existing)) {
      return incoming;
    }

    return {
      ...incoming,
      source: {
        ...existing.source,
        ...incoming.source,
        url: incoming.source?.url || existing.source?.url || ""
      },
      entity: existing.entity,
      display: existing.display,
      content: existing.content,
      platform_state: incoming.platform_state?.applied
        ? incoming.platform_state
        : existing.platform_state,
      capture: existing.capture,
      classification: existing.classification,
      metadata: existing.metadata
    };
  }

  async function saveRecord(record) {
    const records = await getRecords();
    const existing = records[record.record_id];

    if (existing) {
      record = preserveRicherExistingRecord(existing, record);
      record.memory = {
        ...existing.memory,
        last_seen_at: new Date().toISOString(),
        seen_count: (existing.memory?.seen_count || 1) + 1,
        user_workflow_override: existing.memory?.user_workflow_override ?? null,
        notes: existing.memory?.notes || ""
      };
    }

    records[record.record_id] = record;

    await chrome.storage.local.set({
      [RECORDS_KEY]: records
    });

    await updateActiveSessionAfterSave(record);
  }

  async function updateActiveSessionAfterSave(record) {
    const session = await getSession();

    if (!session.active) {
      return;
    }

    await chrome.storage.local.set({
      [SESSION_KEY]: {
        ...session,
        last_captured_job_id: record.source?.source_item_id || null,
        last_captured_title: record.display?.primary_text || "",
        captured_count: (session.captured_count || 0) + 1,
        last_capture_at: new Date().toISOString()
      }
    });
  }

  // ============================================================
  // LINKEDIN JOBS ADAPTER
  // DOM extraction only. No DORR logic here.
  // ============================================================

  function getLinkedInProfile(profile) {
    return profile || DEFAULT_ADAPTER_PROFILES.linkedin_jobs;
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
          lastObservedJobId === `linkedin_jobs:${desiredJobId}`;

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

  function getSeekJobIdFromHref(href) {
    const hrefMatch = (href || "").match(/\/job\/(\d+)/);
    return hrefMatch?.[1] || null;
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
    return /(^|\.)linkedin\.com$/i.test(location.hostname) &&
      location.pathname.includes("/jobs");
  }

  function isSeekJobsPage() {
    const hasSeekJobId = Boolean(getCurrentJobIdParam(location.href, DEFAULT_ADAPTER_PROFILES.seek_jobs));

    return /(^|\.)seek\.com(\.au)?$/i.test(location.hostname) &&
      (
        /^\/job\/\d+/.test(location.pathname) ||
        /^\/jobs(?:-|\/|$)/.test(location.pathname) ||
        hasSeekJobId
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

  function buildExtractedJob({
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
    const profile = getLinkedInProfile(adapterProfile);

    return sha256(fullText).then((contentHash) => ({
      source: {
        id: sourceId,
        adapter_version: ADAPTER_VERSION,
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
    }));
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

  function getCollectionsCardFromElement(card, profile = DEFAULT_ADAPTER_PROFILES.linkedin_jobs, titleHint = "") {
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

  function findCollectionsCardFromTarget(target, profile = DEFAULT_ADAPTER_PROFILES.linkedin_jobs, titleHint = "") {
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

  function getCollectionsCardFromButton(button, profile = DEFAULT_ADAPTER_PROFILES.linkedin_jobs) {
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
    const profile = DEFAULT_ADAPTER_PROFILES.linkedin_jobs;
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
      /\b(?:remote|hybrid|onsite|on-site)\b|(?:[A-Z][A-Za-z .'-]+,\s*(?:New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Australian Capital Territory|Northern Territory|NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia)\b[^·\n]*)/i;
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
      /(?=([A-Z][A-Za-z .'-]+,\s*(?:New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Australian Capital Territory|Northern Territory|NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia)\b[^·\n]*))/g
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

  // ============================================================
  // SEEK JOBS ADAPTER
  // DOM extraction only. No DORR logic here.
  // ============================================================

  function getSeekProfile(profile) {
    return profile || DEFAULT_ADAPTER_PROFILES.seek_jobs;
  }

  function getSeekJobIdFromUrlOrLinks(profile) {
    const currentJobId = getCurrentJobIdParam(location.href, profile);
    if (currentJobId) return currentJobId;

    const urlJobId = getSeekJobIdFromHref(location.href);
    if (urlJobId) return urlJobId;

    const linkSelectors = getSeekProfile(profile)?.job_id?.link_selectors || [
      "a[href*=\"/job/\"]"
    ];

    for (const root of getScopedRoots(profile)) {
      for (const selector of linkSelectors) {
        const selectedLink = safeQuerySelector(root, selector);
        const href = selectedLink?.href || "";
        const hrefMatch = getSeekJobIdFromHref(href) || getCurrentJobIdParam(href, profile);

        if (hrefMatch) return hrefMatch;
      }
    }

    return null;
  }

  function extractJsonObjectAfterMarker(text, marker) {
    const markerIndex = text.indexOf(marker);

    if (markerIndex < 0) {
      return null;
    }

    const start = text.indexOf("{", markerIndex);

    if (start < 0) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }

        continue;
      }

      if (char === "\"") {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          return text.slice(start, index + 1);
        }
      }
    }

    return null;
  }

  function getSeekApolloData() {
    const scripts = safeQuerySelectorAll(document, "script");

    for (const script of scripts) {
      const text = script.textContent || "";

      if (!text.includes("window.SEEK_APOLLO_DATA")) {
        continue;
      }

      const jsonText = extractJsonObjectAfterMarker(text, "window.SEEK_APOLLO_DATA");

      if (!jsonText) {
        continue;
      }

      try {
        return JSON.parse(jsonText);
      } catch (error) {
        console.warn("[ARK Lens] SEEK Apollo data parse failed", error);
      }
    }

    return null;
  }

  function resolveSeekRef(data, value) {
    if (Array.isArray(value)) {
      return value.map((item) => resolveSeekRef(data, item));
    }

    if (value && typeof value === "object" && value.__ref) {
      return resolveSeekRef(data, data[value.__ref]);
    }

    return value;
  }

  function getSeekListingDateLabel(listingDate) {
    if (!listingDate || typeof listingDate !== "object") {
      return "";
    }

    const labelKey = Object.keys(listingDate).find((key) => key.startsWith("label("));
    return cleanText(listingDate.label || listingDate[labelKey] || "");
  }

  function findSeekApolloJob(jobId) {
    const data = getSeekApolloData();

    if (!data || !jobId) {
      return null;
    }

    const values = Object.values(data);
    return values.find((value) =>
      value &&
      typeof value === "object" &&
      value.__typename === "JobSearchV6Data" &&
      (String(value.id || "") === String(jobId) ||
        String(value.solMetadata?.jobId || "") === String(jobId))
    ) || null;
  }

  function getSeekClassificationText(job) {
    const data = getSeekApolloData();
    const classifications = resolveSeekRef(data, job?.classifications || []);
    const labels = [];

    classifications.forEach((item) => {
      const classification = resolveSeekRef(data, item?.classification);
      const subclassification = resolveSeekRef(data, item?.subclassification);

      if (classification?.description) {
        labels.push(classification.description);
      }

      if (subclassification?.description) {
        labels.push(subclassification.description);
      }
    });

    return labels.filter(Boolean).join(" · ");
  }

  function getSeekApolloJobFields(jobId) {
    const job = findSeekApolloJob(jobId);

    if (!job) {
      return null;
    }

    const locations = resolveSeekRef(getSeekApolloData(), job.locations || []);
    const posted = getSeekListingDateLabel(job.listingDate);
    const locationText = locations.map((item) => item?.label).filter(Boolean).join(" · ");
    const workType = (job.workTypes || []).filter(Boolean).join(" · ");
    const salary = cleanText(job.salaryLabel || "");
    const classification = getSeekClassificationText(job);
    const description = cleanText([
      job.teaser,
      ...(job.bulletPoints || [])
    ].filter(Boolean).join(" "));

    return {
      title: cleanText(job.title || ""),
      company: cleanText(job.companyName || job.advertiser?.description || ""),
      locationText,
      posted,
      workType,
      salary,
      classification,
      description,
      jobId: String(job.id || jobId || ""),
      extractionMode: "search_result_cache"
    };
  }

  function getEffectiveSeekJobId() {
    const profile = DEFAULT_ADAPTER_PROFILES.seek_jobs;
    return getSeekJobIdFromUrlOrLinks(profile);
  }

  function getSeekRecordUrl(jobId) {
    try {
      const currentUrl = new URL(location.href);

      if (currentUrl.searchParams.get("jobId")) {
        return currentUrl.href;
      }

      if (jobId) {
        return `${currentUrl.origin}/job/${encodeURIComponent(jobId)}`;
      }

      return currentUrl.href;
    } catch (_error) {
      return jobId ? `https://au.seek.com/job/${encodeURIComponent(jobId)}` : location.href;
    }
  }

  function getSeekText(profile, fieldName, minimumLength = 1) {
    return firstScopedText(selectorsFromProfile(profile, fieldName), minimumLength, profile);
  }

  function getSeekPlatformState(profile) {
    const roots = getScopedRoots(profile);
    const applyButtonSelectors = selectorsFromProfile(profile, "apply_button", [
      "a[href*=\"apply\"]",
      "button"
    ]);
    const applyButton = roots
      .flatMap((root) =>
        applyButtonSelectors.flatMap((selector) => safeQuerySelectorAll(root, selector))
      )
      .find((el) => {
        const text = cleanText(el.textContent);
        const aria = cleanText(el.getAttribute("aria-label"));
        const href = cleanText(el.getAttribute("href"));
        const values = [text, aria, href].map(normalize);

        return values.some((value) =>
          value === "apply" ||
          value.includes("apply now") ||
          value.includes("apply for") ||
          value.includes("apply")
        );
      });

    return {
      applied: false,
      applied_text: "",
      can_apply: Boolean(applyButton),
      apply_text: applyButton
        ? cleanText(applyButton.getAttribute("aria-label") || applyButton.textContent || "Apply")
        : ""
    };
  }

  async function extractCurrentSeekJob({ profile } = {}) {
    if (!isSeekJobsPage()) {
      console.log("[ARK Lens] not a SEEK Jobs page");
      return null;
    }

    console.log("[ARK Lens] attempted seek_job_detail extraction");

    const adapterProfile = getSeekProfile(profile);
    const jobId = getSeekJobIdFromUrlOrLinks(adapterProfile);
    const apolloFields = getSeekApolloJobFields(jobId);
    const title = apolloFields?.title || getSeekText(adapterProfile, "title");
    const company = apolloFields?.company || getSeekText(adapterProfile, "company");
    const locationText = apolloFields?.locationText || getSeekText(adapterProfile, "location");
    const posted = apolloFields?.posted || getSeekText(adapterProfile, "posted");
    const workType = apolloFields?.workType || getSeekText(adapterProfile, "work_type");
    const salary = apolloFields?.salary || getSeekText(adapterProfile, "salary");
    const classification = apolloFields?.classification || getSeekText(adapterProfile, "classification");
    const domDescription = getSeekText(adapterProfile, "description", 30);
    const apolloDescription = apolloFields?.description || "";
    const description = [domDescription, apolloDescription]
      .sort((a, b) => b.length - a.length)[0] || "";
    const extractionMode = domDescription && domDescription.length >= apolloDescription.length
      ? "job_detail"
      : apolloFields?.extractionMode || "job_detail";
    const platformState = getSeekPlatformState(adapterProfile);
    const minDescriptionLength =
      adapterProfile.readiness?.min_description_length ?? 50;
    const metadataParts = [
      locationText,
      posted,
      workType,
      salary
    ].filter(Boolean);
    const tertiaryText = metadataParts.join(" · ");
    const ready =
      title &&
      company &&
      description.length >= minDescriptionLength;

    if (!ready) {
      const missingFields = [
        !title ? "title" : "",
        !company ? "company" : "",
        description.length < minDescriptionLength ? "description" : ""
      ].filter(Boolean);

      console.log("[ARK Lens] seek_job_detail extraction not ready", {
        title,
        company,
        descriptionLength: description.length,
        minDescriptionLength,
        missingFields
      });

      return null;
    }

    return buildExtractedJob({
      title,
      company,
      locationText: tertiaryText || locationText,
      description,
      platformState,
      jobId,
      url: getSeekRecordUrl(jobId),
      selectorProfileId: "seek_jobs_v1",
      adapterWarning: !description || description.length < minDescriptionLength,
      extractionMode,
      adapterProfile,
      sourceId: "seek_jobs",
      metadata: {
        raw_location_text: locationText,
        posted,
        work_type: workType,
        salary,
        classification
      }
    });
  }

  // ============================================================
  // ADAPTER DOCTOR
  // ============================================================

  function previewText(value, maxLength = 500) {
    const text = cleanText(value || "");
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  }

  function selectorDiagnosticsForDocument(fieldName, selectors) {
    const tried = Array.isArray(selectors) ? selectors : [];
    let firstMatchedSelector = "";
    let firstText = "";
    let matchedCount = 0;

    tried.forEach((selector) => {
      const matches = safeQuerySelectorAll(document, selector);
      matchedCount += matches.length;

      if (!firstMatchedSelector && matches.length > 0) {
        firstMatchedSelector = selector;
        firstText = matches[0]?.innerText || matches[0]?.textContent || "";
      }
    });

    return {
      field: fieldName,
      selectors_tried: tried,
      first_matched_selector: firstMatchedSelector,
      matched_count: matchedCount,
      extracted_text_preview: previewText(firstText)
    };
  }

  function selectorDiagnosticsForRoots(fieldName, selectors, roots) {
    const tried = Array.isArray(selectors) ? selectors : [];
    let firstMatchedSelector = "";
    let firstText = "";
    let matchedCount = 0;

    roots.forEach((root) => {
      tried.forEach((selector) => {
        const matches = safeQuerySelectorAll(root, selector);
        matchedCount += matches.length;

        if (!firstMatchedSelector && matches.length > 0) {
          firstMatchedSelector = selector;
          firstText = matches[0]?.innerText || matches[0]?.textContent || "";
        }
      });
    });

    return {
      field: fieldName,
      selectors_tried: tried,
      first_matched_selector: firstMatchedSelector,
      matched_count: matchedCount,
      extracted_text_preview: previewText(firstText)
    };
  }

  function getLinkedInCollectionDiagnostics(profile) {
    const adapterProfile = getLinkedInProfile(profile);
    const workspace = firstMatchSelector(selectorsFromProfile(adapterProfile, "workspace_root", [
      "main#workspace"
    ]));
    const jobId = getCurrentJobIdParam(location.href, adapterProfile);

    if (!workspace || !isLinkedInCollectionsPage()) {
      return [];
    }

    const candidates = getCollectionsCardCandidates(adapterProfile);
    const selected = candidates.find((candidate) => candidate.jobId === jobId);
    const selectedCount = candidates.filter((candidate) =>
      candidate.selectedScore >= 35
    ).length;
    const identityMap = candidates.slice(0, 10).map((candidate) => ({
      job_id: candidate.jobId || "",
      title: candidate.title || "",
      card_preview: previewText(candidate.nearbyText || "", 160)
    }));

    return [
      {
        field: "collection_card_candidate",
        selectors_tried: ["main#workspace button"],
        first_matched_selector: candidates.length ? "main#workspace button" : "",
        matched_count: candidates.length,
        extracted_text_preview: previewText(selected?.nearbyText || candidates[0]?.nearbyText || "")
      },
      {
        field: "collection_selected_card",
        selectors_tried: [
          '[aria-current="true"]',
          '[aria-selected="true"]',
          "text: Active job"
        ],
        first_matched_selector: selected ? "collection_card" : "",
        matched_count: selectedCount,
        extracted_text_preview: selected
          ? previewText(`${selected.title} ${selected.nearbyText || ""}`)
          : ""
      },
      {
        field: "collection_job_identity_map",
        selectors_tried: ['a[href*="currentJobId="], a[href*="/jobs/view/"]'],
        first_matched_selector: identityMap.some((candidate) => candidate.job_id)
          ? "linked card identity"
          : "",
        matched_count: identityMap.filter((candidate) => candidate.job_id).length,
        extracted_text_preview: previewText(JSON.stringify(identityMap), 500)
      }
    ];
  }

  function getSelectorDiagnostics(profile) {
    if (!profile) {
      return [];
    }

    const roots = getScopedRoots(profile);
    const workspace = firstMatchSelector(selectorsFromProfile(profile, "workspace_root", [
      "main#workspace"
    ]));
    const baseFields = [
      "title",
      "company",
      "location",
      "description",
      "applied_message",
      "applied_link",
      "apply_button"
    ];
    const extraFields = Object.keys(profile.fields || {})
      .filter((fieldName) =>
        ![
          "detail_root",
          "fallback_root",
          "workspace_root",
          "recommendation_link",
          ...baseFields
        ].includes(fieldName)
      );

    const diagnostics = [
      selectorDiagnosticsForDocument("detail_root", selectorsFromProfile(profile, "detail_root")),
      selectorDiagnosticsForDocument("fallback_root", selectorsFromProfile(profile, "fallback_root")),
      ...baseFields.map((fieldName) =>
        selectorDiagnosticsForRoots(fieldName, selectorsFromProfile(profile, fieldName), roots)
      ),
      ...extraFields.map((fieldName) =>
        selectorDiagnosticsForRoots(fieldName, selectorsFromProfile(profile, fieldName), roots)
      ),
      selectorDiagnosticsForRoots(
        "recommendation_link",
        selectorsFromProfile(profile, "recommendation_link"),
        workspace ? [workspace] : []
      )
    ];

    return getLinkedInProfile(profile)?.adapter_id === "linkedin_jobs"
      ? [...diagnostics, ...getLinkedInCollectionDiagnostics(profile)]
      : diagnostics;
  }

  function getLinkedInDoctorFieldPreview(profile) {
    const adapterProfile = getLinkedInProfile(profile);
    const currentJobId = getEffectiveLinkedInJobId();
    const detailRoot = getLinkedInJobDetailRoot(adapterProfile);

    if (!detailRoot) {
      const missingFields = [
        "title",
        "company",
        "description",
        !currentJobId ? "job_id" : ""
      ].filter(Boolean);

      return {
        ready: false,
        missing_fields: missingFields,
        fields: {
          title: "",
          company: "",
          location: "",
          description_preview: "",
          job_id: currentJobId || "",
          url: location.href,
          applied: false
        }
      };
    }

    const title = getBestTitle(adapterProfile);
    const company = getBestCompany(adapterProfile);
    const locationText = getBestLocation(adapterProfile);
    const description = getDescription(adapterProfile);
    const platformState = getPlatformState(adapterProfile);
    const jobId = getJobIdFromUrlOrLinks(adapterProfile);
    const minDescriptionLength =
      adapterProfile.readiness?.min_description_length ?? 50;
    const allowAppliedWithoutDescription =
      adapterProfile.readiness?.allow_applied_without_description !== false;
    const missingFields = [
      !title ? "title" : "",
      !company ? "company" : "",
      description.length < minDescriptionLength &&
        !(allowAppliedWithoutDescription && platformState.applied === true)
        ? "description"
        : "",
      !jobId ? "job_id" : ""
    ].filter(Boolean);

    return {
      ready: missingFields.length === 0,
      missing_fields: missingFields,
      fields: {
        title,
        company,
        location: locationText,
        description_preview: previewText(description),
        job_id: jobId,
        url: location.href,
        applied: platformState.applied
      }
    };
  }

  function getSeekDoctorFieldPreview(profile) {
    const adapterProfile = getSeekProfile(profile);
    const jobId = getSeekJobIdFromUrlOrLinks(adapterProfile);
    const apolloFields = getSeekApolloJobFields(jobId);
    const title = apolloFields?.title || getSeekText(adapterProfile, "title");
    const company = apolloFields?.company || getSeekText(adapterProfile, "company");
    const locationText = apolloFields?.locationText || getSeekText(adapterProfile, "location");
    const description = apolloFields?.description || getSeekText(adapterProfile, "description", 30);
    const platformState = getSeekPlatformState(adapterProfile);
    const minDescriptionLength =
      adapterProfile.readiness?.min_description_length ?? 50;
    const missingFields = [
      !title ? "title" : "",
      !company ? "company" : "",
      description.length < minDescriptionLength ? "description" : "",
      !jobId ? "job_id" : ""
    ].filter(Boolean);

    return {
      ready: missingFields.length === 0,
      missing_fields: missingFields,
      fields: {
        title,
        company,
        location: locationText,
        description_preview: previewText(description),
        job_id: jobId,
        url: location.href,
        applied: platformState.applied
      }
    };
  }

  async function getAdapterDoctorContext(candidateProfile = null) {
    const adapter = getCurrentSourceAdapter();
    const activeLensPack = await getActiveLensPack();
    const supportedByActiveLens = adapter
      ? isSourceAdapterAllowedByLens(adapter.id, activeLensPack)
      : false;
    const candidateValidation = adapter && candidateProfile
      ? validateAdapterRepairProfile(candidateProfile, adapter.id)
      : null;
    const profileResult = adapter
      ? candidateProfile
        ? {
            profile: candidateValidation.valid
              ? JSON.parse(JSON.stringify(candidateProfile))
              : null,
            profile_source: "candidate"
          }
        : await getAdapterProfileWithSource(adapter.id)
      : { profile: null, profile_source: "default" };

    return {
      adapter,
      activeLensPack,
      supportedByActiveLens,
      profile: profileResult.profile,
      profile_source: profileResult.profile_source,
      candidate_validation: candidateValidation
    };
  }

  async function getAdapterDoctorStatus(candidateProfile = null) {
    const { adapter, supportedByActiveLens, profile, profile_source } =
      await getAdapterDoctorContext(candidateProfile);

    if (!adapter) {
      return {
        ok: false,
        url: location.href,
        source_adapter_id: null,
        source_adapter_display_name: "Unsupported page",
        adapter_status: "unsupported",
        adapter_profile_id: null,
        adapter_profile_version: null,
        profile_source: "default",
        supported_by_active_lens: false,
        message: "No source adapter matches this page."
      };
    }

    return {
      ok: adapter.status === "implemented" && Boolean(profile),
      url: location.href,
      source_adapter_id: adapter.id,
      source_adapter_display_name: adapter.display_name,
      adapter_status: adapter.status,
      adapter_profile_id: profile?.id || null,
      adapter_profile_version: profile?.version || null,
      profile_source,
      supported_by_active_lens: supportedByActiveLens,
      message: adapter.status === "implemented"
        ? "Source adapter detected."
        : "This source adapter is planned and not implemented yet."
    };
  }

  async function testAdapterDoctorExtraction(candidateProfile = null) {
    const { adapter, supportedByActiveLens, profile } =
      await getAdapterDoctorContext(candidateProfile);

    if (!adapter) {
      return {
        ok: false,
        source_adapter_id: null,
        adapter_profile_id: null,
        adapter_profile_version: null,
        extraction_mode: null,
        ready: false,
        missing_fields: [],
        fields: {},
        selector_diagnostics: [],
        message: "No source adapter matches this page."
      };
    }

    if (adapter.status !== "implemented" || !profile) {
      return {
        ok: false,
        source_adapter_id: adapter.id,
        adapter_profile_id: profile?.id || null,
        adapter_profile_version: profile?.version || null,
        extraction_mode: null,
        ready: false,
        missing_fields: [],
        fields: {},
        selector_diagnostics: getSelectorDiagnostics(profile),
        message: "This source adapter is planned and not implemented yet."
      };
    }

    if (!supportedByActiveLens) {
      return {
        ok: false,
        source_adapter_id: adapter.id,
        adapter_profile_id: profile.id,
        adapter_profile_version: profile.version,
        extraction_mode: null,
        ready: false,
        missing_fields: [],
        fields: {},
        selector_diagnostics: getSelectorDiagnostics(profile),
        message: "This source adapter is not supported by the active Lens Pack."
      };
    }

    const fallbackPreview = adapter.id === "linkedin_jobs"
      ? getLinkedInDoctorFieldPreview(profile)
      : adapter.id === "seek_jobs"
        ? getSeekDoctorFieldPreview(profile)
        : { ready: false, missing_fields: [], fields: {} };
    const extracted = await adapter.extractCurrentItem({
      profile,
      logWaiting: false,
      allowCollectionFallback: true,
      consumeCollectionSnapshot: false
    });
    const fields = extracted
      ? {
          title: extracted.display?.primary_text || "",
          company: extracted.display?.secondary_text || "",
          location: extracted.display?.tertiary_text || "",
          description_preview: previewText(extracted.content?.full_text || ""),
          job_id: extracted.source?.source_item_id || "",
          url: extracted.source?.url || location.href,
          applied: Boolean(extracted.platform_state?.applied)
        }
      : fallbackPreview.fields;
    const missingFields = extracted
      ? [
          !fields.title ? "title" : "",
          !fields.company ? "company" : "",
          !fields.job_id ? "job_id" : ""
        ].filter(Boolean)
      : fallbackPreview.missing_fields;

    return {
      ok: Boolean(extracted),
      source_adapter_id: adapter.id,
      adapter_profile_id: profile.id,
      adapter_profile_version: profile.version,
      extraction_mode: extracted?.metadata?.extraction_mode || null,
      ready: Boolean(extracted) && missingFields.length === 0,
      missing_fields: missingFields,
      fields,
      selector_diagnostics: getSelectorDiagnostics(profile),
      message: extracted ? "Extraction preview succeeded." : "Extraction preview is not ready."
    };
  }

  function getDoctorDomDiscovery(profile, adapterId) {
    if (!profile || !adapterId) {
      return { scope: "none", candidates: [] };
    }

    const detailRoot = adapterId === "linkedin_jobs"
      ? getLinkedInJobDetailRoot(profile)
      : getScopedRoots(profile)[0] || null;
    const workspace = adapterId === "linkedin_jobs"
      ? firstMatchSelector(selectorsFromProfile(profile, "workspace_root", ["main#workspace"]))
      : null;
    const scope = detailRoot || workspace || getFallbackRoot(profile) || document;
    const selectors = [
      "h1",
      "h2",
      'a[href*="/jobs/view/"]',
      'a[href*="currentJobId="]',
      'a[href*="/job/"]',
      'a[href*="/company/"]',
      "button[aria-label]",
      "[data-testid]",
      "[data-automation]",
      "[data-view-name]",
      '[role="listitem"]'
    ];
    const elements = [...new Set(selectors.flatMap((selector) =>
      safeQuerySelectorAll(scope, selector)
    ))];
    const candidates = elements
      .map((element) => {
        const attributes = {};

        for (const attribute of element.attributes || []) {
          const stableName = attribute.name === "id" ||
            attribute.name === "role" ||
            attribute.name === "aria-label" ||
            attribute.name.startsWith("data-test") ||
            attribute.name.startsWith("data-automation") ||
            attribute.name === "data-view-name";
          const stableValue = attribute.value &&
            attribute.value.length <= 180 &&
            !/^ember\d+$/i.test(attribute.value);

          if (stableName && stableValue) {
            attributes[attribute.name] = previewText(attribute.value, 180);
          }
        }

        const href = element.href || "";
        const text = previewText(element.innerText || element.textContent || "", 180);

        return {
          tag: element.tagName?.toLowerCase() || "",
          attributes,
          href: /\/jobs?\//i.test(href) || /\/company\//i.test(href)
            ? previewText(href, 240)
            : "",
          text_preview: text
        };
      })
      .filter((candidate) =>
        Object.keys(candidate.attributes).length > 0 ||
        candidate.href ||
        /\b(?:job|apply|save|company|applicant|posted|ago)\b/i.test(candidate.text_preview)
      )
      .slice(0, 24);

    return {
      scope: detailRoot ? "detail_root" : workspace ? "workspace" : "fallback_root",
      dom_scope_count: adapterId === "linkedin_jobs"
        ? getLinkedInDomScopes().length
        : 1,
      requested_job_id: adapterId === "linkedin_jobs"
        ? getLinkedInRequestedJobId(profile)
        : adapterId === "seek_jobs"
          ? getEffectiveSeekJobId()
          : null,
      candidates
    };
  }

  function doctorCheck(id, label, status, detail) {
    return { id, label, status, detail };
  }

  function buildAdapterDoctorChecks(status, test) {
    const fields = test?.fields || {};
    const mode = test?.extraction_mode || "";
    const isCardMode = /card/.test(mode);
    const hasJobIdentity = Boolean(fields.job_id);
    const isLinkedInWaiting = status?.source_adapter_id === "linkedin_jobs" && !test?.ok;

    return [
      doctorCheck(
        "source",
        "Supported job source",
        status?.source_adapter_id ? "pass" : "fail",
        status?.source_adapter_display_name || "No supported source detected"
      ),
      doctorCheck(
        "profile",
        "Adapter profile",
        status?.adapter_profile_id ? "pass" : "fail",
        status?.adapter_profile_id
          ? `${status.adapter_profile_id} (${status.adapter_profile_version || "unknown"})`
          : "No profile available"
      ),
      doctorCheck(
        "lens",
        "Allowed by active Lens Pack",
        status?.supported_by_active_lens ? "pass" : "fail",
        status?.supported_by_active_lens ? "Enabled" : "Source is disabled in the active Lens Pack"
      ),
      doctorCheck(
        "identity",
        "Selected job identity",
        hasJobIdentity ? "pass" : "wait",
        hasJobIdentity
          ? `Job ${fields.job_id}`
          : isLinkedInWaiting
            ? "LinkedIn Jobs detected; waiting for a job selection"
            : "Waiting for a job selection"
      ),
      doctorCheck(
        "extraction",
        "Extraction mode",
        test?.ok ? (isCardMode ? "warn" : "pass") : isLinkedInWaiting ? "wait" : hasJobIdentity ? "fail" : "wait",
        mode || (
          isLinkedInWaiting
            ? hasJobIdentity
              ? "Job selected; waiting for LinkedIn content"
              : "Listener is ready for the next job selection"
            : hasJobIdentity
              ? "Selected job DOM is not ready"
              : "Waiting for a selected job"
        )
      ),
      doctorCheck(
        "title",
        "Job title",
        fields.title ? "pass" : isLinkedInWaiting ? "wait" : hasJobIdentity ? "fail" : "wait",
        fields.title || (isLinkedInWaiting ? "Waiting for LinkedIn content" : hasJobIdentity ? "Missing" : "Waiting for a selected job")
      ),
      doctorCheck(
        "company",
        "Company",
        fields.company ? "pass" : isLinkedInWaiting ? "wait" : hasJobIdentity ? "warn" : "wait",
        fields.company || (isLinkedInWaiting ? "Waiting for LinkedIn content" : hasJobIdentity ? "Not found" : "Waiting for a selected job")
      ),
      doctorCheck(
        "location",
        "Location",
        fields.location ? "pass" : isLinkedInWaiting ? "wait" : hasJobIdentity ? "warn" : "wait",
        fields.location || (isLinkedInWaiting ? "Waiting for LinkedIn content" : hasJobIdentity ? "Not found" : "Waiting for a selected job")
      ),
      doctorCheck(
        "description",
        "Job description",
        fields.description_preview
          ? "pass"
          : isLinkedInWaiting || !hasJobIdentity
            ? "wait"
            : isCardMode
              ? "warn"
              : "fail",
        fields.description_preview
          ? "Found"
          : isLinkedInWaiting
            ? "Waiting for LinkedIn content"
            : !hasJobIdentity
              ? "Waiting for a selected job"
            : isCardMode
              ? "Card-only capture"
              : "Not found"
      )
    ];
  }

  function getDoctorHealth(checks) {
    if (checks.some((check) => check.status === "fail")) return "fail";
    if (checks.some((check) => check.status === "wait")) return "wait";
    if (checks.some((check) => check.status === "warn")) return "warn";
    return "pass";
  }

  function getDoctorNextAction(health, test, status) {
    if (health === "pass") return "Capture is ready.";
    if (health === "warn" && test?.ok) {
      return "Capture works with limited metadata. Export the help file if fields look wrong.";
    }
    if (status?.source_adapter_id === "linkedin_jobs" && !test?.ok) {
      return test?.fields?.job_id
        ? "Job selection detected. Keep the session active; ARK Lens will retry as LinkedIn finishes loading."
        : "LinkedIn Jobs detected. Start or keep the session active; ARK Lens will capture the next job you select.";
    }
    if (!test?.fields?.job_id) return "Select a job and keep the session active.";
    return "Wait for the job panel to finish loading, retry once, then export the help file if it still fails.";
  }

  async function rememberLastKnownGoodAdapterProfile(adapterId, profile, profileSource) {
    if (!adapterId || !profile) return;

    const result = await chrome.storage.local.get(ADAPTER_PROFILE_LAST_KNOWN_GOOD_KEY);
    const profiles = result[ADAPTER_PROFILE_LAST_KNOWN_GOOD_KEY] || {};

    await chrome.storage.local.set({
      [ADAPTER_PROFILE_LAST_KNOWN_GOOD_KEY]: {
        ...profiles,
        [adapterId]: {
          adapter_id: adapterId,
          profile: JSON.parse(JSON.stringify(profile)),
          profile_source: profileSource === "override" ? "override" : "default",
          verified_at: new Date().toISOString()
        }
      }
    });
  }

  async function runAdapterDoctorHealthCheck(candidateProfile = null) {
    const status = await getAdapterDoctorStatus(candidateProfile);
    const test = await testAdapterDoctorExtraction(candidateProfile);
    const { profile, profile_source } = await getAdapterDoctorContext(candidateProfile);
    const checks = buildAdapterDoctorChecks(status, test);
    const health = getDoctorHealth(checks);
    const result = {
      ...test,
      health,
      checks,
      next_action: getDoctorNextAction(health, test, status),
      status,
      dom_discovery: getDoctorDomDiscovery(profile, status.source_adapter_id)
    };

    if (!candidateProfile && health === "pass" && status.source_adapter_id && profile) {
      await rememberLastKnownGoodAdapterProfile(
        status.source_adapter_id,
        profile,
        profile_source
      );
    }

    return result;
  }

  function redactDoctorHelpValue(value, key = "") {
    const sensitiveKeys = new Set([
      "authorization",
      "cookie",
      "cookies",
      "access_token",
      "auth_token",
      "session_id",
      "tab_id",
      "window_id",
      "account_id",
      "user_id"
    ]);

    if (sensitiveKeys.has(key)) return undefined;
    if (Array.isArray(value)) {
      return value
        .map((entry) => redactDoctorHelpValue(entry, key))
        .filter((entry) => entry !== undefined);
    }
    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value)
          .map(([childKey, childValue]) => [
            childKey,
            redactDoctorHelpValue(childValue, childKey)
          ])
          .filter(([, childValue]) => childValue !== undefined)
      );
    }
    if (typeof value !== "string") return value;
    if (/(?:^|_)url$|^href$/.test(key)) return redactUrlForHelpFile(value);
    return redactPersonalText(value);
  }

  function buildAdapterHelpFile(healthCheck, profile, profileSource) {
    const status = healthCheck.status || {};

    return redactDoctorHelpValue({
      ark_adapter_help_file_schema_version: "1.0.0",
      created_at: new Date().toISOString(),
      page_url: redactUrlForHelpFile(location.href),
      hostname: location.hostname,
      detected_source_adapter_id: status.source_adapter_id,
      detected_source_adapter_display_name: status.source_adapter_display_name,
      adapter_status: status.adapter_status,
      adapter_profile_id: status.adapter_profile_id,
      adapter_profile_version: status.adapter_profile_version,
      profile_source: profileSource,
      supported_by_active_lens: status.supported_by_active_lens,
      health: healthCheck.health,
      checks: healthCheck.checks,
      next_action: healthCheck.next_action,
      extraction_result_preview: healthCheck.fields,
      extraction_mode: healthCheck.extraction_mode,
      ready: healthCheck.ready,
      missing_fields: healthCheck.missing_fields,
      selector_diagnostics: healthCheck.selector_diagnostics,
      dom_discovery: healthCheck.dom_discovery,
      current_adapter_profile: profile,
      repair_file_requirements: {
        schema_version: "1.0.0",
        format: "Return one complete Adapter Repair Profile JSON object, with no markdown.",
        required_top_level_fields: [
          "id",
          "adapter_id",
          "version",
          "display_name",
          "item_type",
          "fields",
          "job_id",
          "readiness"
        ],
        selector_rule: "Use stable semantic attributes. Hashed class names are rejected.",
        activation_rule: "ARK Lens validates and tests the Repair File on the current page before it can be activated."
      },
      privacy: {
        included: [
          "source and capture health",
          "captured field examples",
          "stable selector diagnostics",
          "current Adapter Repair Profile"
        ],
        removed: [
          "URL query parameters and fragments",
          "email addresses and phone numbers in examples",
          "session, tab, account, authentication, and cookie values",
          "page scripts, forms, media, and raw HTML"
        ]
      },
      repair_note:
        "Use checks, selector diagnostics, and DOM discovery examples to repair capture. Do not change Lens scoring rules."
    });
  }

  async function exportAdapterDoctorDebug() {
    const healthCheck = await runAdapterDoctorHealthCheck();
    const { profile, profile_source } = await getAdapterDoctorContext();

    return {
      ok: true,
      debug: buildAdapterHelpFile(healthCheck, profile, profile_source)
    };
  }

  function inspectAdapterRepairProfile(profile) {
    const adapter = getCurrentSourceAdapter();
    const validation = validateAdapterRepairProfile(profile, adapter?.id || null);

    return {
      ok: Boolean(adapter) && validation.valid,
      adapter_id: adapter?.id || null,
      adapter_display_name: adapter?.display_name || "Unsupported page",
      validation,
      validation_message: formatAdapterRepairValidationErrors(validation, 12),
      profile_summary: validation.valid
        ? {
            id: profile.id,
            version: profile.version,
            display_name: profile.display_name,
            field_count: Object.keys(profile.fields || {}).length,
            selector_count: Object.values(profile.fields || {})
              .reduce((total, selectors) => total + selectors.length, 0)
          }
        : null
    };
  }

  async function testAdapterRepairProfile(profile) {
    const inspection = inspectAdapterRepairProfile(profile);

    if (!inspection.ok) {
      return {
        ...inspection,
        can_activate: false,
        health_check: null,
        message: inspection.adapter_id
          ? "Repair File must pass validation before testing."
          : "Open a supported job page before testing a Repair File."
      };
    }

    const healthCheck = await runAdapterDoctorHealthCheck(profile);
    const canActivate = healthCheck.health === "pass" &&
      healthCheck.ready === true &&
      healthCheck.ok === true;

    return {
      ...inspection,
      can_activate: canActivate,
      health_check: healthCheck,
      message: canActivate
        ? "Repair test passed. It is safe to activate on this source."
        : "Repair test did not pass. Nothing was activated."
    };
  }

  // ============================================================
  // SOURCE ADAPTER ROUTER
  // ============================================================

  function getCurrentSourceAdapter() {
    return Object.values(SOURCE_ADAPTER_REGISTRY).find((adapter) =>
      typeof adapter.canHandleCurrentPage === "function" &&
      adapter.canHandleCurrentPage()
    ) || null;
  }

  function getEffectiveCurrentItemId() {
    const adapter = getCurrentSourceAdapter();

    if (typeof adapter?.getCurrentItemId === "function") {
      return adapter.getCurrentItemId();
    }

    return null;
  }

  function getEffectiveCurrentItemKey() {
    const adapter = getCurrentSourceAdapter();
    const itemId = typeof adapter?.getCurrentItemId === "function"
      ? adapter.getCurrentItemId()
      : null;

    return adapter?.id && itemId ? `${adapter.id}:${itemId}` : null;
  }

  function isSourceAdapterAllowedByLens(adapterId, lensPack) {
    const supported = Array.isArray(lensPack?.supported_source_adapters)
      ? lensPack.supported_source_adapters
      : [];

    return supported.includes(adapterId) ||
      lensPack?.source_adapter === adapterId ||
      lensPack?.active_source_adapter === adapterId;
  }

  async function extractCurrentItemForActiveLens(lensPack, options = {}) {
    const adapter = getCurrentSourceAdapter();

    if (!adapter) {
      console.warn("[ARK Lens] no implemented source adapter matched current page", {
        url: location.href
      });
      return null;
    }

    if (adapter.status !== "implemented") {
      console.warn("[ARK Lens] source adapter is not implemented", {
        adapter_id: adapter.id,
        status: adapter.status
      });
      return null;
    }

    if (!isSourceAdapterAllowedByLens(adapter.id, lensPack)) {
      console.warn("[ARK Lens] source adapter not supported by active Lens Pack", {
        adapter_id: adapter.id,
        lens_pack_id: lensPack?.id || lensPack?.lens_pack_id || null
      });
      return null;
    }

    const profile = await getAdapterProfile(adapter.id);

    if (!profile) {
      console.warn("[ARK Lens] no adapter profile available", {
        adapter_id: adapter.id
      });
      return null;
    }

    console.log("[ARK Lens] selected source adapter", adapter.id);
    console.log("[ARK Lens] adapter profile", {
      id: profile.id,
      version: profile.version
    });

    const extracted = await adapter.extractCurrentItem({
      ...options,
      profile
    });

    if (extracted?.metadata?.extraction_mode) {
      console.log("[ARK Lens] extraction mode", extracted.metadata.extraction_mode);
    }

    return extracted;
  }

  // ============================================================
  // RULE ENGINE
  // ============================================================

  function getDorrForWorkflow(workflowState, hasBlocker = false) {
    const byState = {
      applied: {
        scope: "self",
        color: "green",
        time: "past",
        meaning: "done",
        negated: false,
        label: "🟢 Done"
      },
      apply: {
        scope: "self",
        color: "yellow",
        time: "future",
        meaning: "do",
        negated: false,
        label: "🟡 Opportunity"
      },
      review: {
        scope: "self",
        color: "purple",
        time: "now",
        meaning: "review",
        negated: false,
        label: "🟣 Question"
      },
      blockerIgnore: {
        scope: "self",
        color: "red",
        time: "future",
        meaning: "skip",
        negated: false,
        label: "🔴 Threat"
      },
      ignore: {
        scope: "self",
        color: "yellow",
        time: "future",
        meaning: "skip",
        negated: true,
        label: "🚫🟡 Not Opportunity"
      }
    };

    if (workflowState === "ignore" && hasBlocker) {
      return byState.blockerIgnore;
    }

    return byState[workflowState] || byState.review;
  }

  function getMatchedSignals(text, groupName, signals, context) {
    context = context || {};
    return (signals || []).flatMap((signal) => {
      const matchScope = signal.match_scope;
      const scopedText = {
        title: context.title,
        company: context.company,
        location: context.location,
        description: context.description,
        metadata: context.metadata
      }[matchScope];
      const matchText = matchScope === "all"
        ? text
        : String(scopedText || "").replace(/[,:|/()[\]{}]+/g, " ");
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
    });
  }

  function dedupeMatchedPositiveSignals(signals) {
    const ownersByKeyword = new Map();

    signals.forEach((signal, signalIndex) => {
      (signal.keywords || []).forEach((keyword) => {
        const key = normalize(keyword).trim();
        if (!key) return;

        const owners = ownersByKeyword.get(key) || [];
        owners.push(signalIndex);
        ownersByKeyword.set(key, owners);
      });
    });

    const assignedKeywords = signals.map(() => []);

    ownersByKeyword.forEach((owners, keyword) => {
      const ownerIndex = owners.reduce((bestIndex, candidateIndex) => {
        const bestWeight = signals[bestIndex].weight || 0;
        const candidateWeight = signals[candidateIndex].weight || 0;
        return candidateWeight < bestWeight ? candidateIndex : bestIndex;
      }, owners[0]);
      const originalKeyword = (signals[ownerIndex].keywords || []).find(
        (value) => normalize(value).trim() === keyword
      );

      assignedKeywords[ownerIndex].push(originalKeyword || keyword);
    });

    return signals.flatMap((signal, signalIndex) => {
      if (assignedKeywords[signalIndex].length === 0) {
        return [];
      }

      return [{
        ...signal,
        keywords: assignedKeywords[signalIndex]
      }];
    });
  }

  function joinSignalReasons(signals, fallback) {
    const reasons = signals
      .map((signal) => signal.reason)
      .filter(Boolean);

    return reasons.length ? reasons.join("; ") : fallback;
  }

  function scoreSignals(text, lensPack, context) {
    context = context || {};
    const groups = lensPack.signal_groups || {};
    const policy = lensPack.scoring_policy;
    const thresholds = policy.thresholds;
    const confidence = policy.confidence;
    const reasons = policy.reasons;
    const scoringContext = {
      title: context.title || "",
      company: context.company || "",
      location: context.location || "",
      description: context.description || "",
      metadata: context.metadata || ""
    };
    const matched = Object.entries(groups).flatMap(([groupName, signals]) =>
      getMatchedSignals(text, groupName, signals, scoringContext)
    );
    const blockers = matched.filter((signal) => signal.blocker);
    const positive = dedupeMatchedPositiveSignals(
      matched.filter((signal) => !signal.blocker && (signal.weight || 0) > 0)
    );
    const negative = matched.filter(
      (signal) => !signal.blocker && (signal.penalty || 0) > 0
    );
    const positiveScore = positive.reduce((sum, signal) => sum + (signal.weight || 0), 0);
    const negativeScore = negative.reduce((sum, signal) => sum + (signal.penalty || 0), 0);
    const hasRoleFitEvidence = matched.some(
      (signal) => !signal.blocker && signal.qualifies_role_fit
    );

    if (blockers.length > 0) {
      const blockerReason = [...blockers]
        .sort((left, right) => (right.reason_priority || 0) - (left.reason_priority || 0))
        .find((signal) => signal.outcome_reason)?.outcome_reason;
      return {
        matchScore: blockers.reduce(
          (score, signal) => signal.force_score === undefined
            ? score
            : Math.min(score, signal.force_score),
          policy.min_score
        ),
        workflowState: blockers.find((signal) => signal.force_workflow_state)
          ?.force_workflow_state || "ignore",
        reason: blockerReason || reasons.blocker,
        signals: {
          positive,
          negative,
          blockers,
          matched_rule_ids: blockers.map((signal) => signal.id),
          matched_keywords: blockers.flatMap((signal) => signal.keywords)
        },
        confidence: confidence.blocker
      };
    }

    const hasNegative = negative.length > 0;
    const hasTargetRoleTitle = positive.some((signal) => signal.role_fit_kind === "target");
    const hasAdjacentRoleTitle = positive.some((signal) => signal.role_fit_kind === "adjacent");
    let matchScore = (
      hasRoleFitEvidence ? policy.role_fit_base_score + positiveScore : 0
    ) - negativeScore;

    positive.forEach((signal) => {
      const floorAllowed = signal.score_floor_when !== "no_negative" || !hasNegative;
      if (floorAllowed && signal.score_floor !== undefined) {
        matchScore = Math.max(matchScore, signal.score_floor);
      }

      const keywordFloor = signal.keyword_score_floor;
      if (
        floorAllowed &&
        keywordFloor?.score !== undefined &&
        signal.keywords.some((keyword) =>
          (keywordFloor.keywords || []).some(
            (candidate) => normalize(candidate).trim() === normalize(keyword).trim()
          )
        )
      ) {
        matchScore = Math.max(matchScore, keywordFloor.score);
      }
    });

    if (hasNegative) {
      matchScore = Math.min(matchScore, policy.any_negative_score_cap);
    }

    [...positive, ...negative].forEach((signal) => {
      if (signal.score_cap !== undefined) {
        matchScore = Math.min(matchScore, signal.score_cap);
      }
    });

    const forcedScores = [...positive, ...negative]
      .filter((signal) => signal.force_score !== undefined)
      .map((signal) => signal.force_score);
    if (forcedScores.length > 0) {
      matchScore = Math.min(...forcedScores);
    }

    matchScore = clamp(matchScore, policy.min_score, policy.max_score);

    const forcedWorkflow = [...positive, ...negative]
      .sort((left, right) => (right.reason_priority || 0) - (left.reason_priority || 0))
      .find((signal) => signal.force_workflow_state)?.force_workflow_state;
    const workflowState = forcedWorkflow || (
      matchScore >= thresholds.apply_min ? "apply" :
      matchScore >= thresholds.review_min ? "review" :
      "ignore"
    );
    const decisiveReason = [...negative]
      .sort((left, right) => (right.reason_priority || 0) - (left.reason_priority || 0))
      .find((signal) => signal.outcome_reason)?.outcome_reason;
    let reason = decisiveReason || reasons.default;

    if (decisiveReason) {
      reason = decisiveReason;
    } else if (!hasRoleFitEvidence && positive.length > 0) {
      reason = reasons.context_without_role_fit;
    } else if (matchScore >= thresholds.apply_min) {
      reason = hasTargetRoleTitle
        ? reasons.strong_target
        : reasons.strong_evidence;
    } else if (hasAdjacentRoleTitle) {
      if (hasNegative) {
        const template = reasons.adjacent_with_concerns;
        reason = template.replace(
          "{reasons}",
          joinSignalReasons(negative, "mixed signals")
        );
      } else {
        reason = reasons.adjacent;
      }
    } else if (
      !hasNegative &&
      positive.length > 0 &&
      matchScore >= thresholds.review_min
    ) {
      reason = hasTargetRoleTitle
        ? reasons.good_target
        : reasons.relevant_evidence;
    } else if (hasNegative && matchScore >= thresholds.review_min) {
      const template = reasons.review_with_concerns;
      reason = template.replace(
        "{reasons}",
        joinSignalReasons(negative, "mixed positive and negative signals")
      );
    } else if (positive.length > 0) {
      reason = reasons.limited_evidence;
    } else {
      reason = reasons.no_signals;
    }

    return {
      matchScore,
      workflowState,
      reason,
      signals: {
        positive,
        negative,
        blockers,
        matched_rule_ids: [...positive, ...negative].map((signal) => signal.id),
        matched_keywords: [...positive, ...negative].flatMap((signal) => signal.keywords)
      },
      confidence: positive.length || negative.length
        ? confidence.matched
        : confidence.unmatched
    };
  }

  function classifyExtractedJob(extracted, lensPack) {
    const text = [
      extracted.display?.primary_text,
      extracted.display?.secondary_text,
      extracted.display?.tertiary_text,
      extracted.content?.summary,
      extracted.content?.full_text
    ].join(" ");
    const scored = scoreSignals(text, lensPack, {
      title: extracted.display?.primary_text || "",
      company: extracted.display?.secondary_text || "",
      location: extracted.display?.tertiary_text || "",
      description: [
        extracted.content?.summary,
        extracted.content?.full_text
      ].join(" "),
      metadata: extracted.source?.url || ""
    });
    const policy = lensPack.scoring_policy || {};

    if (extracted.platform_state?.applied) {
      return {
        workflow_state: "applied",
        lens_pack_id: lensPack.lens_pack_id,
        lens_pack_version: lensPack.lens_pack_version,
        lens_pack_name: lensPack.name || null,
        dorr: getDorrForWorkflow("applied"),
        action: lensPack.behavior || "report_only",
        reason: policy.reasons.applied,
        match_score: scored.matchScore,
        signals: scored.signals,
        confidence: policy.confidence.applied
      };
    }

    return {
      workflow_state: scored.workflowState,
      lens_pack_id: lensPack.lens_pack_id,
      lens_pack_version: lensPack.lens_pack_version,
      lens_pack_name: lensPack.name || null,
      dorr: getDorrForWorkflow(scored.workflowState, scored.signals.blockers.length > 0),
      action: lensPack.behavior || "report_only",
      reason: scored.reason,
      match_score: scored.matchScore,
      signals: scored.signals,
      confidence: scored.confidence
    };
  }

  // ============================================================
  // SCHEMA BUILDER
  // ============================================================

  function createArkRecord({ extracted, classification, context }) {
    const now = new Date().toISOString();

    return {
      schema_version: SCHEMA_VERSION,
      record_id: `${extracted.source.id}:${extracted.source.source_item_id}`,

      source: extracted.source,

      type: extracted.type,

      context: {
        session_id: context?.session_id || null,
        tab_id: context?.tab_id ?? null,
        window_id: context?.window_id ?? null,
        captured_mode: context?.captured_mode || "manual_session",
        observed_event: context?.observed_event || "manual_capture"
      },

      relations: {
        parent_item_id: null,
        root_item_id: null,
        thread_id: null
      },

      entity: extracted.entity,

      display: extracted.display,

      content: extracted.content,

      capture: {
        method: "dom",
        selector_profile_id: extracted.capture?.selector_profile_id || "linkedin_jobs_v1",
        dom_snapshot_ref: null,
        screenshot_ref: null,
        adapter_warning: extracted.capture?.adapter_warning ??
          (!extracted.content?.full_text || extracted.content.full_text.length < 50)
      },

      classification,

      routing: {
        processed_by: "local_rules",
        ark_hub_id: null,
        llm_model: null,
        llm_prompt_version: null
      },

      memory: {
        first_seen_at: now,
        last_seen_at: now,
        seen_count: 1,
        user_workflow_override: null,
        notes: "",
        relevance_feedback: null,
        feedback_events: []
      },

      metrics: {
        attention_seconds: null,
        first_visible_at: null,
        last_visible_at: null
      },

      metadata: extracted.metadata || {}
    };
  }

  // ============================================================
  // CONTENT ORCHESTRATION
  // ============================================================

  let observer = null;
  let debounceTimer = null;
  let jobChangeInterval = null;
  let listenerActive = false;
  let lastObservedJobId = null;
  let lastDetectedJobId = null;
  let captureInProgress = false;
  let extensionContextInvalidated = false;
  let pendingRetryJobId = null;
  let pendingRetryCount = 0;
  let nextAllowedAutoCaptureAt = 0;
  let clickListenerAttached = false;
  let recentClickedCollectionSnapshot = null;
  let lastCapturedLinkedInDetailSignature = "";

  async function captureCurrentJob(observedEvent = "manual_capture") {
    try {
      const session = await getSession();

      if (!session.active) {
        console.log("[ARK Lens] capture ignored; session inactive");
        return null;
      }

      const shouldLogWaiting = observedEvent === "session_started_capture" ||
        observedEvent === "manual_capture";
      const activeLensPack = await getActiveLensPack();
      const extractionOptions = {
        logWaiting: shouldLogWaiting,
        allowCollectionFallback: observedEvent !== "session_started_capture"
      };
      let extracted = await extractCurrentItemForActiveLens(
        activeLensPack,
        extractionOptions
      );

      if (
        !extracted &&
        getCurrentSourceAdapter()?.id === "linkedin_jobs" &&
        getEffectiveLinkedInJobId() &&
        (observedEvent === "session_started_capture" || observedEvent === "manual_capture")
      ) {
        for (const delay of [700, 1100, 1600]) {
          await new Promise((resolve) => setTimeout(resolve, delay));

          if (!(await getSession()).active) {
            return null;
          }

          linkedInDomScopesCache.timestamp = 0;
          extracted = await extractCurrentItemForActiveLens(activeLensPack, {
            ...extractionOptions,
            logWaiting: false
          });

          if (extracted) {
            break;
          }
        }
      }

      if (!extracted) {
        return null;
      }

      const classification = classifyExtractedJob(extracted, activeLensPack);

      const record = createArkRecord({
        extracted,
        classification,
        context: {
          session_id: session.session_id,
          tab_id: session.tab_id ?? null,
          window_id: session.window_id ?? null,
          captured_mode: session.mode || "manual_session",
          observed_event: observedEvent
        }
      });

      await saveRecord(record);
      lastObservedJobId = record.record_id || record.source?.source_item_id || lastObservedJobId;

      if (
        extracted.source?.id === "linkedin_jobs" &&
        extracted.metadata?.extraction_mode === "job_detail" &&
        extracted._linkedinDetailSignature
      ) {
        lastCapturedLinkedInDetailSignature = extracted._linkedinDetailSignature;
      }

      console.log("[ARK Lens] saved record", record);
      return record;
    } catch (error) {
      if (handleInvalidatedExtensionContext(error, "capture")) {
        return null;
      }

      console.error("[ARK Lens] capture failed", error);
      return null;
    }
  }

  async function captureIfJobChanged() {
    if (!listenerActive) {
      return;
    }

    const nextJobId = getEffectiveCurrentItemKey();

    if (!nextJobId) {
      return;
    }

    if (nextJobId === lastObservedJobId || captureInProgress) {
      return;
    }

    if (
      pendingRetryJobId === nextJobId &&
      pendingRetryCount >= 3 &&
      Date.now() < nextAllowedAutoCaptureAt
    ) {
      return;
    }

    captureInProgress = true;
    const record = await captureCurrentJob("job_changed_auto_capture");
    captureInProgress = false;

    if (record) {
      lastObservedJobId = record.record_id || nextJobId;
      lastDetectedJobId = lastObservedJobId;
      pendingRetryJobId = null;
      pendingRetryCount = 0;
      nextAllowedAutoCaptureAt = 0;
      console.log("[ARK Lens] auto-captured job", lastObservedJobId);
      return;
    }

    if (pendingRetryJobId !== nextJobId) {
      pendingRetryJobId = nextJobId;
      pendingRetryCount = 0;
      nextAllowedAutoCaptureAt = 0;
    }

    if (pendingRetryCount < 3) {
      pendingRetryCount += 1;
      setTimeout(() => {
        if (listenerActive && getEffectiveCurrentItemKey() === nextJobId) {
          captureIfJobChanged();
        }
      }, 900);
    } else {
      nextAllowedAutoCaptureAt = Date.now() + 5000;
    }
  }

  function scheduleJobChangeCheck() {
    if (!listenerActive) {
      return;
    }

    if (debounceTimer) {
      return;
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null;

      const nextJobId = getEffectiveCurrentItemKey();
      const adapter = getCurrentSourceAdapter();

      if (
        adapter?.id === "linkedin_jobs" &&
        pendingRetryJobId &&
        pendingRetryJobId === nextJobId &&
        getLinkedInJobDetailRoot(DEFAULT_ADAPTER_PROFILES.linkedin_jobs)
      ) {
        pendingRetryCount = 0;
        nextAllowedAutoCaptureAt = 0;
      }

      captureIfJobChanged();
    }, 850);
  }

  function rememberClickedCollectionCard(event) {
    if (!listenerActive || !isLinkedInCollectionsPage()) {
      return;
    }

    const workspace = firstMatchSelector(selectorsFromProfile(
      DEFAULT_ADAPTER_PROFILES.linkedin_jobs,
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
      DEFAULT_ADAPTER_PROFILES.linkedin_jobs
    );

    if (!snapshot) {
      const card = target.closest?.('li, article, [role="listitem"]');
      const dismissButton = card?.querySelector?.('button[aria-label^="Dismiss "]');
      snapshot = getCollectionsCardFromButton(
        dismissButton,
        DEFAULT_ADAPTER_PROFILES.linkedin_jobs
      ) || getCollectionsCardFromElement(
        card,
        DEFAULT_ADAPTER_PROFILES.linkedin_jobs,
        titleHint
      ) || findCollectionsCardFromTarget(
        target,
        DEFAULT_ADAPTER_PROFILES.linkedin_jobs,
        titleHint
      );
    }

    if (!snapshot) {
      snapshot = getCollectionsCardCandidates(DEFAULT_ADAPTER_PROFILES.linkedin_jobs)
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

  function handlePotentialJobClick(event) {
    rememberClickedCollectionCard(event);
    pendingRetryCount = 0;
    nextAllowedAutoCaptureAt = 0;
    scheduleJobChangeCheck();
  }

  function checkForActiveJobChange() {
    if (!listenerActive) {
      return;
    }

    const nextJobId = getEffectiveCurrentItemKey();

    if (!nextJobId || nextJobId === lastObservedJobId) {
      return;
    }

    if (nextJobId !== lastDetectedJobId) {
      lastDetectedJobId = nextJobId;
      pendingRetryJobId = null;
      pendingRetryCount = 0;
      nextAllowedAutoCaptureAt = 0;
      console.log("[ARK Lens] detected job id change", nextJobId);
    }

    scheduleJobChangeCheck();
  }

  function startJobChangeWatcher() {
    if (jobChangeInterval) {
      return;
    }

    jobChangeInterval = setInterval(checkForActiveJobChange, 1000);
  }

  function stopJobChangeWatcher() {
    if (!jobChangeInterval) {
      return;
    }

    clearInterval(jobChangeInterval);
    jobChangeInterval = null;
  }

  async function startObserver() {
    if (observer) {
      console.log("[ARK Lens] observer already active");
      startJobChangeWatcher();
      return;
    }

    listenerActive = true;
    lastObservedJobId = null;
    lastDetectedJobId = null;
    pendingRetryJobId = null;
    pendingRetryCount = 0;
    nextAllowedAutoCaptureAt = 0;
    recentClickedCollectionSnapshot = null;
    lastCapturedLinkedInDetailSignature = "";

    const firstRecord = await captureCurrentJob("session_started_capture");

    if (extensionContextInvalidated || !isExtensionContextHealthy()) {
      return;
    }

    lastObservedJobId = firstRecord?.record_id || firstRecord?.source?.source_item_id || null;

    const target = document.body || document.documentElement;

    observer = new MutationObserver(() => {
      scheduleJobChangeCheck();
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    });

    if (!clickListenerAttached) {
      document.addEventListener("click", handlePotentialJobClick, true);
      clickListenerAttached = true;
    }

    startJobChangeWatcher();
    console.log("[ARK Lens] observer started");
  }

  function stopObserver() {
    listenerActive = false;
    clearTimeout(debounceTimer);
    debounceTimer = null;
    stopJobChangeWatcher();
    lastObservedJobId = null;
    lastDetectedJobId = null;
    pendingRetryJobId = null;
    pendingRetryCount = 0;
    nextAllowedAutoCaptureAt = 0;
    captureInProgress = false;
    recentClickedCollectionSnapshot = null;
    lastCapturedLinkedInDetailSignature = "";

    if (observer) {
      observer.disconnect();
      observer = null;
      console.log("[ARK Lens] observer stopped");
    }

    if (clickListenerAttached) {
      document.removeEventListener("click", handlePotentialJobClick, true);
      clickListenerAttached = false;
    }
  }

  window.__arkLensStopObserver = stopObserver;

  function handleArkLensMessage(message, _sender, sendResponse) {
    if (message?.type === "ARK_START_LISTENING") {
      startObserver()
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({
          ok: false,
          message: error?.message || "Listener start failed."
        }));
      return true;
    }

    if (message?.type === "ARK_STOP_LISTENING") {
      stopObserver();
      return;
    }

    if (message?.type === "ARK_CAPTURE_NOW") {
      captureCurrentJob("manual_capture")
        .then((record) => sendResponse({
          ok: Boolean(record),
          record_id: record?.record_id || null,
          source_item_id: record?.source?.source_item_id || null,
          title: record?.display?.primary_text || "",
          message: record ? "Capture saved." : "No record captured."
        }))
        .catch((error) => sendResponse({
          ok: false,
          message: error?.message || "Capture failed."
        }));
      return true;
    }

    if (message?.type === "ARK_ADAPTER_DOCTOR_STATUS") {
      getAdapterDoctorStatus()
        .then(sendResponse)
        .catch((error) => sendResponse({
          ok: false,
          message: error?.message || "Adapter Doctor status failed."
        }));
      return true;
    }

    if (message?.type === "ARK_ADAPTER_DOCTOR_HEALTH_CHECK") {
      runAdapterDoctorHealthCheck()
        .then(sendResponse)
        .catch((error) => sendResponse({
          ok: false,
          health: "fail",
          checks: [],
          message: error?.message || "Adapter Doctor health check failed."
        }));
      return true;
    }

    if (message?.type === "ARK_ADAPTER_DOCTOR_VALIDATE_REPAIR") {
      try {
        sendResponse(inspectAdapterRepairProfile(message.profile));
      } catch (error) {
        sendResponse({
          ok: false,
          can_activate: false,
          validation: { valid: false, errors: [{ path: "$", message: error?.message || "Validation failed" }] },
          message: error?.message || "Repair File validation failed."
        });
      }
      return;
    }

    if (message?.type === "ARK_ADAPTER_DOCTOR_TEST_REPAIR") {
      testAdapterRepairProfile(message.profile)
        .then(sendResponse)
        .catch((error) => sendResponse({
          ok: false,
          can_activate: false,
          health_check: null,
          message: error?.message || "Repair File test failed."
        }));
      return true;
    }

    if (message?.type === "ARK_ADAPTER_DOCTOR_TEST_EXTRACTION") {
      testAdapterDoctorExtraction()
        .then(sendResponse)
        .catch((error) => sendResponse({
          ok: false,
          message: error?.message || "Adapter Doctor extraction test failed."
        }));
      return true;
    }

    if (message?.type === "ARK_ADAPTER_DOCTOR_EXPORT_DEBUG") {
      exportAdapterDoctorDebug()
        .then(sendResponse)
        .catch((error) => sendResponse({
          ok: false,
          message: error?.message || "Adapter Doctor debug export failed."
        }));
      return true;
    }

    if (message?.type === "ARK_ADAPTER_DOCTOR_EXPORT_PROFILE") {
      getAdapterDoctorContext()
        .then(({ adapter, profile, profile_source }) => sendResponse({
          ok: Boolean(adapter && profile),
          source_adapter_id: adapter?.id || null,
          adapter_profile_id: profile?.id || null,
          adapter_profile_version: profile?.version || null,
          profile_source,
          profile,
          message: profile ? "Adapter profile resolved." : "No adapter profile available."
        }))
        .catch((error) => sendResponse({
          ok: false,
          message: error?.message || "Adapter profile export failed."
        }));
      return true;
    }
  }

  chrome.runtime.onMessage.addListener(handleArkLensMessage);

  window.__arkLensRemoveMessageListener = () => {
    try {
      chrome.runtime.onMessage.removeListener(handleArkLensMessage);
    } catch (_error) {
      // The extension context may already be invalidated.
    }
  };

  ensureLensPackStorage().catch((error) => {
    if (handleInvalidatedExtensionContext(error, "storage seed")) {
      return;
    }

    console.warn("[ARK Lens] lens pack storage seed failed", error);
  });
})();
