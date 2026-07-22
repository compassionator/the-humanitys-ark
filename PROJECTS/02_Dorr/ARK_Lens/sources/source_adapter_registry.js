(function initializeArkSourceRegistryCore(root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ARK_SOURCE_REGISTRY_CORE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkSourceRegistryCore() {
  const ADAPTER_STATUSES = Object.freeze(["implemented", "planned", "unsupported"]);
  const CAPABILITY_VOCABULARY = Object.freeze([
    "item_discovery",
    "stable_item_identity",
    "primary_text",
    "secondary_text",
    "body_text",
    "source_url"
  ]);
  const CAPABILITY_KEY_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

  function isValidCapabilityKey(value) {
    return typeof value === "string" && CAPABILITY_KEY_PATTERN.test(value);
  }

  function toUrl(locationLike) {
    try {
      if (typeof locationLike === "string") return new URL(locationLike);
      if (locationLike?.href) return new URL(locationLike.href);
      if (locationLike?.hostname) {
        return new URL(`${locationLike.protocol || "https:"}//${locationLike.hostname}${locationLike.pathname || "/"}${locationLike.search || ""}`);
      }
    } catch (_error) {
      return null;
    }
    return null;
  }

  function freezeCapabilities(value = {}) {
    return Object.freeze({
      required: Object.freeze([...(value.required || [])]),
      optional: Object.freeze([...(value.optional || [])]),
      operations: Object.freeze([...(value.operations || [])]),
      unsupported: Object.freeze([...(value.unsupported || [])])
    });
  }

  function validateCapabilityDeclaration(definition = {}) {
    const capabilities = definition.capabilities || {};
    const groups = ["required", "optional", "operations", "unsupported"];
    const errors = [];
    groups.forEach((group) => {
      if (!Array.isArray(capabilities[group])) errors.push(`Capability group ${group} must be an array`);
    });
    if (errors.length) return { valid: false, errors };

    const declared = groups.flatMap((group) => capabilities[group]);
    declared.forEach((capability) => {
      if (!isValidCapabilityKey(capability)) errors.push(`Invalid capability key ${String(capability)}`);
    });
    const supported = [
      ...capabilities.required,
      ...capabilities.optional,
      ...capabilities.operations
    ];
    if (new Set(supported).size !== supported.length) {
      errors.push("Supported capability declarations must not overlap");
    }
    if (supported.some((capability) => capabilities.unsupported.includes(capability))) {
      errors.push("Supported and unsupported capability declarations must not overlap");
    }
    return { valid: errors.length === 0, errors };
  }

  function validateDefinition(value = {}) {
    const errors = [];
    if (!/^[a-z][a-z0-9_]*$/.test(value.id || "")) errors.push("Adapter ID is invalid");
    if (!String(value.display_name || "").trim()) errors.push("Adapter display name is required");
    if (!/^[a-z][a-z0-9_]*$/.test(value.item_type || "")) errors.push("Adapter item type is invalid");
    if (!ADAPTER_STATUSES.includes(value.status)) errors.push("Adapter status is invalid");
    if (typeof value.matches_location !== "function") errors.push("Adapter matches_location function is required");
    errors.push(...validateCapabilityDeclaration(value).errors);
    return { valid: errors.length === 0, errors };
  }

  function freezeDefinition(value) {
    return Object.freeze({
      ...value,
      url_patterns: Object.freeze([...(value.url_patterns || [])]),
      capabilities: freezeCapabilities(value.capabilities)
    });
  }

  function createSourceRegistry({ definitions = [], implementations = {} } = {}) {
    const frozenDefinitions = Object.freeze(definitions.map((definition) => {
      const validation = validateDefinition(definition);
      if (!validation.valid) {
        throw new Error(`Invalid source adapter ${definition?.id || "definition"}: ${validation.errors.join("; ")}`);
      }
      return freezeDefinition(definition);
    }));
    const byId = new Map(frozenDefinitions.map((definition) => [definition.id, definition]));
    if (byId.size !== frozenDefinitions.length) {
      throw new Error("ARK source adapter definitions contain duplicate IDs.");
    }

    function definitionMatchesLocation(definition, locationLike) {
      const parsed = toUrl(locationLike);
      if (!definition || !parsed) return false;
      try {
        return definition.matches_location(parsed) === true;
      } catch (_error) {
        return false;
      }
    }

    function listAdapterDefinitions() {
      return [...frozenDefinitions];
    }

    function getAdapterDefinition(adapterId) {
      return byId.get(adapterId) || null;
    }

    function getSourceForLocation(locationLike, options = {}) {
      const includePlanned = options.includePlanned === true;
      return frozenDefinitions.find((definition) =>
        (definition.status === "implemented" || includePlanned) &&
        definitionMatchesLocation(definition, locationLike)
      ) || null;
    }

    function getSourceStatusForLocation(locationLike) {
      const adapter = getSourceForLocation(locationLike, { includePlanned: true });
      return adapter ? { status: adapter.status, adapter } : { status: "unsupported", adapter: null };
    }

    function createRuntimeAdapterRegistry(runtimeImplementations = implementations) {
      Object.keys(runtimeImplementations || {}).forEach((adapterId) => {
        const definition = getAdapterDefinition(adapterId);
        if (!definition) throw new Error(`Unknown source adapter implementation ${adapterId}.`);
        if (definition.status !== "implemented") {
          throw new Error(`Planned source adapter ${adapterId} cannot receive a runtime implementation.`);
        }
      });

      return Object.fromEntries(frozenDefinitions.map((definition) => {
        const implementation = runtimeImplementations?.[definition.id] || {};
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

    return Object.freeze({
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
      validateCapabilityDeclaration,
      validateDefinition
    });
  }

  return {
    ADAPTER_STATUSES,
    CAPABILITY_VOCABULARY,
    CAPABILITY_KEY_PATTERN,
    createSourceRegistry,
    isValidCapabilityKey,
    toUrl,
    validateCapabilityDeclaration,
    validateDefinition
  };
});
