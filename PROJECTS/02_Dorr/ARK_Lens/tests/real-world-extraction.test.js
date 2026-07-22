const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const fixtureDir = path.join(root, "tests", "fixtures", "real-world");
const contentSource = fs.readFileSync(path.join(root, "content_bundle.js"), "utf8");
const lensPackRuntimeSource = fs.readFileSync(
  path.join(root, "lens-packs", "lens_pack_runtime.js"),
  "utf8"
);
const bundledLensPackSource = fs.readFileSync(
  path.join(root, "lens-packs", "bundled_lens_pack.js"),
  "utf8"
);
const lensItemRuntimeSource = fs.readFileSync(path.join(root, "core", "lens_item.js"), "utf8");
const matcherRuntimeSource = fs.readFileSync(
  path.join(root, "core", "deterministic_matcher.js"),
  "utf8"
);
const extractionResultRuntimeSource = fs.readFileSync(
  path.join(root, "core", "extraction_result.js"),
  "utf8"
);
const sourceAdapterRuntimeSource = fs.readFileSync(
  path.join(root, "sources", "source_adapter_registry.js"),
  "utf8"
);
const jobCompatibilityRuntimeSource = fs.readFileSync(
  path.join(root, "compatibility", "job_extraction_compat.js"),
  "utf8"
);
const jobCapturePolicyRuntimeSource = fs.readFileSync(
  path.join(root, "policies", "job_capture_policy.js"),
  "utf8"
);
const jobPolicyRuntimeSource = fs.readFileSync(
  path.join(root, "policies", "job_policy_runtime.js"),
  "utf8"
);
const pageCases = JSON.parse(
  fs.readFileSync(path.join(fixtureDir, "page-cases.json"), "utf8")
);
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));

if (!chromePath) {
  throw new Error("Chrome or Edge was not found. Set CHROME_PATH to run extraction tests.");
}

function fixtureBody(html) {
  return html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
}

function fixtureTitle(html) {
  return html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
}

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function makeChromeMock() {
  return `(() => {
    const store = {
      ark_lens_session: {
        active: true,
        session_id: "session_characterization",
        started_at: "2026-07-16T00:00:00.000Z",
        tab_id: 1,
        window_id: 1,
        mode: "same_tab_active_session",
        captured_count: 0
      },
      ark_lens_records: {}
    };
    const storageListeners = [];

    globalThis.__arkStore = store;
    globalThis.chrome = {
      runtime: {
        id: "ark-lens-characterization",
        onMessage: {
          addListener(listener) {
            globalThis.__arkMessageListener = listener;
          },
          removeListener(listener) {
            if (globalThis.__arkMessageListener === listener) {
              globalThis.__arkMessageListener = null;
            }
          }
        }
      },
      storage: {
        local: {
          async get(keys) {
            if (typeof keys === "string") return { [keys]: store[keys] };
            if (Array.isArray(keys)) {
              return Object.fromEntries(keys.map((key) => [key, store[key]]));
            }
            if (keys && typeof keys === "object") {
              return Object.fromEntries(
                Object.entries(keys).map(([key, fallback]) => [
                  key,
                  store[key] === undefined ? fallback : store[key]
                ])
              );
            }
            return { ...store };
          },
          async set(values) {
            const changes = {};
            Object.entries(values).forEach(([key, value]) => {
              changes[key] = { oldValue: store[key], newValue: value };
              store[key] = value;
            });
            storageListeners.forEach((listener) => listener(changes, "local"));
          }
        },
        onChanged: {
          addListener(listener) {
            storageListeners.push(listener);
          }
        }
      }
    };
  })();`;
}

function makeRunner(testCase) {
  const recordId = `${testCase.source_id}:${testCase.expected.job_id}`;

  return `(async () => {
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const deadline = Date.now() + 5000;

    while (typeof globalThis.__arkMessageListener !== "function" && Date.now() < deadline) {
      await wait(20);
    }

    let doctor = null;
    let repairValidation = null;
    let repairTest = null;
    let repairStorageUnchanged = true;
    let response = { ok: false, message: "Message listener did not initialize" };

    if (typeof globalThis.__arkMessageListener === "function") {
      doctor = await new Promise((resolve) => globalThis.__arkMessageListener(
        { type: "ARK_ADAPTER_DOCTOR_HEALTH_CHECK" },
        {},
        resolve
      ));
      const profileExport = await new Promise((resolve) => globalThis.__arkMessageListener(
        { type: "ARK_ADAPTER_DOCTOR_EXPORT_PROFILE" },
        {},
        resolve
      ));
      if (profileExport?.profile) {
        repairValidation = await new Promise((resolve) => globalThis.__arkMessageListener(
          { type: "ARK_ADAPTER_DOCTOR_VALIDATE_REPAIR", profile: profileExport.profile },
          {},
          resolve
        ));
        if (doctor?.health === "pass") {
          const beforeOverride = JSON.stringify(globalThis.__arkStore.ark_lens_adapter_profile_overrides || {});
          repairTest = await new Promise((resolve) => globalThis.__arkMessageListener(
            { type: "ARK_ADAPTER_DOCTOR_TEST_REPAIR", profile: profileExport.profile },
            {},
            resolve
          ));
          const afterOverride = JSON.stringify(globalThis.__arkStore.ark_lens_adapter_profile_overrides || {});
          repairStorageUnchanged = beforeOverride === afterOverride;
        }
      }
      response = await new Promise((resolve) => globalThis.__arkMessageListener(
        { type: "ARK_CAPTURE_NOW" },
        {},
        resolve
      ));
    }

    const record = globalThis.__arkStore.ark_lens_records[${JSON.stringify(recordId)}] || null;
    const result = document.createElement("script");
    result.id = "ark-test-result";
    result.type = "application/json";
    result.textContent = JSON.stringify({
      response,
      doctor,
      repairValidation,
      repairTest,
      repairStorageUnchanged,
      record
    }).replace(/</g, "\\u003c");
    document.head.textContent = "";
    document.body.replaceChildren(result);
  })();`;
}

function runFixture(testCase, options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `ark-lens-${testCase.case_id}-`));
  const harnessPath = path.join(tempDir, "harness.html");
  const profilePath = path.join(tempDir, "profile");
  const fixture = fs.readFileSync(path.join(fixtureDir, testCase.fixture), "utf8");
  const transformedBundle = contentSource
    .replace("(async () => {", "(async (location) => {")
    .replace(/\}\)\(\);\s*$/, "})(globalThis.__arkMockLocation);");
  assert.notEqual(transformedBundle, contentSource, "Content bundle test transform failed");

  const harness = `<!doctype html><html><head><meta charset="utf-8"><title>${fixtureTitle(fixture)}</title></head><body>
    ${fixtureBody(fixture)}
    <script>${options.beforeBundle || ""}</script>
    <script>${bundledLensPackSource}</script>
    <script>${lensPackRuntimeSource}</script>
    <script>${lensItemRuntimeSource}</script>
    <script>${matcherRuntimeSource}</script>
    <script>${extractionResultRuntimeSource}</script>
    <script>${sourceAdapterRuntimeSource}</script>
    <script>${jobCompatibilityRuntimeSource}</script>
    <script>${jobCapturePolicyRuntimeSource}</script>
    <script>${jobPolicyRuntimeSource}</script>
    <script>
      globalThis.__arkMockLocation = ${JSON.stringify(testCase.mock_location)};
      ${makeChromeMock()}
    </script>
    <script>${transformedBundle}</script>
    <script>${makeRunner(testCase)}</script>
  </body></html>`;
  fs.writeFileSync(harnessPath, harness);

  const result = spawnSync(chromePath, [
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
    assert.equal(result.status, 0, result.stderr || `${testCase.case_id} Chrome run failed`);
    const marker = result.stdout.match(
      /<script id="ark-test-result" type="application\/json">([\s\S]*?)<\/script>/i
    );
    assert.ok(marker, `${testCase.case_id} did not produce a browser result`);
    return JSON.parse(decodeHtml(marker[1]));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function assertReadyCapture(testCase, result) {
  const expected = testCase.expected;
  const record = result.record;

  assert.equal(result.response.ok, true, `${testCase.case_id}: ${result.response.message || "capture failed"}`);
  const expectedExtractionStatus = testCase.case_id === "page_1" ? "partial" : "complete";
  assert.equal(result.response.extraction_status, expectedExtractionStatus);
  assert.equal(
    result.response.capture_quality.level,
    expectedExtractionStatus === "complete" ? "complete" : "degraded"
  );
  assert.equal(
    result.response.capture_quality.required_captured,
    result.response.capture_quality.required_total
  );
  assert.deepEqual(result.response.missing_capabilities, []);
  assert.ok(record, `${testCase.case_id}: record was not saved`);
  assert.equal(record.source.id, testCase.source_id);
  assert.equal(String(record.source.source_item_id), expected.job_id);
  assert.equal(normalize(record.display.primary_text), normalize(expected.title));
  assert.equal(normalize(record.display.secondary_text), normalize(expected.company));
  const locationAnchor = expected.location
    .split(",")[0]
    .replace(/\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b.*$/i, "")
    .trim();
  assert.match(
    normalize(record.display.tertiary_text),
    new RegExp(locationAnchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
  );
  assert.ok(normalize(record.content.full_text).length >= 20);
  assert.equal(result.doctor.fields.job_id, expected.job_id);
  assert.equal(normalize(result.doctor.fields.title), normalize(expected.title));
  assert.equal(result.repairValidation?.validation?.valid, true);

  if (result.doctor.health === "pass") {
    assert.equal(result.repairTest?.can_activate, true);
    assert.equal(result.repairStorageUnchanged, true, "Repair test activated storage before approval");
  }

  if (testCase.source_id === "linkedin_jobs") {
    assert.equal(
      record.source.url,
      `https://www.linkedin.com/jobs/view/${encodeURIComponent(expected.job_id)}/`
    );
  } else {
    assert.equal(record.source.url, expected.canonical_url);
    if (normalize(record.metadata.posted)) {
      assert.match(normalize(record.metadata.posted), /(?:posted|ago|reposted|\d+[dhwmy]\b)/i);
    }
    assert.match(normalize(record.metadata.work_type), /full time/i);
    if (expected.salary && !/^n\/?a$/i.test(expected.salary)) {
      assert.equal(normalize(record.metadata.salary), normalize(expected.salary));
    }
  }

  if (expected.already_applied) {
    assert.equal(record.classification.workflow_state, "applied");
  }
}

function assertIncompleteCapture(testCase, result) {
  assert.equal(result.response.ok, false, `${testCase.case_id}: incomplete DOM unexpectedly captured`);
  assert.equal(result.response.extraction_status, "unsupported");
  assert.equal(result.response.capture_quality.level, "insufficient");
  assert.equal(result.record, null);
  assert.ok(["wait", "fail"].includes(result.doctor.health));
  assert.equal(result.doctor.fields.job_id, testCase.expected.job_id);
  assert.ok(
    result.doctor.missing_fields.includes("title") ||
      result.doctor.missing_fields.includes("company") ||
      result.doctor.missing_fields.includes("description")
  );
  assert.ok(result.doctor.selector_diagnostics.length > 0);
  assert.ok(result.doctor.dom_discovery.candidates.length >= 0);
}

const outcomes = [];
const selectedCases = process.env.ARK_PAGE_CASE
  ? pageCases.filter((item) => item.case_id === process.env.ARK_PAGE_CASE)
  : pageCases;

selectedCases.forEach((testCase) => {
  const result = runFixture(testCase);

  if (process.env.ARK_DEBUG_EXTRACTION === "1") {
    console.log(JSON.stringify({
      case_id: testCase.case_id,
      response: result.response,
      health: result.doctor?.health,
      missing_fields: result.doctor?.missing_fields,
      title: result.record?.display?.primary_text,
      company: result.record?.display?.secondary_text,
      location: result.record?.display?.tertiary_text,
      state: result.record?.classification?.workflow_state,
      score: result.record?.classification?.match_score,
      extraction_mode: result.record?.metadata?.extraction_mode
    }, null, 2));
  }

  if (testCase.expected.capture_ready) assertReadyCapture(testCase, result);
  else assertIncompleteCapture(testCase, result);

  outcomes.push({
    case_id: testCase.case_id,
    ready: testCase.expected.capture_ready,
    health: result.doctor?.health || "missing",
    extraction_mode: result.record?.metadata?.extraction_mode || null,
    extraction_status: result.response?.extraction_status || null
  });
});

if (!process.env.ARK_PAGE_CASE) {
  assert.equal(outcomes.filter((item) => item.ready).length, 5);
  assert.equal(outcomes.filter((item) => !item.ready).length, 2);
  assert.ok(outcomes.some((item) => item.extraction_mode === "job_detail"));
  assert.ok(outcomes.some((item) => /^(?:recommendation|collection)_card$/.test(item.extraction_mode)));

  const seekCacheCase = pageCases.find((item) => item.case_id === "page_7");
  const seekCacheResult = runFixture(seekCacheCase, {
    beforeBundle: `document.querySelectorAll([
      '[data-automation="jobAdDetails"]',
      '[data-automation="job-ad-details"]',
      '[data-automation="job-detail-description"]',
      '[data-automation="jobShortDescription"]'
    ].join(",")).forEach((element) => element.remove());`
  });
  assert.equal(seekCacheResult.response.ok, true);
  assert.equal(seekCacheResult.record.metadata.extraction_mode, "search_result_cache");
  assert.equal(seekCacheResult.record.display.primary_text, "Registered Nurse - Surgical");
}

console.log("ARK Lens real-world extraction tests passed");
console.log(JSON.stringify(outcomes, null, 2));
