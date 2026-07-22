const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const registry = require("../sources/source_adapter_registry.js");
const extractionResults = require("../core/extraction_result.js");
const lensItems = require("../core/lens_item.js");
const jobCapturePolicy = require("../policies/job_capture_policy.js");

function makeItem(adapterId, overrides = {}) {
  return lensItems.createLensItem({
    item_id: `${adapterId}-123`,
    source_adapter_id: adapterId,
    item_type: "job",
    source_url: `https://example.test/${adapterId}/123`,
    primary_text: "Engineering Manager",
    secondary_text: "Example Co",
    body_text: "Lead engineering teams and product delivery.",
    metadata: {
      tertiary_text: "Sydney",
      platform_state: { applied: false }
    },
    ...overrides
  });
}

function capturedFor(item, extra = []) {
  return [
    "item_discovery",
    item.item_id && "stable_item_identity",
    item.primary_text && "primary_text",
    item.secondary_text && "secondary_text",
    item.body_text && "body_text",
    item.source_url && "source_url",
    item.metadata?.platform_state && "platform_state",
    item.metadata?.tertiary_text && "location",
    item.published_at && "published_at",
    ...extra
  ].filter(Boolean);
}

function resultFor(adapterId, item, options = {}) {
  const definition = registry.getAdapterDefinition(adapterId);
  return extractionResults.createExtractionResult({
    status: options.status || "complete",
    item,
    source_data: options.source_data || { source: { id: adapterId } },
    required_capabilities: definition.capabilities.required,
    optional_capabilities: definition.capabilities.optional,
    captured_capabilities: options.captured_capabilities || capturedFor(item),
    warnings: options.warnings || [],
    errors: options.errors || []
  });
}

function testCanonicalRegistry() {
  const definitions = registry.listAdapterDefinitions();
  assert.deepEqual(definitions.map((definition) => definition.id), [
    "linkedin_jobs",
    "seek_jobs",
    "hays_jobs"
  ]);
  assert.equal(new Set(definitions.map((definition) => definition.id)).size, definitions.length);
  assert.equal(registry.getAdapterDefinition("linkedin_jobs").status, "implemented");
  assert.equal(registry.getAdapterDefinition("seek_jobs").status, "implemented");
  assert.equal(registry.getAdapterDefinition("hays_jobs").status, "planned");
  assert.equal(registry.getAdapterDefinition("linkedin_jobs").item_type, "job");
  assert.equal(registry.getAdapterDefinition("seek_jobs").item_type, "job");

  assert.equal(
    registry.getSourceForLocation("https://www.linkedin.com/jobs/view/123/").id,
    "linkedin_jobs"
  );
  assert.equal(
    registry.getSourceForLocation("https://www.linkedin.com/feed/"),
    null
  );
  assert.equal(
    registry.getSourceForLocation("https://au.seek.com/jobs?jobId=123").id,
    "seek_jobs"
  );
  assert.equal(
    registry.getSourceForLocation("https://www.seek.com.au/job/123").id,
    "seek_jobs"
  );
  assert.equal(registry.getSourceForLocation("https://example.com/jobs"), null);
  assert.equal(registry.getSourceForLocation("https://www.hays.com.au/jobs"), null);
  assert.equal(
    registry.getSourceStatusForLocation("https://www.hays.com.au/jobs").status,
    "planned"
  );
  assert.equal(
    registry.getSourceStatusForLocation("https://example.com/jobs").status,
    "unsupported"
  );
}

function testRuntimeAdapterContract() {
  const complete = resultFor("linkedin_jobs", makeItem("linkedin_jobs"));
  const runtime = registry.createRuntimeAdapterRegistry({
    linkedin_jobs: {
      discoverItems: () => [{ item_id: "linkedin_jobs-123" }],
      extractItem: async () => complete,
      deriveItemId: (_candidate, result) => result.item?.item_id || null
    },
    seek_jobs: {
      discoverItems: () => [{ item_id: "seek_jobs-123" }],
      extractItem: async () => resultFor("seek_jobs", makeItem("seek_jobs", {
        published_at: "1 day ago"
      })),
      deriveItemId: (_candidate, result) => result.item?.item_id || null
    }
  });

  assert.equal(typeof runtime.linkedin_jobs.canHandleLocation, "function");
  assert.equal(typeof runtime.linkedin_jobs.discoverItems, "function");
  assert.equal(typeof runtime.linkedin_jobs.extractItem, "function");
  assert.equal(typeof runtime.linkedin_jobs.deriveItemId, "function");
  assert.equal(runtime.hays_jobs.status, "planned");
  assert.equal(typeof runtime.hays_jobs.extractItem, "undefined");
  assert.equal(
    registry.getRuntimeAdapterForLocation(runtime, "https://www.hays.com.au/jobs"),
    null
  );
  assert.throws(() => registry.createRuntimeAdapterRegistry({
    hays_jobs: {
      discoverItems: () => [],
      extractItem: async () => null,
      deriveItemId: () => null
    }
  }), /planned source adapter/i);
}

function testCapabilityDeclarations() {
  ["linkedin_jobs", "seek_jobs"].forEach((adapterId) => {
    const definition = registry.getAdapterDefinition(adapterId);
    const validation = registry.validateCapabilityDeclaration(definition);
    assert.deepEqual(validation.errors, []);
    assert.equal(validation.valid, true);
    assert.ok(definition.capabilities.required.includes("item_discovery"));
    assert.ok(definition.capabilities.required.includes("stable_item_identity"));
    assert.ok(definition.capabilities.required.includes("primary_text"));
    assert.ok(definition.capabilities.required.includes("secondary_text"));
    assert.ok(definition.capabilities.required.includes("body_text"));
    assert.ok(definition.capabilities.required.includes("source_url"));
    assert.ok(definition.capabilities.required.includes("platform_state"));
    assert.ok(definition.capabilities.optional.includes("location"));
    assert.ok(definition.capabilities.operations.includes("spa_observation"));
    assert.ok(definition.capabilities.operations.includes("repair_profile"));
    assert.deepEqual(definition.capabilities.unsupported, []);

    Object.values(definition.capabilities).flat().forEach((capability) => {
      assert.equal(registry.isValidCapabilityKey(capability), true, `${adapterId}: ${capability}`);
    });
  });

  assert.equal(registry.isValidCapabilityKey("interaction.comments_loaded_count"), true);
  const futureCapability = {
    ...registry.getAdapterDefinition("linkedin_jobs"),
    capabilities: {
      required: ["content.author"],
      optional: ["interaction.comments_loaded_count"],
      operations: [],
      unsupported: []
    }
  };
  assert.equal(registry.validateCapabilityDeclaration(futureCapability).valid, true);
  assert.equal(registry.isValidCapabilityKey("Not Valid"), false);
}

async function testExtractionResults() {
  const linkedInItem = makeItem("linkedin_jobs");
  const linkedIn = resultFor("linkedin_jobs", linkedInItem);
  assert.equal(linkedIn.status, "complete");
  assert.equal(linkedIn.capture_quality.level, "complete");
  assert.equal(linkedIn.capture_quality.required_captured, linkedIn.capture_quality.required_total);
  assert.equal(jobCapturePolicy.canProcess(linkedIn), true);

  const seekItem = makeItem("seek_jobs", { published_at: "2 days ago" });
  const seek = resultFor("seek_jobs", seekItem);
  assert.equal(seek.status, "complete");

  const withoutLocation = makeItem("linkedin_jobs", {
    metadata: { platform_state: { applied: false } }
  });
  const usablePartial = resultFor("linkedin_jobs", withoutLocation);
  assert.equal(usablePartial.status, "partial");
  assert.deepEqual(usablePartial.missing_capabilities, ["location"]);
  assert.equal(usablePartial.capture_quality.level, "degraded");
  assert.equal(jobCapturePolicy.canProcess(usablePartial), true);

  const withoutBody = makeItem("linkedin_jobs", { body_text: "" });
  const unusablePartial = resultFor("linkedin_jobs", withoutBody);
  assert.equal(unusablePartial.status, "partial");
  assert.ok(unusablePartial.missing_capabilities.includes("body_text"));
  assert.equal(jobCapturePolicy.canProcess(unusablePartial), false);

  const unsupported = extractionResults.createExtractionResult({
    status: "unsupported",
    required_capabilities: ["primary_text"],
    captured_capabilities: [],
    warnings: [{ code: "unsupported_structure", message: "No safe item structure found." }]
  });
  assert.equal(unsupported.status, "unsupported");
  assert.equal(unsupported.item, null);
  assert.equal(unsupported.capture_quality.level, "insufficient");
  assert.doesNotThrow(() => JSON.stringify(unsupported));

  const thrown = await extractionResults.guardExtraction(async () => {
    throw new TypeError("Synthetic extraction failure");
  }, { required_capabilities: ["primary_text"] });
  assert.equal(thrown.status, "failed");
  assert.equal(thrown.errors[0].code, "unexpected_extraction_error");
  assert.match(thrown.errors[0].message, /synthetic extraction failure/i);

  class FakeDomElement {}
  const malformed = extractionResults.createExtractionResult({
    status: "complete",
    item: new FakeDomElement(),
    required_capabilities: ["primary_text"],
    captured_capabilities: ["primary_text"]
  });
  assert.equal(malformed.status, "failed");
  assert.equal(malformed.item, null);
  assert.equal(malformed.errors[0].code, "non_serializable_item");

  const invalidResult = await extractionResults.guardExtraction(async () => ({ item: {} }));
  assert.equal(invalidResult.status, "failed");
  assert.equal(invalidResult.errors[0].code, "invalid_extraction_result");

  const serialisableWarning = resultFor("linkedin_jobs", linkedInItem, {
    status: "partial",
    warnings: [{ code: "uncertain_field", field: "location", message: "Visible value uncertain." }]
  });
  assert.deepEqual(plain(serialisableWarning.warnings), [{
    code: "uncertain_field",
    field: "location",
    message: "Visible value uncertain."
  }]);
  assert.doesNotThrow(() => JSON.stringify(serialisableWarning));
}

function testDependencyBoundaries() {
  const matcherSource = read("core/deterministic_matcher.js");
  const itemSource = read("core/lens_item.js");
  const resultSource = read("core/extraction_result.js");
  const jobPolicySource = read("policies/job_policy_runtime.js");
  const registrySource = read("sources/source_adapter_registry.js");
  const contentSource = read("content_bundle.js");
  const backgroundSource = read("background.js");
  const popupSource = read("popup/popup.js");
  const popupHtml = read("popup/popup.html");
  const packageSource = read("tests/tools/build-peer-alpha-package.js");

  [matcherSource, itemSource, resultSource].forEach((source) => {
    assert.doesNotMatch(source, /\b(?:window|document|chrome|storage|session|report|selector|profile|fetch|XMLHttpRequest)\b/);
  });
  assert.doesNotMatch(matcherSource, /source_adapter|job_policy|ExtractionResult/);
  assert.doesNotMatch(jobPolicySource, /\b(?:document|selector|profile|source_adapter)\b/);
  assert.doesNotMatch(registrySource, /matchScore|workflowState|getDorrForWorkflow|querySelector/);
  assert.doesNotMatch(itemSource, /\b(?:company|location|job_description|apply_status|role_fit|workflow|job_score)\s*:/);

  const runtimeRegistryBlock = contentSource.slice(
    contentSource.indexOf("const SOURCE_ADAPTER_REGISTRY"),
    contentSource.indexOf("const DEFAULT_ADAPTER_PROFILES")
  );
  assert.match(runtimeRegistryBlock, /createRuntimeAdapterRegistry/);
  assert.match(runtimeRegistryBlock, /discoverItems/);
  assert.match(runtimeRegistryBlock, /extractItem/);
  assert.match(runtimeRegistryBlock, /deriveItemId/);
  assert.doesNotMatch(runtimeRegistryBlock, /match_score|workflow_state|getDorr|classif/);
  assert.match(contentSource, /createJobExtractionResult/);
  assert.match(contentSource, /JOB_CAPTURE_POLICY\.canProcess/);
  assert.match(contentSource, /const lensItem = extractionResult\.item/);
  assert.match(contentSource, /const extracted = extractionResult\.source_data/);
  assert.match(contentSource, /querySelector/);
  assert.doesNotMatch(popupSource, /const SOURCE_ADAPTERS = \[/);
  assert.doesNotMatch(backgroundSource, /linkedin\\\.com|seek\\\.com/);
  assert.match(backgroundSource, /SOURCE_ADAPTERS_RUNTIME\.getSourceForLocation/);
  assert.match(popupSource, /SOURCE_ADAPTERS_RUNTIME\.getSourceForLocation/);
  assert.match(popupHtml, /source_adapter_registry\.js/);
  assert.match(packageSource, /sources\/source_adapter_registry\.js/);
  assert.match(packageSource, /core\/extraction_result\.js/);
  assert.match(packageSource, /sources\/source_adapter_registry\.js/);
}

testCanonicalRegistry();
testRuntimeAdapterContract();
testCapabilityDeclarations();
testDependencyBoundaries();
testExtractionResults().then(() => {
  console.log("ARK Lens source adapter, capability, and ExtractionResult contracts passed");
});
