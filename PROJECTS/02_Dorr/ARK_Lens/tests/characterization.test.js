const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  evaluate,
  extractFunction,
  plain
} = require("./helpers/source-contracts");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));
const contentSource = read("content_bundle.js");
const popupSource = read("popup/popup.js");
const reportSource = read("report/report.js");
const scoringCorpus = readJson("tests/fixtures/real-world/scoring-corpus.json");
const reportCorpus = readJson("tests/fixtures/real-world/report-corpus.json");
const pageCases = readJson("tests/fixtures/real-world/page-cases.json");
const canonicalLens = readJson("lens-packs/bob_job_search.json");
const {
  classifyExtractedJob,
  scoreSignals
} = require("../policies/job_policy_runtime.js");

function loadScoringApi() {
  return { scoreSignals };
}

function loadRecordLifecycleApi() {
  const names = [
    "cleanText",
    "getRecordCaptureQuality",
    "preserveRicherExistingRecord"
  ];
  return evaluate(names.map((name) => extractFunction(contentSource, name)).join("\n"), [
    "getRecordCaptureQuality",
    "preserveRicherExistingRecord"
  ]);
}

function loadReportExportApi() {
  const names = [
    "normalizeDisplayText",
    "cleanLinkedInMetaText",
    "parseRecordMetaText",
    "getExportLocation",
    "getRelevanceFeedbackValue",
    "formatSignals",
    "getEffectiveWorkflowState",
    "sourceLabel",
    "getSafeHttpUrl",
    "getRecordOpenUrl",
    "escapeCsv",
    "toCsv"
  ];
  return evaluate(names.map((name) => extractFunction(reportSource, name)).join("\n"), [
    "escapeCsv",
    "getEffectiveWorkflowState",
    "getRecordOpenUrl",
    "toCsv"
  ], { URL, encodeURIComponent });
}

function signalSummary(signals) {
  return {
    positive: (signals.positive || []).map((signal) => ({
      id: signal.id,
      keywords: signal.keywords
    })),
    negative: (signals.negative || []).map((signal) => ({
      id: signal.id,
      keywords: signal.keywords
    })),
    blockers: (signals.blockers || []).map((signal) => ({
      id: signal.id,
      keywords: signal.keywords
    })),
    matched_rule_ids: signals.matched_rule_ids || [],
    matched_keywords: signals.matched_keywords || []
  };
}

function testSingleCanonicalLensSource() {
  [contentSource, popupSource, reportSource].forEach((source) => {
    assert.doesNotMatch(source, /\bDEFAULT_LENS_PACK\b/);
    assert.doesNotMatch(source, /\bBOB_JOB_SEARCH_LENS\b/);
    assert.doesNotMatch(source, /getDefaultTitleGuardSignals/);
  });
  assert.equal(canonicalLens.lens_pack_schema_version, "1.0.0");
}

function testRealWorldScoringCorpus() {
  const lens = canonicalLens;
  const { scoreSignals } = loadScoringApi();
  const mismatches = [];

  scoringCorpus.forEach((testCase) => {
    const input = testCase.input;
    const text = [
      input.title,
      input.company,
      input.location,
      input.summary,
      input.full_text
    ].join(" ");
    const actual = plain(scoreSignals(text, lens, { title: input.title }));
    const expected = testCase.expected;
    const errors = [];

    if (actual.matchScore !== expected.match_score) {
      errors.push(`score ${actual.matchScore} != ${expected.match_score}`);
    }
    if (expected.workflow_state !== "applied" && actual.workflowState !== expected.workflow_state) {
      errors.push(`state ${actual.workflowState} != ${expected.workflow_state}`);
    }
    if (expected.workflow_state !== "applied" && actual.reason !== expected.reason) {
      errors.push(`reason ${JSON.stringify(actual.reason)} != ${JSON.stringify(expected.reason)}`);
    }

    const actualSignals = signalSummary(actual.signals);
    const expectedSignals = signalSummary(expected.signals);
    if (JSON.stringify(actualSignals) !== JSON.stringify(expectedSignals)) {
      errors.push("matched signals changed");
    }

    if (errors.length) {
      mismatches.push(`${testCase.case_id} ${input.title}: ${errors.join("; ")}`);
    }
  });

  assert.deepEqual(mismatches, [], `Scoring corpus regressions:\n${mismatches.join("\n")}`);
}

function testScoringDoesNotDependOnSignalIds() {
  const renamedLens = plain(canonicalLens);
  let index = 0;
  Object.values(renamedLens.signal_groups).flat().forEach((signal) => {
    index += 1;
    signal.id = `custom_rule_${index}`;
  });
  const { scoreSignals } = loadScoringApi();

  scoringCorpus.forEach((testCase) => {
    const input = testCase.input;
    const text = [
      input.title,
      input.company,
      input.location,
      input.summary,
      input.full_text
    ].join(" ");
    const actual = plain(scoreSignals(text, renamedLens, { title: input.title }));
    const expected = testCase.expected;

    assert.equal(actual.matchScore, expected.match_score, `${testCase.id}: renamed rule score`);
    if (expected.workflow_state !== "applied") {
      assert.equal(
        actual.workflowState,
        expected.workflow_state,
        `${testCase.id}: renamed rule state`
      );
      assert.equal(actual.reason, expected.reason, `${testCase.id}: renamed rule reason`);
    }
  });
}

function testLensItemProductionScoringPath() {
  const mismatches = [];

  scoringCorpus.forEach((testCase) => {
    const input = testCase.input;
    const expected = testCase.expected;
    const actual = plain(classifyExtractedJob({
      source: {
        id: "linkedin_jobs",
        source_item_id: testCase.case_id,
        url: `https://www.linkedin.com/jobs/view/${testCase.case_id}/`
      },
      type: "job",
      display: {
        primary_text: input.title,
        secondary_text: input.company,
        tertiary_text: input.location
      },
      content: {
        summary: input.summary,
        full_text: input.full_text
      },
      platform_state: {
        applied: expected.workflow_state === "applied",
        applied_text: expected.workflow_state === "applied" ? "Applied" : ""
      },
      metadata: {}
    }, canonicalLens));
    const errors = [];

    if (actual.match_score !== expected.match_score) {
      errors.push(`score ${actual.match_score} != ${expected.match_score}`);
    }
    if (actual.workflow_state !== expected.workflow_state) {
      errors.push(`state ${actual.workflow_state} != ${expected.workflow_state}`);
    }
    if (actual.reason !== expected.reason) {
      errors.push(`reason ${JSON.stringify(actual.reason)} != ${JSON.stringify(expected.reason)}`);
    }
    if (JSON.stringify(signalSummary(actual.signals)) !== JSON.stringify(signalSummary(expected.signals))) {
      errors.push("matched signals changed");
    }

    if (errors.length) {
      mismatches.push(`${testCase.case_id} ${input.title}: ${errors.join("; ")}`);
    }
  });

  assert.deepEqual(
    mismatches,
    [],
    `LensItem production scoring regressions:\n${mismatches.join("\n")}`
  );
}

function testRecordQualityPreservation() {
  const { getRecordCaptureQuality, preserveRicherExistingRecord } = loadRecordLifecycleApi();
  const existing = {
    source: { id: "linkedin_jobs", source_item_id: "1", url: "https://old.example" },
    entity: { name: "Example", type: "company" },
    display: { primary_text: "Engineering Manager", secondary_text: "Example", tertiary_text: "Sydney" },
    content: { full_text: "x".repeat(600), summary: "Rich detail" },
    platform_state: { applied: false },
    capture: { adapter_warning: false },
    classification: { workflow_state: "apply", match_score: 90 },
    metadata: { extraction_mode: "job_detail" }
  };
  const incomingCard = {
    source: { id: "linkedin_jobs", source_item_id: "1", url: "https://new.example" },
    entity: { name: "Wrong", type: "company" },
    display: { primary_text: "More", secondary_text: "", tertiary_text: "" },
    content: { full_text: "short card" },
    platform_state: { applied: true },
    capture: { adapter_warning: true },
    classification: { workflow_state: "ignore", match_score: 0 },
    metadata: { extraction_mode: "collection_card" }
  };

  assert.ok(getRecordCaptureQuality(existing) > getRecordCaptureQuality(incomingCard));
  const preserved = plain(preserveRicherExistingRecord(existing, incomingCard));
  assert.equal(preserved.display.primary_text, "Engineering Manager");
  assert.equal(preserved.source.url, "https://new.example");
  assert.equal(preserved.platform_state.applied, true);
  assert.equal(preserved.classification.match_score, 90);

  const richerIncoming = {
    ...existing,
    content: { full_text: "y".repeat(2000), summary: "Richer detail" }
  };
  assert.equal(
    plain(preserveRicherExistingRecord(existing, richerIncoming)).content.summary,
    "Richer detail"
  );
}

function testReportCorpusAndCsvContract() {
  const { escapeCsv, getEffectiveWorkflowState, getRecordOpenUrl, toCsv } = loadReportExportApi();
  assert.equal(reportCorpus.length, 37);
  assert.equal(new Set(reportCorpus.map((record) => record.record_id)).size, reportCorpus.length);

  const sourceCounts = Object.groupBy(reportCorpus, (record) => record.source.id);
  assert.equal(sourceCounts.linkedin_jobs.length, 33);
  assert.equal(sourceCounts.seek_jobs.length, 4);

  reportCorpus.forEach((record) => {
    assert.ok(["apply", "review", "ignore", "applied"].includes(getEffectiveWorkflowState(record)));
    assert.match(getRecordOpenUrl(record), /^https:\/\//);
  });

  const csv = toCsv(reportCorpus);
  const lines = csv.split("\n");
  assert.equal(lines.length, reportCorpus.length + 1);
  assert.equal(
    lines[0],
    "effective_workflow_state,original_workflow_state,manual_override,feedback_value,feedback_reason,feedback_detail,feedback_updated_at,feedback_event_count,match_score,title,company,location,reason,positive_signals,negative_signals,blockers,notes,seen_count,last_seen_at,url,source_id,source_label,adapter_profile_id,adapter_profile_version"
  );
  assert.match(csv, /Registered Nurse - Surgical/);
  assert.match(csv, /Head of Product Engineering & AI/);
  assert.equal(escapeCsv(0), '"0"', "CSV must preserve zero match scores");
  assert.doesNotMatch(
    csv,
    /people clicked apply|responses managed|promoted by hirer/i,
    "CSV location must not contain LinkedIn activity metadata"
  );
}

function testPageFixtureManifest() {
  assert.equal(pageCases.length, 7);
  assert.equal(new Set(pageCases.map((item) => item.expected.job_id)).size, 7);
  assert.equal(pageCases.filter((item) => item.expected.capture_ready).length, 5);
  assert.equal(pageCases.filter((item) => !item.expected.capture_ready).length, 2);

  pageCases.forEach((item) => {
    assert.ok(fs.existsSync(path.join(root, "tests", "fixtures", "real-world", item.fixture)));
  });
}

function testPublicFixturePrivacy() {
  const pageFixtureText = pageCases
    .map((item) => read(`tests/fixtures/real-world/${item.fixture}`))
    .join("\n");
  assert.doesNotMatch(
    pageFixtureText,
    /trackingId|refId|referenceId|sessionId|conversationUrn|originalThreadMailbox|searchRequestToken|ACoA/i
  );

  pageCases.forEach((item) => {
    const queryKeys = [...new URL(item.expected.canonical_url).searchParams.keys()];
    assert.ok(
      queryKeys.every((key) => ["currentJobId", "jobId", "type"].includes(key)),
      `${item.case_id}: fixture URL contains a non-routing query parameter`
    );
  });

  const scoringText = JSON.stringify(scoringCorpus);
  assert.doesNotMatch(scoringText, /Shanice|Brett Wiskar|Luke on|1800 989 696/i);
  const fixtureEmails = scoringText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  assert.ok(fixtureEmails.every((email) => email.toLowerCase().endsWith("@example.com")));

  reportCorpus.forEach((record) => {
    assert.equal(record.classification.lens_pack_name, "My Job Search");
    assert.equal(record.memory.first_seen_at, "2000-01-01T00:00:00.000Z");
    assert.equal(record.memory.last_seen_at, "2000-01-01T00:00:00.000Z");
    assert.equal(record.memory.notes, "");
  });
}

testSingleCanonicalLensSource();
testRealWorldScoringCorpus();
testScoringDoesNotDependOnSignalIds();
testLensItemProductionScoringPath();
testRecordQualityPreservation();
testReportCorpusAndCsvContract();
testPageFixtureManifest();
testPublicFixturePrivacy();

console.log("ARK Lens characterization tests passed (37 scoring cases, 7 page fixtures)");
