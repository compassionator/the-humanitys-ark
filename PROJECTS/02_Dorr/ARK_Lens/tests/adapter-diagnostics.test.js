const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const diagnostics = require("../sources/adapter_diagnostics.js");
const extractionResults = require("../core/extraction_result.js");

const diagnosticKeys = [
  "adapter_id",
  "item_type",
  "location_supported",
  "structure_detected",
  "discovered_item_count",
  "capture_status",
  "captured_capabilities",
  "missing_capabilities",
  "selector_observations",
  "warnings",
  "errors",
  "timestamp"
];

function extraction(status, captured, missing, errors = []) {
  return extractionResults.createExtractionResult({
    status,
    item: status === "complete" || status === "partial" ? {} : null,
    required_capabilities: ["primary_text", "body_text"],
    optional_capabilities: ["location"],
    captured_capabilities: captured,
    errors
  });
}

function makeDiagnostic(result, overrides = {}) {
  return diagnostics.fromExtractionResult({
    adapter_id: "linkedin_jobs",
    item_type: "job",
    location_supported: true,
    structure_detected: true,
    discovered_item_count: 1,
    extraction_result: result,
    selector_observations: [
      diagnostics.createSelectorObservation({
        selector_key: "title",
        matched: true,
        match_count: 1,
        required: true,
        observation: "Selector structure matched.",
        selector: "#must-not-leak",
        page_content: "must-not-leak"
      }),
      diagnostics.createSelectorObservation({
        selector_key: "location",
        matched: false,
        match_count: 0,
        required: false,
        observation: "Selector structure was not observed."
      })
    ],
    ...overrides
  });
}

function testDiagnosticOutcomes() {
  const complete = makeDiagnostic(extraction(
    "complete",
    ["primary_text", "body_text", "location"],
    []
  ));
  assert.deepEqual(Object.keys(complete), diagnosticKeys);
  assert.equal(complete.capture_status, "complete");
  assert.equal(complete.location_supported, true);
  assert.equal(complete.structure_detected, true);
  assert.equal(complete.selector_observations[0].matched, true);
  assert.equal(complete.selector_observations[1].required, false);
  assert.equal("selector" in complete.selector_observations[0], false);
  assert.equal("page_content" in complete.selector_observations[0], false);

  const partial = makeDiagnostic(extraction(
    "partial",
    ["primary_text", "location"],
    ["body_text"]
  ));
  assert.equal(partial.capture_status, "partial");
  assert.deepEqual(partial.missing_capabilities, ["body_text"]);

  const failed = makeDiagnostic(extraction(
    "failed",
    [],
    ["primary_text", "body_text"],
    [{ code: "synthetic_failure", message: "Extraction failed safely." }]
  ), { structure_detected: false, discovered_item_count: 0 });
  assert.equal(failed.capture_status, "failed");
  assert.equal(failed.structure_detected, false);
  assert.equal(failed.errors[0].code, "synthetic_failure");

  const unsupported = diagnostics.createAdapterDiagnostic({
    adapter_id: "seek_jobs",
    item_type: "job",
    location_supported: true,
    structure_detected: false,
    discovered_item_count: 0,
    capture_status: "unsupported",
    missing_capabilities: ["primary_text"],
    selector_observations: [{
      selector_key: "title",
      matched: false,
      match_count: 0,
      required: true,
      observation: "Required selector structure was not observed."
    }]
  });
  assert.equal(unsupported.capture_status, "unsupported");
  assert.equal(unsupported.selector_observations[0].required, true);
}

function testPlainDataAndNoMutation() {
  const input = Object.freeze({
    adapter_id: "seek_jobs",
    item_type: "job",
    location_supported: false,
    capture_status: "unsupported",
    captured_capabilities: Object.freeze([]),
    missing_capabilities: Object.freeze(["primary_text"]),
    selector_observations: Object.freeze([]),
    warnings: Object.freeze([]),
    errors: Object.freeze([]),
    timestamp: "2026-07-22T00:00:00.000Z"
  });
  const result = diagnostics.createAdapterDiagnostic(input);
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(input.missing_capabilities, ["primary_text"]);

  class FakeDomNode {}
  assert.throws(() => diagnostics.createAdapterDiagnostic({
    adapter_id: "linkedin_jobs",
    item_type: "job",
    capture_status: "failed",
    warnings: [new FakeDomNode()]
  }), /serialisable plain data/i);
}

function testSourceAndSideEffectBoundaries() {
  const content = read("content_bundle.js");
  const linkedIn = read("sources/jobs/linkedin_jobs_adapter.js");
  const seek = read("sources/jobs/seek_jobs_adapter.js");
  const diagnosticSource = read("sources/adapter_diagnostics.js");

  assert.match(linkedIn, /async function extractItem/);
  assert.match(seek, /async function extractItem/);
  assert.match(content, /LINKEDIN_JOBS_ADAPTER\.extractRaw/);
  assert.match(content, /SEEK_JOBS_ADAPTER\.extractRaw/);
  assert.doesNotMatch(content, /data-automation=\\"job-detail-title|jobs-search__job-details/);

  [linkedIn, seek, diagnosticSource].forEach((source) => {
    assert.doesNotMatch(source, /(?:chrome\.storage|RECORDS_KEY|SESSION_KEY|classifyLensItem|workflow_state|match_score|feed_adapter)/i);
    assert.doesNotMatch(source, /activateRepair|rollback|setAdapterProfileOverride/);
  });
  assert.doesNotMatch(diagnosticSource, /querySelector|document\.|innerHTML|textContent/);
}

testDiagnosticOutcomes();
testPlainDataAndNoMutation();
testSourceAndSideEffectBoundaries();

console.log("ARK Lens adapter diagnostic contracts passed");
