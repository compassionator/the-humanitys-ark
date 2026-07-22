const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);
const chromePath = chromeCandidates.find(fs.existsSync);
if (!chromePath) throw new Error("Chrome or Edge is required for Feed proof browser tests.");

const sources = [
  "core/lens_item.js",
  "core/extraction_result.js",
  "sources/source_adapter_registry.js",
  "sources/dom_read_utils.js",
  "sources/adapter_diagnostics.js",
  "sources/feed/feed_source_catalogue.js",
  "domains/feed/feed_item_mapper.js",
  "domains/feed/feed_capture_policy.js",
  "sources/feed/linkedin_feed_adapter.js",
  "orchestration/feed/linkedin_feed_probe.js"
].map(read);
const fixture = read("tests/fixtures/linkedin-feed/observable-posts.html");
const runner = `
(async () => {
  const mockLocation = {
    href: "https://www.linkedin.com/feed/",
    hostname: "www.linkedin.com",
    pathname: "/feed/",
    protocol: "https:"
  };
  const hashText = async (value) => {
    let hash = 2166136261;
    for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return (hash >>> 0).toString(16).padStart(8, "0").repeat(8);
  };
  const createAdapter = (mapper = ARK_FEED_ITEM_MAPPER) => ARK_LINKEDIN_FEED_ADAPTER.create({
    adapterDiagnostics: ARK_ADAPTER_DIAGNOSTICS,
    document,
    domUtils: ARK_DOM_READ_UTILS,
    extractionResults: ARK_EXTRACTION_RESULTS,
    feedItemMapper: mapper,
    feedRegistry: ARK_FEED_SOURCE_ADAPTERS,
    hashText,
    location: mockLocation
  });
  const adapter = createAdapter();
  const candidates = adapter.discoverItems();
  const fixtureResults = {};
  for (const candidate of candidates) {
    fixtureResults[candidate.element.getAttribute("data-case")] = await adapter.extractItem(candidate);
  }
  const root = document.querySelector("[data-feed-root]");
  const beforeScanMarkup = root.innerHTML;
  const probe = ARK_LINKEDIN_FEED_PROBE.create({
    adapter,
    capturePolicy: ARK_FEED_CAPTURE_POLICY,
    clearTimeout,
    document,
    extractionResults: ARK_EXTRACTION_RESULTS,
    location: mockLocation,
    MutationObserver,
    setTimeout
  });
  const initial = await probe.start();
  const scanDidNotMutate = beforeScanMarkup === root.innerHTML;

  const duplicate = root.querySelector('[data-case="text"]').cloneNode(true);
  duplicate.setAttribute("data-case", "duplicate");
  root.appendChild(duplicate);
  const inserted = document.createElement("article");
  inserted.setAttribute("data-feed-post", "");
  inserted.setAttribute("data-case", "inserted");
  inserted.setAttribute("data-urn", "urn:li:activity:1000000000000000011");
  inserted.innerHTML = '<a href="https://www.linkedin.com/in/synthetic-author-z"><span data-feed-author>Sample Author Z</span></a>' +
    '<div data-feed-post-text>A newly rendered synthetic post.</div>' +
    '<time data-feed-timestamp datetime="2026-07-22T01:00:00Z">now</time>' +
    '<a href="https://www.linkedin.com/feed/update/urn:li:activity:1000000000000000011/">View post</a>';
  root.appendChild(inserted);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const afterInsertion = probe.snapshot();
  const stopped = probe.stop();
  const stoppedCounts = JSON.stringify(stopped.counts);
  const afterStopNode = inserted.cloneNode(true);
  afterStopNode.setAttribute("data-urn", "urn:li:activity:1000000000000000012");
  root.appendChild(afterStopNode);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const afterStop = probe.snapshot();

  const failed = await ARK_EXTRACTION_RESULTS.guardExtraction(async () => {
    const failingAdapter = createAdapter({ mapFeedSourceToLensItem() { throw new Error("Synthetic mapper failure"); } });
    return failingAdapter.extractItem(candidates[0]);
  }, { required_capabilities: ["item_discovery", "primary_text", "content.author"] });
  const diagnostic = await adapter.diagnose(candidates[0]);
  const output = {
    candidateCount: candidates.length,
    fixtureResults,
    initial,
    scanDidNotMutate,
    afterInsertion,
    stopped,
    stoppedCountsUnchanged: stoppedCounts === JSON.stringify(afterStop.counts),
    afterStop,
    failed,
    diagnostic
  };
  const result = document.createElement("script");
  result.id = "feed-proof-result";
  result.type = "application/json";
  result.textContent = JSON.stringify(output).replace(/</g, "\\u003c");
  document.body.replaceChildren(result);
})();`;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ark-feed-proof-"));
const harnessPath = path.join(tempDir, "harness.html");
const profilePath = path.join(tempDir, "profile");
const harness = `<!doctype html><html><head><meta charset="utf-8"></head><body>${fixture}${sources.map((source) => `<script>${source}</script>`).join("")}<script>${runner}</script></body></html>`;
fs.writeFileSync(harnessPath, harness);

try {
  const run = spawnSync(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--allow-file-access-from-files",
    "--no-first-run",
    `--user-data-dir=${profilePath}`,
    "--virtual-time-budget=12000",
    "--dump-dom",
    harnessPath
  ], { encoding: "utf8", timeout: 30000, maxBuffer: 20 * 1024 * 1024 });
  if (run.error) throw run.error;
  assert.equal(run.status, 0, run.stderr);
  const match = run.stdout.match(/<script id="feed-proof-result" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, "Feed proof browser harness did not return a result");
  const output = JSON.parse(match[1]);
  const results = output.fixtureResults;

  assert.equal(output.candidateCount, 10);
  ["text", "image", "video", "article", "repost", "sponsored", "recommendation"].forEach((key) => {
    assert.equal(results[key].status, "complete", key);
    assert.equal(results[key].item.item_type, "feed_post");
  });
  assert.deepEqual(results.image.item.media_types, ["image"]);
  assert.deepEqual(results.video.item.media_types, ["video"]);
  assert.ok(results.article.item.media_types.includes("article"));
  assert.equal(results.sponsored.source_data.capture_metadata.sponsored, true);
  assert.equal(results.recommendation.source_data.capture_metadata.recommendation, true);
  assert.match(results.repost.source_data.repost_context, /reposted/i);
  assert.equal(results.fallback.status, "partial");
  assert.equal(results.fallback.source_data.identity_quality, "fallback");
  assert.match(results.fallback.item.item_id, /^fallback:/);
  assert.equal(results.partial.status, "partial");
  assert.equal(results.unsupported.status, "unsupported");
  assert.equal(output.failed.status, "failed");

  assert.equal(output.scanDidNotMutate, true);
  assert.equal(output.initial.counts.discovered, 10);
  assert.equal(output.afterInsertion.counts.discovered, 12);
  assert.equal(output.afterInsertion.counts.deduplicated, 1);
  assert.equal(output.afterInsertion.counts.complete, 8);
  assert.equal(output.afterInsertion.counts.partial, 2);
  assert.equal(output.afterInsertion.counts.unsupported, 1);
  assert.equal(output.stopped.observation_active, false);
  assert.equal(output.stoppedCountsUnchanged, true);
  assert.equal(output.afterStop.observation_active, false);
  assert.equal(output.diagnostic.adapter_id, "linkedin_feed");
  assert.equal(output.diagnostic.structure_detected, true);

  const exported = JSON.stringify(output.afterInsertion);
  assert.doesNotMatch(exported, /COMMENT_BODY_MUST_NOT_EXPORT|SYNTHETIC_TOKEN_MUST_NOT_EXPORT/);
  assert.doesNotMatch(exported, /outerHTML|innerHTML|cookie|comment_body/i);
  assert.doesNotThrow(() => JSON.stringify(output));
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("ARK Lens LinkedIn Feed extraction and observer browser proof passed (10 structures)");
