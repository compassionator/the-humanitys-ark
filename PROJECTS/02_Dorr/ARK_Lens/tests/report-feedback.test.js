const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { evaluate, extractFunction, plain } = require("./helpers/source-contracts");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const reportSource = read("report/report.js");
const reportHtml = read("report/report.html");
const reportCss = read("report/report.css");
const contentSource = read("content_bundle.js");
const feedbackSchema = JSON.parse(read("schemas/relevance-feedback.schema.json"));

function idsFromHtml(html) {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
}

function loadFeedbackApi() {
  const names = [
    "getRelevanceReasonLabel",
    "getRelevanceFeedbackValue",
    "applyRelevanceFeedback",
    "clearRelevanceFeedback"
  ];

  return evaluate(names.map((name) => extractFunction(reportSource, name)).join("\n"), names);
}

function makeRecord() {
  return {
    record_id: "linkedin_jobs:123",
    source: { id: "linkedin_jobs", source_item_id: "123" },
    display: { primary_text: "Tax Collector", secondary_text: "Example Co" },
    classification: {
      lens_pack_id: "my_search",
      lens_pack_version: "v1.0.0",
      match_score: 55,
      workflow_state: "review",
      reason: "Some lexical evidence"
    },
    memory: {
      notes: "Existing note",
      user_workflow_override: "ignore",
      feedback_events: []
    }
  };
}

function testFeedbackIsSeparateFromWorkflowAndScore() {
  const { applyRelevanceFeedback, getRelevanceFeedbackValue } = loadFeedbackApi();
  const original = makeRecord();
  const updated = plain(applyRelevanceFeedback(original, {
    value: "not_relevant",
    reason: "wrong_job_family",
    detail: "Tax collection is unrelated to product engineering."
  }, "2026-07-16T10:00:00.000Z", "feedback-1"));

  assert.equal(getRelevanceFeedbackValue(updated), "not_relevant");
  assert.equal(updated.memory.relevance_feedback.schema_version, "1.0.0");
  assert.equal(updated.memory.relevance_feedback.reason, "wrong_job_family");
  assert.equal(updated.memory.user_workflow_override, "ignore");
  assert.equal(updated.classification.match_score, 55);
  assert.equal(updated.classification.workflow_state, "review");
  assert.equal(updated.classification.lens_pack_id, "my_search");
  assert.equal(updated.memory.feedback_events.length, 1);
  assert.deepEqual(updated.memory.feedback_events[0].context, {
    local_match_score: 55,
    original_workflow_state: "review",
    effective_workflow_state: "ignore",
    lens_pack_id: "my_search",
    lens_pack_version: "v1.0.0",
    source_id: "linkedin_jobs",
    title: "Tax Collector"
  });
  assert.equal(original.memory.relevance_feedback, undefined, "Original record was mutated");
}

function testFeedbackValidationAndBoundedHistory() {
  const { applyRelevanceFeedback, clearRelevanceFeedback } = loadFeedbackApi();
  const record = makeRecord();

  assert.throws(() => applyRelevanceFeedback(
    record,
    { value: "not_relevant", reason: "" },
    "2026-07-16T10:00:00.000Z",
    "bad-1"
  ), /reason/i);
  assert.throws(() => applyRelevanceFeedback(
    record,
    { value: "not_relevant", reason: "other", detail: "" },
    "2026-07-16T10:00:00.000Z",
    "bad-2"
  ), /detail/i);
  assert.throws(() => applyRelevanceFeedback(
    record,
    { value: "maybe" },
    "2026-07-16T10:00:00.000Z",
    "bad-3"
  ), /Relevant, Not relevant, or Unsure/);

  record.memory.feedback_events = Array.from({ length: 100 }, (_, index) => ({ id: `old-${index}` }));
  const updated = plain(applyRelevanceFeedback(record, {
    value: "relevant",
    reason: "",
    detail: ""
  }, "2026-07-16T11:00:00.000Z", "feedback-new"));
  assert.equal(updated.memory.feedback_events.length, 100);
  assert.equal(updated.memory.feedback_events[0].id, "old-1");
  assert.equal(updated.memory.feedback_events[99].id, "feedback-new");

  const cleared = plain(clearRelevanceFeedback(
    updated,
    "2026-07-16T12:00:00.000Z",
    "feedback-clear"
  ));
  assert.equal(cleared.memory.relevance_feedback, null);
  assert.equal(cleared.memory.feedback_events.at(-1).type, "relevance_feedback_cleared");
  assert.equal(cleared.classification.match_score, 55);
}

function testReasonTaxonomy() {
  const { getRelevanceReasonLabel } = loadFeedbackApi();
  const expected = {
    wrong_job_family: "Wrong job family",
    wrong_seniority: "Wrong seniority",
    wrong_domain: "Wrong domain",
    wrong_location: "Wrong location",
    too_hands_on: "Too hands-on",
    too_managerial: "Too managerial",
    technology_mismatch: "Technology mismatch",
    work_rights: "Work-rights issue",
    other: "Other"
  };

  Object.entries(expected).forEach(([value, label]) => {
    assert.equal(getRelevanceReasonLabel(value), label);
  });
}

function testFeedbackSchema() {
  assert.equal(feedbackSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(
    feedbackSchema.properties.current.anyOf[0].$ref,
    "#/$defs/currentFeedback"
  );
  assert.deepEqual(feedbackSchema.properties.current.anyOf[1], { type: "null" });
  assert.equal(feedbackSchema.properties.events.items.$ref, "#/$defs/feedbackEvent");
  assert.deepEqual(
    feedbackSchema.$defs.currentFeedback.properties.value.enum,
    ["relevant", "not_relevant", "unsure"]
  );
  assert.equal(feedbackSchema.$defs.feedbackEvent.properties.context.additionalProperties, false);
}

function testReportDrawerSurface() {
  const ids = idsFromHtml(reportHtml);
  [
    "filterRelevance",
    "reportFeedbackCounts",
    "drawerBackdrop",
    "recordDrawer",
    "drawerClose",
    "drawerTitle",
    "drawerCompany",
    "drawerOpenJob",
    "drawerState",
    "drawerPercentage",
    "drawerReason",
    "drawerWorkflow",
    "drawerPositiveSignals",
    "drawerNegativeSignals",
    "drawerBlockers",
    "drawerDescription",
    "drawerCaptureQuality",
    "drawerNotes",
    "drawerSaveNotes",
    "feedbackRelevant",
    "feedbackNotRelevant",
    "feedbackUnsure",
    "feedbackReasonGroup",
    "feedbackReason",
    "feedbackDetail",
    "saveFeedback",
    "clearFeedback",
    "feedbackHistory",
    "drawerNotice"
  ].forEach((id) => assert.equal(ids.has(id), true, `Missing report drawer control ${id}`));

  assert.match(reportHtml, /Job description/);
  assert.match(reportHtml, /Why this score/);
  assert.match(reportHtml, /Your relevance feedback/);
  assert.match(reportHtml, /This does not automatically change your Lens/);
  assert.doesNotMatch(reportHtml, /Rule Fit\s+0\/100/);
  assert.match(reportHtml, /value="low_match">Low Match \(10\.1–49\.99%\)/);
  assert.match(reportHtml, /value="ignore">Ignore \(10% or below\)/);
  assert.match(reportSource, /getFitDisplayState\(/);
  assert.match(reportSource, /openRecordDrawer\(record\.record_id\)/);
  assert.match(reportSource, /record\.content\?\.full_text/);
  assert.match(reportSource, /feedback_value/);
  assert.match(reportSource, /feedback_reason/);
  assert.doesNotMatch(reportSource, /\.innerHTML\s*=/);
  assert.match(reportCss, /\.record-drawer/);
  assert.match(reportCss, /\.drawer-backdrop/);
  assert.match(reportCss, /\.fit-percentage/);
  assert.match(reportCss, /\.fit-presentation/);
  assert.match(reportHtml, /<th class="col-fit">Fit<\/th>/);
  assert.match(reportHtml, /<th class="col-percentage" aria-label="Match percentage">%<\/th>/);
  assert.match(reportCss, /\.col-fit\s*\{\s*width:\s*116px;/);
  assert.match(reportCss, /\.col-percentage\s*\{[^}]*width:\s*82px;[^}]*text-align:\s*right;/s);
  assert.match(reportCss, /\.fit-label\s*\{\s*text-transform:\s*uppercase;/);
  assert.match(reportCss, /\.fit-percentage\s*\{[^}]*flex:\s*0 0 64px;[^}]*text-align:\s*right;/s);
  assert.match(reportCss, /--dorr-opportunity-accent:\s*#946200;/);
  assert.match(reportCss, /--dorr-question-accent:\s*#7c3aed;/);
  assert.match(reportCss, /--dorr-neutral-accent:\s*#64748b;/);
  assert.match(reportCss, /--dorr-threat-accent:\s*#b45353;/);
  assert.match(reportCss, /--dorr-done-accent:\s*#047857;/);
  assert.match(reportCss, /\.fit-percentage-apply\s*\{\s*color:\s*var\(--dorr-opportunity-accent\);/);
  assert.match(reportCss, /\.fit-percentage-review\s*\{\s*color:\s*var\(--dorr-question-accent\);/);
  assert.match(reportCss, /\.fit-percentage-low_match\s*\{\s*color:\s*var\(--dorr-neutral-accent\);/);
  assert.match(reportCss, /\.fit-percentage-ignore\s*\{\s*color:\s*var\(--dorr-neutral-accent\);/);
  assert.match(reportCss, /\.fit-percentage-applied\s*\{\s*color:\s*var\(--dorr-done-accent\);/);
  assert.match(reportCss, /\.badge-state-apply\s*\{[^}]*var\(--dorr-opportunity-text\);[^}]*var\(--dorr-opportunity-surface\);/s);
  assert.match(reportCss, /\.badge-state-review\s*\{[^}]*var\(--dorr-question-text\);[^}]*var\(--dorr-question-surface\);/s);
  assert.match(reportCss, /\.badge-state-low_match\s*\{[^}]*var\(--dorr-neutral-text\);[^}]*var\(--dorr-neutral-surface\);/s);
  assert.match(reportCss, /\.badge-state-ignore\s*\{[^}]*var\(--dorr-neutral-text\);[^}]*var\(--dorr-neutral-surface\);/s);
  assert.match(reportCss, /\.badge-state-applied\s*\{[^}]*var\(--dorr-done-text\);[^}]*var\(--dorr-done-surface\);/s);
  assert.match(reportCss, /\.relevance-badge-relevant\s*\{[^}]*var\(--dorr-opportunity-text\);[^}]*var\(--dorr-opportunity-surface\);/s);
  assert.match(reportCss, /\.relevance-badge-not_relevant\s*\{[^}]*var\(--dorr-neutral-text\);[^}]*var\(--dorr-neutral-surface\);/s);
  assert.match(reportCss, /\.relevance-badge-unsure\s*\{[^}]*var\(--dorr-question-text\);[^}]*var\(--dorr-question-surface\);/s);
  assert.match(reportCss, /\.signal-positive\s*\{[^}]*var\(--dorr-opportunity-text\);[^}]*var\(--dorr-opportunity-surface\);/s);
  assert.match(reportCss, /\.signal-negative,\s*\.signal-blocker\s*\{[^}]*var\(--dorr-threat-text\);[^}]*var\(--dorr-threat-surface\);/s);
  assert.match(reportCss, /\.evidence-positive \.evidence-item\s*\{[^}]*var\(--dorr-opportunity-accent\);[^}]*var\(--dorr-opportunity-subtle\);/s);
  assert.match(reportCss, /\.evidence-negative \.evidence-item,\s*\.evidence-blocker \.evidence-item\s*\{[^}]*var\(--dorr-threat-accent\);[^}]*var\(--dorr-threat-subtle\);/s);
  assert.match(reportCss, /button\[data-drawer-workflow="apply"\]\.active,[^}]*var\(--dorr-opportunity-accent\);/s);
  assert.match(reportCss, /button\[data-drawer-workflow="review"\]\.active,[^}]*var\(--dorr-question-accent\);/s);
  assert.match(reportCss, /button\[data-drawer-workflow="applied"\]\.active\s*\{[^}]*var\(--dorr-done-accent\);/s);
  assert.doesNotMatch(reportCss, /\.drawer-choice-row button\.active,[^}]*#1d4f6e/s);
  assert.doesNotMatch(reportCss.match(/:root\s*\{[^}]*\}/s)?.[0] || "", /blue/i);
  assert.equal(
    (reportSource.match(/percentage\.className = `fit-percentage fit-percentage-\$\{displayState\}`/g) || []).length,
    2,
    "Report rows and the details drawer must share the Dorr percentage mapping"
  );
  assert.match(reportCss, /\.drawer-score-summary \.fit-percentage\s*\{[^}]*flex-basis:\s*96px;/s);
  assert.match(reportSource, /percentage\.className = `fit-percentage fit-percentage-\$\{displayState\}`/);
  assert.match(reportSource, /fitCell\.className = "col-fit fit-label-cell"/);
  assert.match(reportSource, /percentageCell\.className = "col-percentage fit-percentage-cell"/);
  assert.match(reportSource, /stateBadge\.textContent = getStateLabel\([\s\S]*?\)\.toUpperCase\(\)/);
  assert.match(reportSource, /row\.appendChild\(fitCell\);\s*row\.appendChild\(percentageCell\);/);
  assert.match(
    contentSource,
    /record\.memory\s*=\s*\{\s*\.\.\.existing\.memory,/,
    "Recapturing a job must preserve notes, decisions, and relevance feedback"
  );
}

testFeedbackIsSeparateFromWorkflowAndScore();
testFeedbackValidationAndBoundedHistory();
testReasonTaxonomy();
testFeedbackSchema();
testReportDrawerSurface();

console.log("ARK Lens report details and relevance feedback contracts passed");
