(function initializeArkJobSourceCatalogue(root, factory) {
  const registryCore = typeof module !== "undefined" && module.exports
    ? require("../source_adapter_registry.js")
    : root.ARK_SOURCE_REGISTRY_CORE;
  const api = factory(registryCore);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ARK_SOURCE_ADAPTERS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkJobSourceCatalogue(registryCore) {
  if (!registryCore) throw new Error("ARK source registry core must load before the Job catalogue.");

  const jobCapabilities = {
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
  };

  const definitions = [
    {
      id: "linkedin_jobs",
      display_name: "LinkedIn Jobs",
      item_type: "job",
      status: "implemented",
      url_patterns: ["https://www.linkedin.com/jobs/*"],
      capabilities: jobCapabilities,
      matches_location: (url) => /(^|\.)linkedin\.com$/i.test(url.hostname) && url.pathname.includes("/jobs")
    },
    {
      id: "seek_jobs",
      display_name: "SEEK Jobs",
      item_type: "job",
      status: "implemented",
      url_patterns: ["https://www.seek.com.au/*", "https://au.seek.com/*"],
      capabilities: jobCapabilities,
      matches_location: (url) => /(^|\.)seek\.com(\.au)?$/i.test(url.hostname) && (
        /^\/job\/\d+/.test(url.pathname) ||
        /^\/jobs(?:-|\/|$)/.test(url.pathname) ||
        Boolean(url.searchParams.get("jobId"))
      )
    },
    {
      id: "hays_jobs",
      display_name: "Hays Jobs",
      item_type: "job",
      status: "planned",
      url_patterns: ["https://www.hays.com.au/*"],
      capabilities: { required: [], optional: [], operations: [], unsupported: [] },
      matches_location: (url) => /(^|\.)hays\.com\.au$/i.test(url.hostname)
    }
  ];

  return registryCore.createSourceRegistry({ definitions });
});
