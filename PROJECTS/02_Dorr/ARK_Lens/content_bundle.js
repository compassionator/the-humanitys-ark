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
  const DETERMINISTIC_MATCHER = globalThis.ARK_DETERMINISTIC_MATCHER;
  const EXTRACTION_RESULTS = globalThis.ARK_EXTRACTION_RESULTS;
  const SOURCE_ADAPTERS_RUNTIME = globalThis.ARK_SOURCE_ADAPTERS;
  const DOM_READ_UTILS = globalThis.ARK_DOM_READ_UTILS;
  const ADAPTER_DIAGNOSTICS = globalThis.ARK_ADAPTER_DIAGNOSTICS;
  const JOB_EXTRACTION_BUILDER_RUNTIME = globalThis.ARK_JOB_EXTRACTION_BUILDER;
  const JOB_ADAPTER_RESULT = globalThis.ARK_JOB_ADAPTER_RESULT;
  const LINKEDIN_JOBS_ADAPTER_RUNTIME = globalThis.ARK_LINKEDIN_JOBS_ADAPTER;
  const SEEK_JOBS_ADAPTER_RUNTIME = globalThis.ARK_SEEK_JOBS_ADAPTER;
  const JOB_EXTRACTION_COMPATIBILITY = globalThis.ARK_JOB_EXTRACTION_COMPATIBILITY;
  const JOB_CAPTURE_POLICY = globalThis.ARK_JOB_CAPTURE_POLICY;
  const JOB_POLICY = globalThis.ARK_JOB_POLICY;

  if (
    !LENS_PACK_RUNTIME ||
    !BUNDLED_LENS_PACK ||
    !DETERMINISTIC_MATCHER ||
    !EXTRACTION_RESULTS ||
    !SOURCE_ADAPTERS_RUNTIME ||
    !DOM_READ_UTILS ||
    !ADAPTER_DIAGNOSTICS ||
    !JOB_EXTRACTION_BUILDER_RUNTIME ||
    !JOB_ADAPTER_RESULT ||
    !LINKEDIN_JOBS_ADAPTER_RUNTIME ||
    !SEEK_JOBS_ADAPTER_RUNTIME ||
    !JOB_EXTRACTION_COMPATIBILITY ||
    !JOB_CAPTURE_POLICY ||
    !JOB_POLICY
  ) {
    throw new Error("ARK Lens runtimes were not loaded before the content bundle.");
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

  let SOURCE_ADAPTER_REGISTRY = null;
  let LINKEDIN_JOBS_ADAPTER = null;
  let SEEK_JOBS_ADAPTER = null;

  const DEFAULT_ADAPTER_PROFILES = {
    linkedin_jobs: LINKEDIN_JOBS_ADAPTER_RUNTIME.DEFAULT_PROFILE,
    seek_jobs: SEEK_JOBS_ADAPTER_RUNTIME.DEFAULT_PROFILE
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

  const normalize = DETERMINISTIC_MATCHER.normalize;
  const escapeRegExp = DETERMINISTIC_MATCHER.escapeRegExp;

  const buildExtractedJob = JOB_EXTRACTION_BUILDER_RUNTIME.create({
    adapterVersion: ADAPTER_VERSION, cleanText, location, sha256
  });
  const sourceAdapterContext = {
    adapterDiagnostics:ADAPTER_DIAGNOSTICS, buildExtractedJob, console, document,
    domUtils:DOM_READ_UTILS, escapeRegExp, extractionResults:EXTRACTION_RESULTS,
    getLastObservedJobId:()=>lastObservedJobId, jobAdapterResult:JOB_ADAPTER_RESULT,
    jobCompatibility:JOB_EXTRACTION_COMPATIBILITY, location, normalize, sha256,
    sourceAdaptersRuntime:SOURCE_ADAPTERS_RUNTIME
  };
  LINKEDIN_JOBS_ADAPTER=LINKEDIN_JOBS_ADAPTER_RUNTIME.create(sourceAdapterContext);
  SEEK_JOBS_ADAPTER=SEEK_JOBS_ADAPTER_RUNTIME.create(sourceAdapterContext);
  SOURCE_ADAPTER_REGISTRY=SOURCE_ADAPTERS_RUNTIME.createRuntimeAdapterRegistry({
    linkedin_jobs:{discoverItems:LINKEDIN_JOBS_ADAPTER.discoverItems,
      extractItem:LINKEDIN_JOBS_ADAPTER.extractItem,deriveItemId:LINKEDIN_JOBS_ADAPTER.deriveItemId},
    seek_jobs:{discoverItems:SEEK_JOBS_ADAPTER.discoverItems,
      extractItem:SEEK_JOBS_ADAPTER.extractItem,deriveItemId:SEEK_JOBS_ADAPTER.deriveItemId}
  });

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

  // F3A compatibility boundary: existing Fix Capture and lifecycle callers delegate
  // to the canonical source-owned adapters. Review these wrappers during F3B.
  function getLinkedInProfile(profile){return LINKEDIN_JOBS_ADAPTER.getDefaultProfile(profile);}
  function getSeekProfile(profile){return SEEK_JOBS_ADAPTER.getDefaultProfile(profile);}
  function selectorsFromProfile(profile,section,fallback=[]){
    return (profile?.adapter_id==="seek_jobs"?SEEK_JOBS_ADAPTER:LINKEDIN_JOBS_ADAPTER).getSelectors(profile,section,fallback);
  }
  function safeQuerySelector(root,selector){
    return DOM_READ_UTILS.safeQuerySelector(root,selector,({error})=>console.warn("[ARK Lens] invalid selector skipped",{selector,error}));
  }
  function safeQuerySelectorAll(root,selector){
    return DOM_READ_UTILS.safeQuerySelectorAll(root,selector,({error})=>console.warn("[ARK Lens] invalid selector skipped",{selector,error}));
  }
  function firstMatchSelector(selectors){return DOM_READ_UTILS.firstMatchSelector(document,selectors);}
  function getCurrentJobIdParam(href,profile){return DOM_READ_UTILS.getCurrentItemIdParam(href,profile,location.href);}
  function getLinkedInDomScopes(){return LINKEDIN_JOBS_ADAPTER.getDomScopes();}
  function getLinkedInJobDetailRoot(profile){return LINKEDIN_JOBS_ADAPTER.getJobDetailRoot(profile);}
  function getFallbackRoot(profile){return (profile?.adapter_id==="seek_jobs"?SEEK_JOBS_ADAPTER:LINKEDIN_JOBS_ADAPTER).getFallbackRoot(profile);}
  function getScopedRoots(profile){return (profile?.adapter_id==="seek_jobs"?SEEK_JOBS_ADAPTER:LINKEDIN_JOBS_ADAPTER).getScopedRoots(profile);}
  function getEffectiveLinkedInJobId(){return LINKEDIN_JOBS_ADAPTER.getEffectiveItemId();}
  function getEffectiveSeekJobId(){return SEEK_JOBS_ADAPTER.getEffectiveItemId();}
  function getBestTitle(profile){return LINKEDIN_JOBS_ADAPTER.getBestTitle(profile);}
  function getBestCompany(profile){return LINKEDIN_JOBS_ADAPTER.getBestCompany(profile);}
  function getBestLocation(profile){return LINKEDIN_JOBS_ADAPTER.getBestLocation(profile);}
  function getDescription(profile){return LINKEDIN_JOBS_ADAPTER.getDescription(profile);}
  function getPlatformState(profile){return LINKEDIN_JOBS_ADAPTER.getPlatformState(profile);}
  function getJobIdFromUrlOrLinks(profile){return LINKEDIN_JOBS_ADAPTER.getJobIdFromUrlOrLinks(profile);}
  function getLinkedInRequestedJobId(profile){return LINKEDIN_JOBS_ADAPTER.getRequestedJobId(profile);}
  function isLinkedInCollectionsPage(){return LINKEDIN_JOBS_ADAPTER.isCollectionsPage();}
  function getSeekJobIdFromUrlOrLinks(profile){return SEEK_JOBS_ADAPTER.getJobIdFromUrlOrLinks(profile);}
  function getCollectionsCardFromElement(el,profile,titleHint=""){return LINKEDIN_JOBS_ADAPTER.getCollectionsCardFromElement(el,profile,titleHint);}
  function findCollectionsCardFromTarget(target,profile,titleHint=""){return LINKEDIN_JOBS_ADAPTER.findCollectionsCardFromTarget(target,profile,titleHint);}
  function getCollectionsCardFromButton(button,profile){return LINKEDIN_JOBS_ADAPTER.getCollectionsCardFromButton(button,profile);}
  function getCollectionsCardCandidates(profile){return LINKEDIN_JOBS_ADAPTER.getCollectionsCardCandidates(profile);}
  function getSeekApolloJobFields(jobId){return SEEK_JOBS_ADAPTER.getApolloJobFields(jobId);}
  function getSeekText(profile,fieldName,minimumLength=1){return SEEK_JOBS_ADAPTER.getText(profile,fieldName,minimumLength);}
  function getSeekPlatformState(profile){return SEEK_JOBS_ADAPTER.getPlatformState(profile);}
  async function extractCurrentLinkedInJob(options={}){return LINKEDIN_JOBS_ADAPTER.extractRaw(options);}
  async function extractCurrentSeekJob(options={}){return SEEK_JOBS_ADAPTER.extractRaw(options);}

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

  async function getCurrentAdapterDiagnostic(candidateProfile = null) {
    const { adapter, profile } = await getAdapterDoctorContext(candidateProfile);

    if (!adapter) {
      return ADAPTER_DIAGNOSTICS.createAdapterDiagnostic({
        adapter_id: "",
        item_type: "",
        location_supported: false,
        structure_detected: false,
        discovered_item_count: 0,
        capture_status: "unsupported",
        warnings: [{
          code: "unsupported_location",
          message: "No source adapter matches this location."
        }]
      });
    }

    const implementation = adapter.id === "linkedin_jobs"
      ? LINKEDIN_JOBS_ADAPTER
      : adapter.id === "seek_jobs"
        ? SEEK_JOBS_ADAPTER
        : null;

    if (!implementation || typeof implementation.diagnose !== "function") {
      return ADAPTER_DIAGNOSTICS.createAdapterDiagnostic({
        adapter_id: adapter.id,
        item_type: adapter.item_type,
        location_supported: true,
        structure_detected: false,
        discovered_item_count: 0,
        capture_status: "unsupported",
        warnings: [{
          code: "adapter_not_implemented",
          message: "The detected source adapter is not implemented."
        }]
      });
    }

    return implementation.diagnose({ profile });
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
    const extractionResult = await EXTRACTION_RESULTS.guardExtraction(
      () => {
        const candidate = adapter.discoverItems(document, { location })[0] || null;
        return adapter.extractItem(candidate, {
          profile,
          logWaiting: false,
          allowCollectionFallback: true,
          consumeCollectionSnapshot: false
        });
      },
      {
        required_capabilities: adapter.capabilities.required,
        optional_capabilities: adapter.capabilities.optional
      }
    );
    const extracted = extractionResult.source_data;
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
      extraction_status: extractionResult.status,
      capture_quality: extractionResult.capture_quality,
      missing_capabilities: extractionResult.missing_capabilities,
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
    return SOURCE_ADAPTERS_RUNTIME.getRuntimeAdapterForLocation(
      SOURCE_ADAPTER_REGISTRY,
      location
    );
  }

  function getEffectiveCurrentItemId() {
    const adapter = getCurrentSourceAdapter();

    const candidate = adapter?.discoverItems(document, { location })[0] || null;
    return typeof adapter?.deriveItemId === "function"
      ? adapter.deriveItemId(candidate, null, { location })
      : null;
  }

  function getEffectiveCurrentItemKey() {
    const adapter = getCurrentSourceAdapter();
    const candidate = adapter?.discoverItems(document, { location })[0] || null;
    const itemId = typeof adapter?.deriveItemId === "function"
      ? adapter.deriveItemId(candidate, null, { location })
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
      return EXTRACTION_RESULTS.createExtractionResult({
        status: "unsupported",
        warnings: [{
          code: "unsupported_source",
          message: "No implemented source adapter matched the current page."
        }]
      });
    }

    if (!isSourceAdapterAllowedByLens(adapter.id, lensPack)) {
      console.warn("[ARK Lens] source adapter not supported by active Lens Pack", {
        adapter_id: adapter.id,
        lens_pack_id: lensPack?.id || lensPack?.lens_pack_id || null
      });
      return EXTRACTION_RESULTS.createExtractionResult({
        status: "unsupported",
        required_capabilities: adapter.capabilities.required,
        optional_capabilities: adapter.capabilities.optional,
        warnings: [{
          code: "source_disabled_for_lens",
          message: "The current source is not enabled by the active Lens Pack."
        }]
      });
    }

    const profile = await getAdapterProfile(adapter.id);

    if (!profile) {
      console.warn("[ARK Lens] no adapter profile available", {
        adapter_id: adapter.id
      });
      return EXTRACTION_RESULTS.createExtractionResult({
        status: "failed",
        required_capabilities: adapter.capabilities.required,
        optional_capabilities: adapter.capabilities.optional,
        errors: [{
          code: "missing_adapter_profile",
          message: "No adapter profile was available for this source."
        }]
      });
    }

    console.log("[ARK Lens] selected source adapter", adapter.id);
    console.log("[ARK Lens] adapter profile", {
      id: profile.id,
      version: profile.version
    });

    const extractionResult = await EXTRACTION_RESULTS.guardExtraction(
      () => {
        const candidate = adapter.discoverItems(document, { location })[0] || null;
        return adapter.extractItem(candidate, {
          ...options,
          profile
        });
      },
      {
        required_capabilities: adapter.capabilities.required,
        optional_capabilities: adapter.capabilities.optional
      }
    );

    if (extractionResult.source_data?.metadata?.extraction_mode) {
      console.log(
        "[ARK Lens] extraction mode",
        extractionResult.source_data.metadata.extraction_mode
      );
    }

    return extractionResult;
  }

  // ============================================================
  // MATCHING
  // Pure lexical matching and Job Lens policy run in core/ and policies/.
  // ============================================================

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
  let lastExtractionResult = null;

  async function captureCurrentJob(observedEvent = "manual_capture") {
    try {
      lastExtractionResult = null;
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
      let extractionResult = await extractCurrentItemForActiveLens(
        activeLensPack,
        extractionOptions
      );
      lastExtractionResult = extractionResult;

      if (
        !JOB_CAPTURE_POLICY.canProcess(extractionResult) &&
        getCurrentSourceAdapter()?.id === "linkedin_jobs" &&
        getEffectiveLinkedInJobId() &&
        (observedEvent === "session_started_capture" || observedEvent === "manual_capture")
      ) {
        for (const delay of [700, 1100, 1600]) {
          await new Promise((resolve) => setTimeout(resolve, delay));

          if (!(await getSession()).active) {
            return null;
          }

          LINKEDIN_JOBS_ADAPTER.invalidateDomCache();
          extractionResult = await extractCurrentItemForActiveLens(activeLensPack, {
            ...extractionOptions,
            logWaiting: false
          });
          lastExtractionResult = extractionResult;

          if (JOB_CAPTURE_POLICY.canProcess(extractionResult)) {
            break;
          }
        }
      }

      if (!JOB_CAPTURE_POLICY.canProcess(extractionResult)) {
        return null;
      }

      const lensItem = extractionResult.item;
      const extracted = extractionResult.source_data;
      const classification = JOB_POLICY.classifyLensItem(lensItem, activeLensPack);

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

      LINKEDIN_JOBS_ADAPTER.recordSuccessfulExtraction(extracted);

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
    LINKEDIN_JOBS_ADAPTER.rememberClickedCollectionCard(event);
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
    LINKEDIN_JOBS_ADAPTER.resetTransientState();

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
    LINKEDIN_JOBS_ADAPTER.resetTransientState();

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
          extraction_status: lastExtractionResult?.status || null,
          capture_quality: lastExtractionResult?.capture_quality || null,
          missing_capabilities: lastExtractionResult?.missing_capabilities || [],
          extraction_errors: lastExtractionResult?.errors || [],
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

    if (message?.type === "ARK_ADAPTER_DIAGNOSTICS") {
      getCurrentAdapterDiagnostic()
        .then(sendResponse)
        .catch((error) => sendResponse(ADAPTER_DIAGNOSTICS.createAdapterDiagnostic({
          adapter_id: "",
          item_type: "",
          location_supported: false,
          structure_detected: false,
          capture_status: "failed",
          errors: [{
            code: "adapter_diagnostic_failed",
            message: error?.message || "Adapter diagnostic failed."
          }]
        })));
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
