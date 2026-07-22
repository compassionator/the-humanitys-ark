const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const lensItems = require("../core/lens_item.js");
const extractionResults = require("../core/extraction_result.js");
const registry = require("../sources/source_adapter_registry.js");
const jobCapturePolicy = require("../policies/job_capture_policy.js");

function makeJobResult({ status = "partial", omitted = [], item = null } = {}) {
  const definition = registry.getAdapterDefinition("linkedin_jobs");
  const captured = [
    "item_discovery",
    "stable_item_identity",
    "primary_text",
    "secondary_text",
    "body_text",
    "source_url",
    "platform_state",
    "location"
  ].filter((capability) => !omitted.includes(capability));

  return extractionResults.createExtractionResult({
    status,
    item: item || lensItems.createLensItem({
      item_id: "job-123",
      source_adapter_id: "linkedin_jobs",
      item_type: "job",
      source_url: "https://www.linkedin.com/jobs/view/123/",
      primary_text: "Engineering Manager",
      secondary_text: "Example Co",
      body_text: "Lead an engineering team.",
      metadata: { tertiary_text: "Sydney", platform_state: { applied: false } }
    }),
    source_data: { legacy_job_payload: { untouched: true } },
    required_capabilities: definition.capabilities.required,
    optional_capabilities: definition.capabilities.optional,
    captured_capabilities: captured
  });
}

function testGenericCorePurity() {
  const coreFiles = [
    "core/lens_item.js",
    "core/deterministic_matcher.js",
    "core/extraction_result.js"
  ];

  coreFiles.forEach((relativePath) => {
    const source = read(relativePath);
    assert.doesNotMatch(source, /ARK_(?:JOB|FEED)|require\([^)]*(?:policies|sources|compatibility)/);
    assert.doesNotMatch(source, /\b(?:workflow_state|match_score|applied_state|job_description)\b/);
  });

  const lensItemSource = read("core/lens_item.js");
  const extractionSource = read("core/extraction_result.js");
  assert.doesNotMatch(lensItemSource, /fromJobExtraction|platform_state|tertiary_text|company/);
  assert.doesNotMatch(extractionSource, /secondary_text|body_text|JOB_PROCESSING|canProcess/);
  assert.doesNotMatch(extractionSource, /source_data\s*\./);
}

function testJobOwnedPartialEligibility() {
  assert.deepEqual(plain(jobCapturePolicy.MINIMUM_CAPABILITIES), [
    "stable_item_identity",
    "primary_text",
    "secondary_text",
    "body_text",
    "source_url"
  ]);

  assert.equal(jobCapturePolicy.canProcess(makeJobResult({ status: "complete" })), true);
  assert.equal(jobCapturePolicy.canProcess(makeJobResult()), true);
  assert.equal(jobCapturePolicy.canProcess(makeJobResult({ omitted: ["location"] })), true);
  assert.equal(jobCapturePolicy.canProcess(makeJobResult({ omitted: ["secondary_text"] })), false);
  assert.equal(jobCapturePolicy.canProcess(makeJobResult({ omitted: ["body_text"] })), false);
  assert.equal(jobCapturePolicy.canProcess(makeJobResult({ status: "unsupported" })), false);
  assert.equal(jobCapturePolicy.canProcess(makeJobResult({ status: "failed" })), false);

  const genericMediaItem = lensItems.createLensItem({
    item_id: "feed-like-1",
    source_adapter_id: "future_source",
    item_type: "content",
    primary_text: "A short caption",
    author: { display_name: "Example Author" },
    media_types: ["image"]
  });
  const genericPartial = extractionResults.createExtractionResult({
    status: "partial",
    item: genericMediaItem,
    required_capabilities: ["content.author"],
    optional_capabilities: ["content.body_text", "content.source_url"],
    captured_capabilities: ["content.author"]
  });

  assert.equal(extractionResults.isExtractionResult(genericPartial), true);
  assert.equal(genericPartial.status, "partial");
  assert.equal(genericPartial.item.secondary_text, "");
  assert.equal(genericPartial.item.body_text, "");
  assert.equal(genericPartial.item.source_url, "");
}

function testExtensibleCapabilitiesWithoutJobCoupling() {
  const jobDefinitionsBefore = plain(registry.listAdapterDefinitions());
  const futureDefinition = {
    id: "future_feed_source",
    display_name: "Future source",
    item_type: "content",
    status: "planned",
    url_patterns: [],
    capabilities: {
      required: ["content.author"],
      optional: ["interaction.comments_loaded_count"],
      operations: ["runtime.spa_observation"],
      unsupported: []
    }
  };

  assert.equal(registry.validateCapabilityDeclaration(futureDefinition).valid, true);
  assert.equal(registry.isValidCapabilityKey("interaction.comments_loaded_count"), true);
  assert.deepEqual(plain(registry.listAdapterDefinitions()), jobDefinitionsBefore);
  ["linkedin_jobs", "seek_jobs", "hays_jobs"].forEach((adapterId) => {
    const definition = registry.getAdapterDefinition(adapterId);
    assert.doesNotMatch(JSON.stringify(definition.capabilities), /comments|sponsored|recommendation|thread/);
  });
}

function testRegistryAndDomainBoundaries() {
  const registrySource = read("sources/source_adapter_registry.js");
  const contentSource = read("content_bundle.js");
  const compatibilitySource = read("compatibility/job_extraction_compat.js");
  const jobPolicySource = read("policies/job_policy_runtime.js");
  const jobCaptureSource = read("policies/job_capture_policy.js");
  const adapterBlock = contentSource.slice(
    contentSource.indexOf("const SOURCE_ADAPTER_REGISTRY"),
    contentSource.indexOf("const DEFAULT_ADAPTER_PROFILES")
  );

  assert.doesNotMatch(registrySource, /require\(|ARK_(?:JOB|FEED)|workflow|matchScore|report|storage|session|selector|querySelector/);
  assert.doesNotMatch(registrySource, /if\s*\([^)]*item_type|else\s+if\s*\([^)]*(?:job|feed)/i);
  assert.doesNotMatch(jobPolicySource, /selector|querySelector|ARK_FEED|feed_policy/i);
  assert.doesNotMatch(jobCaptureSource, /selector|querySelector|ARK_FEED|feed_policy/i);
  assert.doesNotMatch(adapterBlock, /workflow|match_score|ARK_FEED|feed_policy/i);
  assert.doesNotMatch(compatibilitySource, /ARK_FEED|feed_policy/i);
  assert.match(contentSource, /JOB_CAPTURE_POLICY\.canProcess/);
  assert.doesNotMatch(contentSource, /JOB_PROCESSING_MINIMUM_CAPABILITIES|canProcessExtractionResult/);
}

function testOpaqueCompatibilityPayload() {
  const adapterPayload = {
    any_future_shape: { nested: [1, 2, 3] },
    source_specific_value: "opaque"
  };
  const result = extractionResults.createExtractionResult({
    status: "complete",
    item: lensItems.createLensItem({ item_id: "opaque-1", item_type: "content" }),
    source_data: adapterPayload,
    captured_capabilities: []
  });

  assert.deepEqual(plain(result.source_data), adapterPayload);
}

function testJobPackageIsolation() {
  const packageSource = read("tests/tools/build-peer-alpha-package.js");
  assert.match(packageSource, /const PACKAGE_BOUNDARIES/);
  assert.match(packageSource, /feed_lens_runtime:\s*Object\.freeze\(\[\]\)/);
  assert.match(packageSource, /combined_runtime:\s*Object\.freeze\(\[\]\)/);
  assert.match(packageSource, /File is outside the Job peer-alpha allow-list/);
  assert.match(packageSource, /Feed implementation is forbidden in the Job peer-alpha/);
  assert.doesNotMatch(packageSource, /^\s*"(?:core|sources|policies|compatibility)",?$/m);

  const implementationRoots = ["core", "sources", "compatibility", "policies"];
  const implementationFiles = implementationRoots.flatMap((directory) =>
    fs.readdirSync(path.join(root, directory)).map((name) => `${directory}/${name}`)
  );
  assert.deepEqual(
    implementationFiles.filter((relativePath) => /(^|[\/_-])feed(?:[\/_.-]|$)/i.test(relativePath)),
    []
  );
}

testGenericCorePurity();
testJobOwnedPartialEligibility();
testExtensibleCapabilitiesWithoutJobCoupling();
testRegistryAndDomainBoundaries();
testOpaqueCompatibilityPayload();
testJobPackageIsolation();

console.log("ARK Lens F2.5 Job/Feed separation contracts passed");
