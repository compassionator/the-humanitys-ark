const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const registryCore = require("../sources/source_adapter_registry.js");
const jobRegistry = require("../sources/jobs/job_source_catalogue.js");
const feedRegistry = require("../sources/feed/feed_source_catalogue.js");

function testRegistrySeparation() {
  const coreSource = read("sources/source_adapter_registry.js");
  const jobSource = read("sources/jobs/job_source_catalogue.js");
  const feedSource = read("sources/feed/feed_source_catalogue.js");
  const jobIds = jobRegistry.listAdapterDefinitions().map((definition) => definition.id);
  const before = JSON.stringify(jobRegistry.listAdapterDefinitions());

  assert.deepEqual(jobIds, ["linkedin_jobs", "seek_jobs", "hays_jobs"]);
  assert.deepEqual(feedRegistry.listAdapterDefinitions().map((definition) => definition.id), ["linkedin_feed"]);
  assert.doesNotMatch(coreSource, /linkedin_jobs|seek_jobs|hays_jobs|linkedin_feed|linkedin\.com|seek\.com|hays\.com/i);
  assert.doesNotMatch(jobSource, /linkedin_feed|feed_post|ARK_FEED/i);
  assert.doesNotMatch(feedSource, /linkedin_jobs|seek_jobs|hays_jobs|ARK_JOB/i);
  assert.equal(jobRegistry.getSourceForLocation("https://www.linkedin.com/feed/"), null);
  assert.equal(jobRegistry.getSourceForLocation("https://www.linkedin.com/jobs/view/123/").id, "linkedin_jobs");
  assert.equal(feedRegistry.getSourceForLocation("https://www.linkedin.com/feed/").id, "linkedin_feed");
  assert.equal(feedRegistry.getSourceForLocation("https://www.linkedin.com/jobs/view/123/"), null);
  assert.equal(feedRegistry.getSourceForLocation("https://www.linkedin.com/in/sample"), null);
  assert.equal(JSON.stringify(jobRegistry.listAdapterDefinitions()), before);
  assert.throws(() => registryCore.createSourceRegistry({ definitions: [
    feedRegistry.getAdapterDefinition("linkedin_feed"),
    feedRegistry.getAdapterDefinition("linkedin_feed")
  ] }), /duplicate IDs/i);
}

function testFeedDefinitionAndBoundaries() {
  const definition = feedRegistry.getAdapterDefinition("linkedin_feed");
  const adapter = read("sources/feed/linkedin_feed_adapter.js");
  const mapper = read("domains/feed/feed_item_mapper.js");
  const policy = read("domains/feed/feed_capture_policy.js");
  const probe = read("orchestration/feed/linkedin_feed_probe.js");
  const content = read("content_bundle.js");
  const background = read("background.js");
  const jobPopup = read("popup/popup.js");

  assert.equal(definition.item_type, "feed_post");
  assert.equal(definition.status, "implemented");
  ["content.author", "content.links", "content.media_types", "platform.visible_labels", "runtime.lazy_insert_observation"]
    .forEach((capability) => assert.equal(
      Object.values(definition.capabilities).flat().includes(capability), true, capability
    ));
  assert.doesNotMatch(JSON.stringify(definition.capabilities), /comments|actions|ai\.|repair/);
  assert.match(adapter, /const SELECTORS/);
  assert.match(adapter, /identity_quality/);
  assert.match(mapper, /createLensItem/);
  assert.match(policy, /function canInspect/);
  assert.doesNotMatch(mapper, /job_|linkedin_jobs|workflow|score/i);
  assert.doesNotMatch(policy, /job_|workflow|score|rank|dorr/i);
  [adapter, probe].forEach((source) => {
    assert.doesNotMatch(source, /chrome\.storage|localStorage|sessionStorage|fetch\(|XMLHttpRequest|WebSocket|sendBeacon/i);
    assert.doesNotMatch(source, /job_policy|job_capture|job_extraction|content_bundle|ark_lens_records|ark_lens_session/i);
    assert.doesNotMatch(source, /\.scroll(?:To|By|IntoView)?\s*\(|\.click\s*\(|dispatchEvent\s*\(/);
    assert.doesNotMatch(source, /innerHTML\s*=|outerHTML\s*=|appendChild\s*\(|removeChild\s*\(|\.remove\s*\(/);
  });
  assert.match(probe, /new MutationObserver/);
  assert.match(probe, /observer\?\.disconnect/);
  assert.match(probe, /deduplicated/);
  assert.doesNotMatch(content, /ARK_FEED|linkedin_feed|feed_post/);
  assert.doesNotMatch(background, /ARK_FEED|linkedin_feed|feed_post|sources\/feed/);
  assert.doesNotMatch(jobPopup, /ARK_FEED|linkedin_feed|feed_post|sources\/feed/);
}

function testProofExtensionAndPrivacy() {
  const manifest = JSON.parse(read("proofs/linkedin_feed/manifest.json"));
  const popup = read("proofs/linkedin_feed/popup.js");
  const popupHtml = read("proofs/linkedin_feed/popup.html");
  const bootstrap = read("proofs/linkedin_feed/proof_content_bootstrap.js");

  assert.deepEqual(manifest.permissions, ["activeTab", "scripting"]);
  assert.equal("host_permissions" in manifest, false);
  assert.equal("content_scripts" in manifest, false);
  assert.equal("background" in manifest, false);
  assert.match(manifest.name, /Extraction Proof/);
  ["Scan visible feed", "Start observing", "Stop observing", "Refresh snapshot", "Export local JSON", "Clear in-memory snapshot"]
    .forEach((label) => assert.match(popupHtml, new RegExp(label)));
  assert.doesNotMatch(popup, /classify|match_score|workflow_state|relevance_score|dorr|hidePost|blurPost/i);
  assert.match(popup, /EXTENSION_API\.scripting\.executeScript/);
  assert.match(popup, /EXTENSION_API\.tabs\.sendMessage/);
  assert.match(popup, /globalThis\.browser\s*\|\|\s*globalThis\.chrome/);
  assert.doesNotMatch(popup, /\bchrome\.(?:tabs|scripting|runtime)\b/);
  assert.doesNotMatch(popup, /chrome\.storage|fetch\(|XMLHttpRequest/);
  assert.doesNotMatch(popup, /sources\/jobs|policies\/job|compatibility\/job|content_bundle|report\//);
  assert.doesNotMatch(bootstrap, /chrome\.storage|fetch\(|XMLHttpRequest/);
  assert.match(bootstrap, /EXTENSION_API\.runtime\.onMessage\.addListener/);
  assert.match(bootstrap, /globalThis\.browser\s*\|\|\s*globalThis\.chrome/);
  assert.doesNotMatch(bootstrap, /\bchrome\.(?:tabs|scripting|runtime)\b/);
}

testRegistrySeparation();
testFeedDefinitionAndBoundaries();
testProofExtensionAndPrivacy();

console.log("ARK Lens FEED_P0 registry, adapter, observer, privacy, and extension contracts passed");
