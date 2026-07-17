(function initializeArkLensPackRuntime(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.ARK_LENS_PACK_RUNTIME = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkLensPackRuntime() {
  const LENS_PACK_SCHEMA_VERSION = "1.0.0";
  const MATCH_SCOPES = new Set([
    "all",
    "title",
    "company",
    "location",
    "description",
    "metadata"
  ]);
  const ROLE_FIT_KINDS = new Set(["target", "adjacent", "evidence", "context", "none"]);
  const FLOOR_CONDITIONS = new Set(["always", "no_negative"]);
  const WORKFLOW_STATES = new Set(["apply", "review", "ignore", "applied"]);
  const REQUIRED_REASON_KEYS = [
    "blocker",
    "applied",
    "default",
    "context_without_role_fit",
    "strong_target",
    "strong_evidence",
    "adjacent",
    "adjacent_with_concerns",
    "good_target",
    "relevant_evidence",
    "review_with_concerns",
    "limited_evidence",
    "no_signals"
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function humanizeId(value) {
    return String(value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  function deepMerge(base, override) {
    if (!isPlainObject(base)) return clone(override);
    if (!isPlainObject(override)) return clone(base);

    return Object.entries(override).reduce((merged, [key, value]) => {
      merged[key] = isPlainObject(value) && isPlainObject(merged[key])
        ? deepMerge(merged[key], value)
        : clone(value);
      return merged;
    }, clone(base));
  }

  function validateLensPack(value) {
    const errors = [];
    const add = (path, message) => errors.push({ path, message });

    if (!isPlainObject(value)) {
      add("$", "must be a JSON object");
      return { valid: false, errors };
    }

    ["lens_pack_schema_version", "id", "name", "version"].forEach((field) => {
      if (typeof value[field] !== "string" || !value[field].trim()) {
        add(`$.${field}`, "must be a non-empty string");
      }
    });

    if (value.lens_pack_schema_version !== LENS_PACK_SCHEMA_VERSION) {
      add(
        "$.lens_pack_schema_version",
        `must equal supported version ${LENS_PACK_SCHEMA_VERSION}`
      );
    }

    if (
      !Array.isArray(value.supported_source_adapters) ||
      value.supported_source_adapters.length < 1 ||
      value.supported_source_adapters.some(
        (adapterId) => typeof adapterId !== "string" || !adapterId.trim()
      )
    ) {
      add("$.supported_source_adapters", "must contain at least one source adapter id");
    } else if (new Set(value.supported_source_adapters).size !== value.supported_source_adapters.length) {
      add("$.supported_source_adapters", "must not contain duplicate source adapter ids");
    }

    if (!isPlainObject(value.signal_groups) || Object.keys(value.signal_groups).length < 1) {
      add("$.signal_groups", "must contain at least one signal group");
    }

    const signalIds = new Set();
    Object.entries(value.signal_groups || {}).forEach(([groupId, signals]) => {
      const groupPath = `$.signal_groups.${groupId}`;

      if (!Array.isArray(signals)) {
        add(groupPath, "must be an array");
        return;
      }

      signals.forEach((signal, index) => {
        const signalPath = `${groupPath}[${index}]`;

        if (!isPlainObject(signal)) {
          add(signalPath, "must be an object");
          return;
        }

        if (typeof signal.id !== "string" || !signal.id.trim()) {
          add(`${signalPath}.id`, "must be a non-empty string");
        } else if (signalIds.has(signal.id)) {
          add(`${signalPath}.id`, `duplicates signal id ${signal.id}`);
        } else {
          signalIds.add(signal.id);
        }

        if (typeof signal.display_name !== "string" || !signal.display_name.trim()) {
          add(`${signalPath}.display_name`, "must be a non-empty string");
        }

        if (
          !Array.isArray(signal.keywords) ||
          signal.keywords.some((keyword) => typeof keyword !== "string" || !keyword.trim())
        ) {
          add(`${signalPath}.keywords`, "must be an array containing only non-empty strings");
        }

        if (!MATCH_SCOPES.has(signal.match_scope)) {
          add(`${signalPath}.match_scope`, `must be one of ${[...MATCH_SCOPES].join(", ")}`);
        }

        if (typeof signal.blocker !== "boolean") {
          add(`${signalPath}.blocker`, "must be true or false");
        }

        if (typeof signal.qualifies_role_fit !== "boolean") {
          add(`${signalPath}.qualifies_role_fit`, "must be true or false");
        }

        if (!ROLE_FIT_KINDS.has(signal.role_fit_kind)) {
          add(
            `${signalPath}.role_fit_kind`,
            `must be one of ${[...ROLE_FIT_KINDS].join(", ")}`
          );
        }

        if (
          signal.editor_section !== undefined &&
          (typeof signal.editor_section !== "string" || !signal.editor_section.trim())
        ) {
          add(`${signalPath}.editor_section`, "must be a non-empty string");
        }

        if (signal.editor_help !== undefined && typeof signal.editor_help !== "string") {
          add(`${signalPath}.editor_help`, "must be a string");
        }

        ["weight", "penalty", "score_cap", "score_floor", "force_score"].forEach((field) => {
          if (
            signal[field] !== undefined &&
            (typeof signal[field] !== "number" || signal[field] < 0 || signal[field] > 100)
          ) {
            add(`${signalPath}.${field}`, "must be a number from 0 to 100");
          }
        });

        if (
          signal.score_floor_when !== undefined &&
          !FLOOR_CONDITIONS.has(signal.score_floor_when)
        ) {
          add(`${signalPath}.score_floor_when`, "must be always or no_negative");
        }

        if (
          signal.force_workflow_state !== undefined &&
          !WORKFLOW_STATES.has(signal.force_workflow_state)
        ) {
          add(
            `${signalPath}.force_workflow_state`,
            `must be one of ${[...WORKFLOW_STATES].join(", ")}`
          );
        }

        ["reason", "outcome_reason"].forEach((field) => {
          if (signal[field] !== undefined && typeof signal[field] !== "string") {
            add(`${signalPath}.${field}`, "must be a string");
          }
        });

        if (signal.reason_priority !== undefined && !Number.isInteger(signal.reason_priority)) {
          add(`${signalPath}.reason_priority`, "must be an integer");
        }

        if (signal.keyword_score_floor !== undefined) {
          const effect = signal.keyword_score_floor;

          if (!isPlainObject(effect)) {
            add(`${signalPath}.keyword_score_floor`, "must be an object");
          } else {
            if (typeof effect.score !== "number" || effect.score < 0 || effect.score > 100) {
              add(`${signalPath}.keyword_score_floor.score`, "must be a number from 0 to 100");
            }
            if (
              !Array.isArray(effect.keywords) ||
              effect.keywords.length < 1 ||
              effect.keywords.some(
                (keyword) => typeof keyword !== "string" || !keyword.trim()
              )
            ) {
              add(`${signalPath}.keyword_score_floor.keywords`, "must contain keywords");
            }
          }
        }
      });
    });

    const policy = value.scoring_policy;
    if (!isPlainObject(policy)) {
      add("$.scoring_policy", "must be an object");
    } else {
      ["min_score", "max_score", "role_fit_base_score", "any_negative_score_cap"].forEach(
        (field) => {
          if (typeof policy[field] !== "number" || policy[field] < 0 || policy[field] > 100) {
            add(`$.scoring_policy.${field}`, "must be a number from 0 to 100");
          }
        }
      );

      if (!isPlainObject(policy.thresholds)) {
        add("$.scoring_policy.thresholds", "must be an object");
      } else {
        ["apply_min", "review_min"].forEach((field) => {
          if (
            typeof policy.thresholds[field] !== "number" ||
            policy.thresholds[field] < 0 ||
            policy.thresholds[field] > 100
          ) {
            add(`$.scoring_policy.thresholds.${field}`, "must be a number from 0 to 100");
          }
        });
      }

      if (!isPlainObject(policy.confidence)) {
        add("$.scoring_policy.confidence", "must be an object");
      } else {
        ["matched", "unmatched", "blocker", "applied"].forEach((field) => {
          if (
            typeof policy.confidence[field] !== "number" ||
            policy.confidence[field] < 0 ||
            policy.confidence[field] > 1
          ) {
            add(`$.scoring_policy.confidence.${field}`, "must be a number from 0 to 1");
          }
        });
      }
      if (!isPlainObject(policy.reasons)) {
        add("$.scoring_policy.reasons", "must be an object");
      } else {
        REQUIRED_REASON_KEYS.forEach((field) => {
          if (typeof policy.reasons[field] !== "string" || !policy.reasons[field].trim()) {
            add(`$.scoring_policy.reasons.${field}`, "must be a non-empty string");
          }
        });
      }

      if (
        typeof policy.min_score === "number" &&
        typeof policy.max_score === "number" &&
        policy.min_score > policy.max_score
      ) {
        add("$.scoring_policy.min_score", "must not exceed max_score");
      }
      if (
        isPlainObject(policy.thresholds) &&
        typeof policy.thresholds.apply_min === "number" &&
        typeof policy.thresholds.review_min === "number" &&
        policy.thresholds.apply_min < policy.thresholds.review_min
      ) {
        add("$.scoring_policy.thresholds.apply_min", "must not be below review_min");
      }
    }

    return { valid: errors.length === 0, errors };
  }

  function formatValidationErrors(result, limit = 5) {
    if (result.valid) return "Lens Pack is valid.";

    const shown = result.errors
      .slice(0, limit)
      .map((error) => `${error.path}: ${error.message}`);
    const remaining = result.errors.length - shown.length;

    return [
      "Lens Pack validation failed:",
      ...shown.map((message) => `- ${message}`),
      remaining > 0 ? `- ...and ${remaining} more error(s)` : ""
    ].filter(Boolean).join("\n");
  }

  function getCanonicalSignals(bundled) {
    return new Map(
      Object.entries(bundled.signal_groups || {}).flatMap(([groupId, signals]) =>
        (signals || []).map((signal) => [signal.id, { groupId, signal }])
      )
    );
  }

  function migrateSignal(signal, groupId, canonicalSignals) {
    const canonical = canonicalSignals.get(signal?.id)?.signal || {};
    const migrated = { ...clone(canonical), ...clone(signal || {}) };

    migrated.id = migrated.id || `signal_${Date.now()}`;
    migrated.display_name = migrated.display_name || humanizeId(migrated.id);
    migrated.keywords = Array.isArray(migrated.keywords)
      ? migrated.keywords.filter((keyword) => typeof keyword === "string" && keyword.trim())
      : [];
    migrated.match_scope = migrated.match_scope || canonical.match_scope || "all";
    migrated.blocker = migrated.blocker ?? canonical.blocker ?? groupId === "blockers";
    migrated.qualifies_role_fit = migrated.qualifies_role_fit ??
      canonical.qualifies_role_fit ??
      groupId === "must_have";
    migrated.role_fit_kind = migrated.role_fit_kind ||
      canonical.role_fit_kind ||
      (groupId === "must_have" ? "evidence" : "context");
    migrated.reason = migrated.reason || canonical.reason || migrated.display_name;

    return migrated;
  }

  function migrateLensPack(value, bundled) {
    const fallback = clone(bundled);

    if (!isPlainObject(value) || !isPlainObject(value.signal_groups)) {
      return fallback;
    }

    const canonicalSignals = getCanonicalSignals(fallback);
    const isLegacyBundledName = value.id === fallback.id && value.name === "Bob Job Search";
    const migrated = { ...fallback, ...clone(value) };
    migrated.lens_pack_schema_version = LENS_PACK_SCHEMA_VERSION;
    migrated.id = migrated.id || migrated.lens_pack_id || fallback.id;
    migrated.name = migrated.name || fallback.name;
    migrated.version = migrated.version || migrated.lens_pack_version || fallback.version;
    migrated.lens_pack_id = migrated.lens_pack_id || migrated.id;
    migrated.lens_pack_version = migrated.lens_pack_version || migrated.version;
    migrated.source_adapter = migrated.source_adapter ||
      migrated.active_source_adapter ||
      migrated.supported_source_adapters?.[0] ||
      fallback.source_adapter;
    migrated.supported_source_adapters =
      Array.isArray(migrated.supported_source_adapters) &&
      migrated.supported_source_adapters.filter(Boolean).length > 0
        ? [...new Set(migrated.supported_source_adapters.filter(Boolean))]
        : [migrated.source_adapter];
    migrated.active_source_adapter = migrated.active_source_adapter ||
      migrated.source_adapter ||
      migrated.supported_source_adapters[0];
    migrated.scoring_policy = deepMerge(fallback.scoring_policy, value.scoring_policy || {});
    const fallbackGroupIds = Object.keys(fallback.signal_groups || {});
    const valueGroupIds = Object.keys(value.signal_groups || {});
    const sharedGroupCount = valueGroupIds.filter((groupId) =>
      fallbackGroupIds.includes(groupId)
    ).length;
    const inheritsBundledGroups = value.id === fallback.id ||
      sharedGroupCount >= Math.ceil(fallbackGroupIds.length / 2);
    const migratedGroupIds = inheritsBundledGroups
      ? [...new Set([...fallbackGroupIds, ...valueGroupIds])]
      : valueGroupIds;

    migrated.signal_groups = Object.fromEntries(
      migratedGroupIds.map((groupId) => [
        groupId,
        Array.isArray(value.signal_groups[groupId])
          ? value.signal_groups[groupId].map(
            (signal) => migrateSignal(signal, groupId, canonicalSignals)
          )
          : Array.isArray(fallback.signal_groups[groupId])
            ? clone(fallback.signal_groups[groupId])
          : []
      ])
    );

    if (isLegacyBundledName) {
      migrated.name = fallback.name;
      if (value.description === "Scores jobs against Bob's job-search preferences.") {
        migrated.description = fallback.description;
      }
    }

    return migrated;
  }

  function migrateLensPackStorage(packs, activeId, bundled) {
    const defaultPack = clone(bundled);
    const sourcePacks = isPlainObject(packs) ? packs : {};
    const entries = Object.entries(sourcePacks);
    const migratedPacks = entries.length > 0
      ? Object.fromEntries(entries.map(([storageId, lensPack]) => [
        storageId,
        migrateLensPack(lensPack, defaultPack)
      ]))
      : { [defaultPack.id]: defaultPack };
    const migratedActiveId = typeof activeId === "string" &&
      Object.prototype.hasOwnProperty.call(migratedPacks, activeId)
        ? activeId
        : Object.prototype.hasOwnProperty.call(migratedPacks, defaultPack.id)
          ? defaultPack.id
          : Object.keys(migratedPacks)[0];

    return {
      packs: migratedPacks,
      activeId: migratedActiveId,
      changed: JSON.stringify(packs) !== JSON.stringify(migratedPacks) ||
        activeId !== migratedActiveId
    };
  }

  return {
    LENS_PACK_SCHEMA_VERSION,
    clone,
    deepMerge,
    formatValidationErrors,
    humanizeId,
    isPlainObject,
    migrateLensPack,
    migrateLensPackStorage,
    validateLensPack
  };
});
