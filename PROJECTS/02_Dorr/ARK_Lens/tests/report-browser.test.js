const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const reportHtml = read("report/report.html");
const reportCss = read("report/report.css");
const reportSource = read("report/report.js");
const lensPackRuntimeSource = read("lens-packs/lens_pack_runtime.js");
const bundledLensPackSource = read("lens-packs/bundled_lens_pack.js");
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));

if (!chromePath) {
  throw new Error("Chrome or Edge was not found. Set CHROME_PATH to run report browser tests.");
}

const record = {
  record_id: "linkedin_jobs:123456",
  record_type: "job",
  source: {
    id: "linkedin_jobs",
    source_item_id: "123456",
    url: "https://www.linkedin.com/jobs/view/123456/"
  },
  display: {
    primary_text: "Tax Collector",
    secondary_text: "Example Council",
    tertiary_text: "Sydney NSW"
  },
  content: {
    summary: "Collect tax payments and maintain revenue records.",
    full_text: "This complete captured description explains tax collection, compliance, and public revenue duties."
  },
  classification: {
    lens_pack_id: "bob_job_search",
    lens_pack_version: "v2026.06.019",
    match_score: 55,
    workflow_state: "review",
    reason: "Mixed lexical evidence",
    signals: {
      positive: [
        {
          id: "leadership",
          display_name: "Leadership",
          keywords: ["leadership"],
          reason: "Leadership phrase matched.",
          weight: 10,
          match_scope: "description"
        },
        {
          id: "operations",
          display_name: "Operations",
          keywords: ["operations"],
          reason: "Operations phrase matched.",
          weight: 5,
          match_scope: "description"
        }
      ],
      negative: [
        {
          id: "tax_collection",
          display_name: "Tax collection",
          keywords: ["tax collector"],
          reason: "The title belongs to another job family.",
          penalty: 20,
          match_scope: "title"
        }
      ],
      blockers: [
        {
          id: "work_rights",
          display_name: "Work rights",
          keywords: ["citizens only"],
          reason: "A work-rights restriction was found.",
          blocker: true,
          match_scope: "description"
        }
      ]
    }
  },
  capture: {
    method: "manual",
    adapter_warning: false
  },
  metadata: {
    extraction_mode: "job_detail",
    adapter_profile_id: "linkedin_builtin",
    adapter_profile_version: "1.0.0"
  },
  memory: {
    first_seen_at: "2026-07-16T08:00:00.000Z",
    last_seen_at: "2026-07-16T09:00:00.000Z",
    seen_count: 1,
    notes: "",
    user_workflow_override: null,
    relevance_feedback: null,
    feedback_events: []
  }
};

function inlineScript(source) {
  return source.replace(/<\/script/gi, "<\\/script");
}

function chromeMock() {
  return `(() => {
    const store = {
      ark_lens_records: {
        ${JSON.stringify(record.record_id)}: ${JSON.stringify(record)}
      }
    };
    const listeners = [];
    globalThis.__arkStore = store;
    globalThis.__arkErrors = [];
    globalThis.addEventListener("error", (event) => {
      globalThis.__arkErrors.push(event.error?.stack || event.message || "Unknown browser error");
    });
    globalThis.addEventListener("unhandledrejection", (event) => {
      globalThis.__arkErrors.push(event.reason?.stack || String(event.reason));
    });
    globalThis.chrome = {
      storage: {
        local: {
          async get(keys) {
            if (typeof keys === "string") return { [keys]: store[keys] };
            if (Array.isArray(keys)) {
              return Object.fromEntries(keys.map((key) => [key, store[key]]));
            }
            if (keys && typeof keys === "object") {
              return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [
                key,
                store[key] === undefined ? fallback : store[key]
              ]));
            }
            return { ...store };
          },
          async set(values) {
            const changes = {};
            Object.entries(values).forEach(([key, value]) => {
              changes[key] = { oldValue: store[key], newValue: value };
              store[key] = value;
            });
            listeners.forEach((listener) => listener(changes, "local"));
          }
        },
        onChanged: {
          addListener(listener) {
            listeners.push(listener);
          }
        }
      },
      tabs: {
        create() {}
      }
    };
  })();`;
}

function browserRunner() {
  return `(async () => {
    try {
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const waitFor = async (predicate, timeout = 5000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (predicate()) return true;
        await wait(20);
      }
      return false;
    };

    await waitFor(() => document.querySelectorAll('#rows tr[tabindex="0"]').length === 1);
    const row = document.querySelector('#rows tr[tabindex="0"]');
    if (!row) {
      throw new Error("Report row did not render: " + globalThis.__arkErrors.join(" | "));
    }
    row.click();
    await waitFor(() => !document.getElementById("recordDrawer").hidden);

    const initialClassification = JSON.stringify(
      globalThis.__arkStore.ark_lens_records[${JSON.stringify(record.record_id)}].classification
    );
    const drawer = document.getElementById("recordDrawer");
    const drawerSnapshot = {
      open: !drawer.hidden && !document.getElementById("drawerBackdrop").hidden,
      rowPercentage: row.querySelector(".fit-percentage")?.textContent || "",
      rowFitLabel: row.querySelector(".badge")?.textContent || "",
      rowFitCellIndex: row.querySelector(".fit-label-cell")?.cellIndex,
      rowPercentageCellIndex: row.querySelector(".fit-percentage-cell")?.cellIndex,
      rowJobCellIndex: row.querySelector(".job-title")?.closest("td")?.cellIndex,
      drawerPercentage: document.getElementById("drawerPercentage").textContent,
      drawerFitLabel: document.getElementById("drawerState").textContent,
      title: document.getElementById("drawerTitle").textContent,
      description: document.getElementById("drawerDescription").textContent,
      positiveCount: document.querySelectorAll("#drawerPositiveSignals .evidence-item").length,
      negativeCount: document.querySelectorAll("#drawerNegativeSignals .evidence-item").length,
      blockerCount: document.querySelectorAll("#drawerBlockers .evidence-item").length,
      captureQualityRows: document.querySelectorAll("#drawerCaptureQuality > div").length
    };

    document.getElementById("feedbackNotRelevant").click();
    const reasonGroupVisible = !document.getElementById("feedbackReasonGroup").hidden;
    document.getElementById("feedbackReason").value = "wrong_job_family";
    document.getElementById("feedbackDetail").value = "Tax collection is outside product engineering.";
    document.getElementById("saveFeedback").click();
    await waitFor(() => (
      globalThis.__arkStore.ark_lens_records[${JSON.stringify(record.record_id)}]
        ?.memory?.relevance_feedback?.value === "not_relevant"
    ));

    const afterFeedback = globalThis.__arkStore.ark_lens_records[${JSON.stringify(record.record_id)}];
    const classificationAfterFeedback = JSON.stringify(afterFeedback.classification);
    const event = afterFeedback.memory.feedback_events.at(-1);

    document.querySelector('[data-drawer-workflow="ignore"]').click();
    await waitFor(() => (
      globalThis.__arkStore.ark_lens_records[${JSON.stringify(record.record_id)}]
        ?.memory?.user_workflow_override === "ignore"
    ));

    document.getElementById("drawerNotes").value = "Ask about role scope.";
    document.getElementById("drawerSaveNotes").click();
    await waitFor(() => (
      globalThis.__arkStore.ark_lens_records[${JSON.stringify(record.record_id)}]
        ?.memory?.notes === "Ask about role scope."
    ));

    document.getElementById("filterRelevance").value = "not_relevant";
    document.getElementById("filterRelevance").dispatchEvent(new Event("change"));
    await wait(50);
    await waitFor(() => document.querySelectorAll('#rows tr[tabindex="0"]').length === 1);

    const finalRecord = globalThis.__arkStore.ark_lens_records[${JSON.stringify(record.record_id)}];
    const result = document.createElement("script");
    result.id = "ark-test-result";
    result.type = "application/json";
    result.textContent = JSON.stringify({
      drawerSnapshot,
      reasonGroupVisible,
      feedback: finalRecord.memory.relevance_feedback,
      event,
      feedbackHistoryCount: finalRecord.memory.feedback_events.length,
      classificationUnchangedByFeedback: initialClassification === classificationAfterFeedback,
      workflowOverride: finalRecord.memory.user_workflow_override,
      feedbackSurvivedWorkflowChange: finalRecord.memory.relevance_feedback?.value,
      notes: finalRecord.memory.notes,
      filteredRowCount: document.querySelectorAll('#rows tr[tabindex="0"]').length,
      filterValues: {
        state: document.getElementById("filterState").value,
        relevance: document.getElementById("filterRelevance").value,
        source: document.getElementById("filterSource").value,
        feedbackValue: getRelevanceFeedbackValue(finalRecord),
        visibleByFunction: getVisibleRecords([finalRecord]).length
      },
      summary: document.getElementById("reportFeedbackCounts").textContent
    }).replace(/</g, "\\u003c");
    document.head.textContent = "";
    document.body.replaceChildren(result);
    } catch (error) {
      const result = document.createElement("script");
      result.id = "ark-test-result";
      result.type = "application/json";
      result.textContent = JSON.stringify({ browserError: error?.stack || String(error) }).replace(/</g, "\\u003c");
      document.head.textContent = "";
      document.body.replaceChildren(result);
    }
  })();`;
}

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function buildHarness() {
  return reportHtml
    .replace('<link rel="stylesheet" href="report.css" />', () => `<style>${reportCss}</style>`)
    .replace('<script src="../lens-packs/bundled_lens_pack.js"></script>', () => [
      `<script>${inlineScript(chromeMock())}</script>`,
      `<script>${inlineScript(bundledLensPackSource)}</script>`
    ].join("\n"))
    .replace(
      '<script src="../lens-packs/lens_pack_runtime.js"></script>',
      () => `<script>${inlineScript(lensPackRuntimeSource)}</script>`
    )
    .replace('<script src="report.js"></script>', () => [
      `<script>${inlineScript(reportSource)}</script>`,
      `<script>${inlineScript(browserRunner())}</script>`
    ].join("\n"));
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ark-lens-report-"));
const harnessPath = path.join(tempDir, "report-harness.html");
const profilePath = path.join(tempDir, "profile");
fs.writeFileSync(harnessPath, buildHarness());

const browser = spawnSync(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-sandbox",
  "--allow-file-access-from-files",
  "--dump-dom",
  "--virtual-time-budget=12000",
  `--user-data-dir=${profilePath}`,
  harnessPath
], {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
  timeout: 45000
});

try {
  assert.equal(browser.status, 0, browser.stderr || "Report browser test failed");
  const marker = browser.stdout.match(
    /<script id="ark-test-result" type="application\/json">([\s\S]*?)<\/script>/i
  );
  assert.ok(
    marker,
    `Report browser test did not produce a result. ${browser.stderr || ""}\n${browser.stdout.slice(-4000)}`
  );
  const result = JSON.parse(decodeHtml(marker[1]));
  assert.equal(result.browserError, undefined, result.browserError);

  assert.equal(result.drawerSnapshot.open, true);
  assert.equal(result.drawerSnapshot.rowPercentage, "55%");
  assert.equal(result.drawerSnapshot.rowFitLabel, "REVIEW");
  assert.equal(result.drawerSnapshot.rowFitCellIndex, 1);
  assert.equal(result.drawerSnapshot.rowPercentageCellIndex, 2);
  assert.equal(result.drawerSnapshot.rowJobCellIndex, 3);
  assert.equal(result.drawerSnapshot.drawerPercentage, "55%");
  assert.equal(result.drawerSnapshot.drawerFitLabel, "REVIEW");
  assert.equal(result.drawerSnapshot.title, "Tax Collector");
  assert.match(result.drawerSnapshot.description, /complete captured description/);
  assert.equal(result.drawerSnapshot.positiveCount, 2);
  assert.equal(result.drawerSnapshot.negativeCount, 1);
  assert.equal(result.drawerSnapshot.blockerCount, 1);
  assert.ok(result.drawerSnapshot.captureQualityRows >= 8);
  assert.equal(result.reasonGroupVisible, true);
  assert.equal(result.feedback.value, "not_relevant");
  assert.equal(result.feedback.reason, "wrong_job_family");
  assert.equal(result.feedback.detail, "Tax collection is outside product engineering.");
  assert.equal(result.event.context.local_match_score, 55);
  assert.equal(result.feedbackHistoryCount, 1);
  assert.equal(result.classificationUnchangedByFeedback, true);
  assert.equal(result.workflowOverride, "ignore");
  assert.equal(result.feedbackSurvivedWorkflowChange, "not_relevant");
  assert.equal(result.notes, "Ask about role scope.");
  assert.equal(result.filteredRowCount, 1, JSON.stringify(result.filterValues));
  assert.match(result.summary, /Not relevant 1/);
} finally {
  if (process.env.ARK_KEEP_REPORT_HARNESS === "1") {
    console.error(`Report harness retained at ${harnessPath}`);
  } else {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

console.log("ARK Lens report details and feedback browser test passed");
