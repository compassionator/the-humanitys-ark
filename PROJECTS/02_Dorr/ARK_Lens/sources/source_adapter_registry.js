(function initializeArkSourceAdapterRegistry(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.ARK_SOURCE_ADAPTERS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkSourceAdapterRegistry() {
  const ADAPTER_STATUSES = Object.freeze(["implemented", "planned", "unsupported"]);
  // Built-in keys document current runtime use; validation is deliberately open
  // to well-formed namespaced capabilities owned by future Lens domains.
  const CAPABILITY_VOCABULARY = Object.freeze([
    "item_discovery",
    "stable_item_identity",
    "primary_text",
    "secondary_text",
    "body_text",
    "location",
    "source_url",
    "platform_state",
    "spa_observation",
    "repair_profile"
  ]);
  const CAPABILITY_KEY_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

  function isValidCapabilityKey(capability) {
    return typeof capability === "string" && CAPABILITY_KEY_PATTERN.test(capability);
  }

  function freezeCapabilities(value) {
    return Object.freeze({
      required: Object.freeze([...(value.required || [])]),
      optional: Object.freeze([...(value.optional || [])]),
      operations: Object.freeze([...(value.operations || [])]),
      unsupported: Object.freeze([...(value.unsupported || [])])
    });
  }

  const DEFINITIONS = Object.freeze([
    Object.freeze({
      id: "linkedin_jobs",
      display_name: "LinkedIn Jobs",
      item_type: "job",
      status: "implemented",
      url_patterns: Object.freeze(["https://www.linkedin.com/jobs/*"]),
      capabilities: freezeCapabilities({
        required: [
          "item_discovery",
          "stable_item_identity",
          "primary_text",
          "secondary_text",
          "body_text",
          "source_url",
          "platform_state"
        ],
        optional: ["location"],
        operations: ["spa_observation", "repair_profile"],
        unsupported: []
      })
    }),
    Object.freeze({
      id: "seek_jobs",
      display_name: "SEEK Jobs",
      item_type: "job",
      status: "implemented",
      url_patterns: Object.freeze([
        "https://www.seek.com.au/*",
        "https://au.seek.com/*"
      ]),
      capabilities: freezeCapabilities({
        required: [
          "item_discovery",
          "stable_item_identity",
          "primary_text",
          "secondary_text",
          "body_text",
          "source_url",
          "platform_state"
        ],
        optional: ["location"],
        operations: ["spa_observation", "repair_profile"],
        unsupported: []
      })
    }),
    Object.freeze({
      id: "hays_jobs",
      display_name: "Hays Jobs",
      item_type: "job",
      status: "planned",
      url_patterns: Object.freeze(["https://www.hays.com.au/*"]),
      capabilities: freezeCapabilities({
        required: [],
        optional: [],
        operations: [],
        unsupported: []
      })
    })
  ]);

  const DEFINITION_BY_ID = new Map(DEFINITIONS.map((definition) => [definition.id, definition]));

  if (DEFINITION_BY_ID.size !== DEFINITIONS.length) {
    throw new Error("ARK source adapter definitions contain duplicate IDs.");
  }

  function toUrl(locationLike) {
    try {
      if (typeof locationLike === "string") {
        return new URL(locationLike);
      }
      if (locationLike?.href) {
        return new URL(locationLike.href);
      }
      if (locationLike?.hostname) {
        const protocol = locationLike.protocol || "https:";
        const pathname = locationLike.pathname || "/";
        const search = locationLike.search || "";
        return new URL(`${protocol}//${locationLike.hostname}${pathname}${search}`);
      }
    } catch (_error) {
      return null;
    }

    return null;
  }

  function definitionMatchesLocation(definition, locationLike) {
    const parsed = toUrl(locationLike);
    if (!parsed || !definition) return false;

    if (definition.id === "linkedin_jobs") {
      return /(^|\.)linkedin\.com$/i.test(parsed.hostname) &&
        parsed.pathname.includes("/jobs");
    }

    if (definition.id === "seek_jobs") {
      return /(^|\.)seek\.com(\.au)?$/i.test(parsed.hostname) &&
        (
          /^\/job\/\d+/.test(parsed.pathname) ||
          /^\/jobs(?:-|\/|$)/.test(parsed.pathname) ||
          Boolean(parsed.searchParams.get("jobId"))
        );
    }

    if (definition.id === "hays_jobs") {
      return /(^|\.)hays\.com\.au$/i.test(parsed.hostname);
    }

    return false;
  }

  function listAdapterDefinitions() {
    return [...DEFINITIONS];
  }

  function getAdapterDefinition(adapterId) {
    return DEFINITION_BY_ID.get(adapterId) || null;
  }

  function getSourceForLocation(locationLike, options = {}) {
    const includePlanned = options.includePlanned === true;

    return DEFINITIONS.find((definition) =>
      (definition.status === "implemented" || includePlanned) &&
      definitionMatchesLocation(definition, locationLike)
    ) || null;
  }

  function getSourceStatusForLocation(locationLike) {
    const definition = getSourceForLocation(locationLike, { includePlanned: true });

    return definition
      ? { status: definition.status, adapter: definition }
      : { status: "unsupported", adapter: null };
  }

  function validateCapabilityDeclaration(definition) {
    const errors = [];
    const declared = [
      ...definition.capabilities.required,
      ...definition.capabilities.optional,
      ...definition.capabilities.operations,
      ...definition.capabilities.unsupported
    ];

    declared.forEach((capability) => {
      if (!isValidCapabilityKey(capability)) {
        errors.push(`Invalid capability key ${String(capability)}`);
      }
    });

    const supported = [
      ...definition.capabilities.required,
      ...definition.capabilities.optional,
      ...definition.capabilities.operations
    ];
    if (new Set(supported).size !== supported.length) {
      errors.push("Supported capability declarations must not overlap");
    }
    if (supported.some((capability) => definition.capabilities.unsupported.includes(capability))) {
      errors.push("Supported and unsupported capability declarations must not overlap");
    }

    return { valid: errors.length === 0, errors };
  }

  function createRuntimeAdapterRegistry(implementations = {}) {
    Object.keys(implementations).forEach((adapterId) => {
      const definition = getAdapterDefinition(adapterId);
      if (!definition) throw new Error(`Unknown source adapter implementation ${adapterId}.`);
      if (definition.status !== "implemented") {
        throw new Error(`Planned source adapter ${adapterId} cannot receive a runtime implementation.`);
      }
    });

    return Object.fromEntries(DEFINITIONS.map((definition) => {
      const implementation = implementations[definition.id] || {};
      const adapter = {
        ...definition,
        canHandleLocation: (locationLike) => definitionMatchesLocation(definition, locationLike),
        ...implementation
      };

      if (definition.status === "implemented") {
        ["discoverItems", "extractItem", "deriveItemId"].forEach((method) => {
          if (typeof adapter[method] !== "function") {
            throw new Error(`Implemented source adapter ${definition.id} is missing ${method}().`);
          }
        });
      }

      return [definition.id, Object.freeze(adapter)];
    }));
  }

  function getRuntimeAdapterForLocation(runtimeRegistry, locationLike) {
    return Object.values(runtimeRegistry || {}).find((adapter) =>
      adapter.status === "implemented" && adapter.canHandleLocation(locationLike)
    ) || null;
  }

  return {
    ADAPTER_STATUSES,
    CAPABILITY_VOCABULARY,
    CAPABILITY_KEY_PATTERN,
    createRuntimeAdapterRegistry,
    definitionMatchesLocation,
    getAdapterDefinition,
    getRuntimeAdapterForLocation,
    getSourceForLocation,
    getSourceStatusForLocation,
    isValidCapabilityKey,
    listAdapterDefinitions,
    validateCapabilityDeclaration
  };
});
