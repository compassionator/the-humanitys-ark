const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const contentSource = fs.readFileSync(path.join(root, "content_bundle.js"), "utf8");
const lensPackRuntimeSource = fs.readFileSync(path.join(root, "lens-packs", "lens_pack_runtime.js"), "utf8");
const bundledLensPackSource = fs.readFileSync(path.join(root, "lens-packs", "bundled_lens_pack.js"), "utf8");
const lensItemRuntimeSource = fs.readFileSync(path.join(root, "core", "lens_item.js"), "utf8");
const matcherRuntimeSource = fs.readFileSync(path.join(root, "core", "deterministic_matcher.js"), "utf8");
const extractionResultRuntimeSource = fs.readFileSync(path.join(root, "core", "extraction_result.js"), "utf8");
const sourceAdapterRuntimeSource = fs.readFileSync(path.join(root, "sources", "source_adapter_registry.js"), "utf8");
const jobSourceCatalogueSource = fs.readFileSync(path.join(root, "sources", "jobs", "job_source_catalogue.js"), "utf8");
const domReadUtilsSource = fs.readFileSync(path.join(root, "sources", "dom_read_utils.js"), "utf8");
const adapterDiagnosticsSource = fs.readFileSync(path.join(root, "sources", "adapter_diagnostics.js"), "utf8");
const jobExtractionBuilderSource = fs.readFileSync(path.join(root, "sources", "jobs", "job_extraction_builder.js"), "utf8");
const jobAdapterResultSource = fs.readFileSync(path.join(root, "sources", "jobs", "job_adapter_result.js"), "utf8");
const linkedInJobsAdapterSource = fs.readFileSync(path.join(root, "sources", "jobs", "linkedin_jobs_adapter.js"), "utf8");
const seekJobsAdapterSource = fs.readFileSync(path.join(root, "sources", "jobs", "seek_jobs_adapter.js"), "utf8");
const jobCompatibilityRuntimeSource = fs.readFileSync(path.join(root, "compatibility", "job_extraction_compat.js"), "utf8");
const jobCapturePolicyRuntimeSource = fs.readFileSync(path.join(root, "policies", "job_capture_policy.js"), "utf8");
const jobPolicyRuntimeSource = fs.readFileSync(path.join(root, "policies", "job_policy_runtime.js"), "utf8");
const outputDir = process.env.ARK_VISUAL_OUTPUT || path.join(root, "tests", "artifacts");
const profileDir = path.join(os.tmpdir(), `ark-lens-visual-${process.pid}`);
const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
const port = 9400 + (process.pid % 200);
const webPort = port + 1;

if (!chromePath) {
  throw new Error("Chrome or Edge was not found. Set CHROME_PATH to run visual smoke tests.");
}

fs.mkdirSync(outputDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJson(url, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (_error) {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function makeRecord({ id, sourceId, title, company, location, score, state, posted, interest }) {
  return {
    schema_version: "v2026.06.001",
    record_id: `${sourceId}:${id}`,
    source: {
      id: sourceId,
      source_item_id: id,
      url: sourceId === "seek_jobs"
        ? `https://au.seek.com/jobs?jobId=${id}&type=standard`
        : `https://www.linkedin.com/jobs/view/${id}/`
    },
    display: {
      primary_text: title,
      secondary_text: company,
      tertiary_text: `${location} \u00b7 ${posted} \u00b7 ${interest}`
    },
    content: { full_text: `${title} ${company} product strategy AI delivery` },
    classification: {
      workflow_state: state,
      match_score: score,
      reason: score >= 80 ? "Strong match" : "Review due to mixed signals",
      signals: {
        positive: [{ id: "leadership_title", keywords: ["engineering manager"] }],
        negative: score < 70 ? [{ id: "cloud_heavy", keywords: ["aws preferred"] }] : [],
        blockers: []
      }
    },
    capture: { adapter_warning: false },
    metadata: {
      raw_location_text: location,
      posted,
      interest_text: interest,
      extraction_mode: "job_detail"
    },
    memory: {
      first_seen_at: "2026-07-15T01:30:00.000Z",
      last_seen_at: "2026-07-15T02:35:00.000Z",
      seen_count: 1,
      user_workflow_override: null,
      notes: id === "4439789246" ? "Example follow-up note" : ""
    }
  };
}

const lensPack = {
  id: "bob_job_search",
  name: "My Job Search",
  version: "v2026.06.003",
  lens_pack_id: "bob_job_search",
  lens_pack_version: "v2026.06.003",
  source_adapter: "linkedin_jobs",
  supported_source_adapters: ["linkedin_jobs", "seek_jobs"],
  active_source_adapter: "linkedin_jobs",
  mode: "same_tab_active_session",
  behavior: "report_only",
  signal_groups: {
    must_have: [
      { id: "leadership_title", keywords: ["engineering manager", "head of engineering"], weight: 35 },
      { id: "product_engineering_leadership", keywords: ["product strategy", "stakeholder management"], weight: 20 }
    ],
    nice_to_have: [
      { id: "preferred_domains", keywords: ["fintech", "saas"], weight: 15 },
      { id: "ai_product_delivery", keywords: ["ai", "llm"], weight: 10 }
    ],
    should_not_have: [
      { id: "cloud_heavy", keywords: ["aws preferred"], penalty: 20, reason: "Too cloud heavy" },
      { id: "scrum_master_heavy", keywords: ["scrum master"], penalty: 25, reason: "Too process focused" },
      { id: "wrong_engineering_discipline", keywords: ["civil engineering"], penalty: 60 }
    ],
    blockers: [
      { id: "citizenship_or_clearance", keywords: ["nv1"], reason: "Clearance blocker" }
    ]
  }
};

const records = [
  makeRecord({
    id: "4439789246",
    sourceId: "linkedin_jobs",
    title: "Engineering Manager, Developer Experience",
    company: "Cover Genius",
    location: "Sydney, New South Wales, Australia",
    score: 92,
    state: "apply",
    posted: "3 days ago",
    interest: "Over 100 people clicked apply"
  }),
  makeRecord({
    id: "92971234",
    sourceId: "seek_jobs",
    title: "Head of Engineering, Payments Platform",
    company: "Example Fintech",
    location: "Melbourne VIC",
    score: 85,
    state: "apply",
    posted: "2 days ago",
    interest: ""
  }),
  makeRecord({
    id: "4416392545",
    sourceId: "linkedin_jobs",
    title: "Technical Program Manager",
    company: "Canva",
    location: "Sydney, New South Wales, Australia",
    score: 70,
    state: "review",
    posted: "1 week ago",
    interest: "74 people clicked apply"
  }),
  makeRecord({
    id: "92840174",
    sourceId: "seek_jobs",
    title: "Engineering Manager, Cloud and Data",
    company: "Example Software Group",
    location: "Brisbane QLD",
    score: 55,
    state: "review",
    posted: "6 days ago",
    interest: ""
  })
];

const rootUrl = `http://127.0.0.1:${webPort}/`;
const mockSource = `(() => {
  const store = ${JSON.stringify({
    ark_lens_records: Object.fromEntries(records.map((record) => [record.record_id, record])),
    ark_lens_packs: { bob_job_search: lensPack },
    ark_lens_active_lens_pack_id: "bob_job_search",
    ark_lens_session: {
      active: true,
      session_id: "session_1784071800000",
      tab_id: 42,
      window_id: 7,
      captured_count: 4,
      last_captured_title: "Engineering Manager, Cloud and Data"
    }
  })};
  const storageListeners = [];
  const mockChrome = {
    runtime: {
      id: "visual-smoke",
      getURL: (value) => new URL(value, ${JSON.stringify(rootUrl)}).href,
      onMessage: { addListener: (listener) => { globalThis.__arkMessageListener = listener; } }
    },
    storage: {
      local: {
        get: async (keys) => {
          if (typeof keys === "string") return { [keys]: store[keys] };
          if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, store[key]]));
          return { ...store };
        },
        set: async (updates) => {
          Object.assign(store, updates);
          storageListeners.forEach((listener) => listener({}, "local"));
        }
      },
      onChanged: { addListener: (listener) => storageListeners.push(listener) }
    },
    scripting: { executeScript: async () => [] },
    tabs: {
      query: async () => [{ id: 42, windowId: 7, url: "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4439789246" }],
      create: async () => ({}),
      sendMessage: async (_tabId, message) => {
        if (message.type === "ARK_ADAPTER_DOCTOR_STATUS") {
          return {
            source_adapter_id: "linkedin_jobs",
            source_adapter_display_name: "LinkedIn Jobs",
            adapter_status: "implemented",
            adapter_profile_id: "linkedin_jobs_default_profile",
            adapter_profile_version: "v2026.06.005f",
            profile_source: "default",
            supported_by_active_lens: true,
            message: "Ready"
          };
        }
        if (message.type === "ARK_ADAPTER_DOCTOR_HEALTH_CHECK") {
          return {
            ok: true,
            health: "pass",
            checks: [
              { id: "source", label: "Supported source", status: "pass", detail: "LinkedIn Jobs" },
              { id: "identity", label: "Selected job identity", status: "pass", detail: "Job 4439789246" },
              { id: "extraction", label: "Extraction mode", status: "pass", detail: "job_detail" }
            ],
            next_action: "Capture is ready.",
            status: {
              source_adapter_id: "linkedin_jobs",
              source_adapter_display_name: "LinkedIn Jobs",
              adapter_profile_id: "linkedin_jobs_default_profile",
              adapter_profile_version: "v2026.06.005f",
              profile_source: "default"
            }
          };
        }
        if (message.type === "ARK_CAPTURE_NOW") {
          return { ok: true, title: "Engineering Manager, Developer Experience" };
        }
        return { ok: true };
      }
    }
  };
  try {
    Object.defineProperty(globalThis, "chrome", { value: mockChrome, configurable: true });
  } catch (_error) {
    Object.assign(globalThis.chrome, mockChrome);
  }
  globalThis.__arkStore = store;
  globalThis.confirm = () => true;
  globalThis.prompt = (_message, value = "") => value;
})();`;

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = reject;
    });
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (!pending) return;
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else {
        this.events.push(message);
      }
    };
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, method === "Runtime.evaluate" ? 12000 : 5000);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function capturePage(client, relativePath, name, width, height) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  });
  const navigation = await client.send("Page.navigate", {
    url: new URL(relativePath, rootUrl).href
  });
  if (navigation.errorText && navigation.errorText !== "net::ERR_ABORTED") {
    throw new Error(`Navigation failed for ${relativePath}: ${navigation.errorText}`);
  }
  await sleep(1200);

  const metricsResult = await client.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      bodyWidth: document.body.getBoundingClientRect().width,
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      horizontalOverflow: document.body.scrollWidth > document.documentElement.clientWidth,
      visibleRows: document.querySelectorAll("tbody tr").length,
      maxRowHeight: Math.max(0, ...[...document.querySelectorAll("tbody tr")].map((row) => row.getBoundingClientRect().height)),
      checkedSources: [...document.querySelectorAll("#sourceOptions input:checked")].map((input) => input.value),
      hasLensEditorLink: Boolean(document.querySelector("#editLens"))
    })`,
    returnByValue: true
  });
  const htmlResult = await client.send("Runtime.evaluate", {
    expression: "document.documentElement.outerHTML",
    returnByValue: true
  });
  const cssText = fs.readFileSync(
    path.join(root, relativePath.replace(/\.html$/, ".css")),
    "utf8"
  );
  const staticHtml = htmlResult.result.value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*href="[^"]+\.css"[^>]*>/i, `<style>${cssText}</style>`);

  fs.writeFileSync(path.join(outputDir, `${name}.html`), staticHtml);
  return JSON.parse(metricsResult.result.value);
}

async function runAdapterFixture(client, {
  fixture,
  mockLocation,
  recordId,
  beforeCapture = "",
  doctorBeforeCapture = false,
  skipManualCapture = false
}) {
  const navigation = await client.send("Page.navigate", {
    url: new URL(fixture, rootUrl).href
  });
  if (navigation.errorText && navigation.errorText !== "net::ERR_ABORTED") {
    throw new Error(`Adapter fixture navigation failed: ${navigation.errorText}`);
  }
  await sleep(500);

  const transformedBundle = contentSource
    .replace("(async () => {", "(async (location) => {")
    .replace(/\}\)\(\);\s*$/, "})(globalThis.__arkMockLocation);");
  assert.notEqual(transformedBundle, contentSource, "Content bundle test transform failed");

  const initialization = await client.send("Runtime.evaluate", {
    expression: `
      globalThis.__arkLensInitialized = false;
      globalThis.__arkLensVersion = "";
      globalThis.__arkMockLocation = ${JSON.stringify(mockLocation)};
      ${bundledLensPackSource}
      ${lensPackRuntimeSource}
      ${lensItemRuntimeSource}
      ${matcherRuntimeSource}
      ${extractionResultRuntimeSource}
      ${sourceAdapterRuntimeSource}
      ${jobSourceCatalogueSource}
      ${domReadUtilsSource}
      ${adapterDiagnosticsSource}
      ${jobExtractionBuilderSource}
      ${jobAdapterResultSource}
      ${linkedInJobsAdapterSource}
      ${seekJobsAdapterSource}
      ${jobCompatibilityRuntimeSource}
      ${jobCapturePolicyRuntimeSource}
      ${jobPolicyRuntimeSource}
      ${transformedBundle}
    `,
    awaitPromise: true,
    returnByValue: true
  });
  if (initialization.exceptionDetails) {
    throw new Error(`Content bundle fixture initialization failed: ${JSON.stringify(initialization.exceptionDetails)}`);
  }

  let doctorHealth = null;

  if (doctorBeforeCapture) {
    const doctorResult = await client.send("Runtime.evaluate", {
      expression: `new Promise((resolve) => globalThis.__arkMessageListener(
        { type: "ARK_ADAPTER_DOCTOR_HEALTH_CHECK" },
        {},
        resolve
      ))`,
      awaitPromise: true,
      returnByValue: true
    });
    if (doctorResult.exceptionDetails) {
      throw new Error(`Adapter Doctor fixture failed: ${JSON.stringify(doctorResult.exceptionDetails)}`);
    }
    doctorHealth = doctorResult.result.value;
  }

  if (beforeCapture) {
    const preparation = await client.send("Runtime.evaluate", {
      expression: beforeCapture,
      awaitPromise: true,
      returnByValue: true
    });
    if (preparation.exceptionDetails) {
      throw new Error(`Adapter fixture preparation failed: ${JSON.stringify(preparation.exceptionDetails)}`);
    }
  }

  if (skipManualCapture) {
    const savedRecord = await client.send("Runtime.evaluate", {
      expression: `globalThis.__arkStore.ark_lens_records[${JSON.stringify(recordId)}] || null`,
      returnByValue: true
    });

    return {
      response: { ok: Boolean(savedRecord.result.value) },
      record: savedRecord.result.value,
      doctorHealth
    };
  }

  const capture = await client.send("Runtime.evaluate", {
    expression: `new Promise((resolve) => {
      if (typeof globalThis.__arkMessageListener !== "function") {
        resolve({ response: { ok: false, message: "Message listener missing" }, record: null });
        return;
      }
      globalThis.__arkMessageListener(
        { type: "ARK_CAPTURE_NOW" },
        {},
        (response) => resolve({ response, record: globalThis.__arkStore.ark_lens_records[${JSON.stringify(recordId)}] || null })
      );
    })`,
    awaitPromise: true,
    returnByValue: true
  });
  if (capture.exceptionDetails) {
    throw new Error(`Adapter fixture capture failed: ${JSON.stringify(capture.exceptionDetails)}`);
  }

  return { ...capture.result.value, doctorHealth };
}

async function testLinkedInAutoCapture(client) {
  const result = await client.send("Runtime.evaluate", {
    expression: `(async () => {
      const send = (message) => new Promise((resolve) => {
        const returned = globalThis.__arkMessageListener(message, {}, resolve);
        if (returned !== true) resolve({ ok: true });
      });
      await send({ type: "ARK_START_LISTENING" });

      const root = document.querySelector(".jobs-search__job-details--container");
      const titleLink = root.querySelector(".job-details-jobs-unified-top-card__job-title a");
      const companyLink = root.querySelector(".job-details-jobs-unified-top-card__company-name a");
      const location = root.querySelector(".job-details-jobs-unified-top-card__tertiary-description-container");
      const description = root.querySelector("#job-details");
      const applyButton = root.querySelector("button[aria-label^='Apply to ']");

      globalThis.__arkMockLocation.href = "https://www.linkedin.com/jobs/search-results/?currentJobId=4439789999";
      globalThis.__arkMockLocation.pathname = "/jobs/search-results/";

      await new Promise((resolve) => setTimeout(resolve, 2400));
      const staleRecord = globalThis.__arkStore.ark_lens_records["linkedin_jobs:4439789999"] || null;

      titleLink.textContent = "Director of Engineering, Product Platform";
      companyLink.textContent = "Example Product Company";
      location.textContent = "Melbourne, Victoria, Australia · 1 day ago · 42 applicants";
      description.textContent = "Lead engineering leadership, product strategy, stakeholder management, delivery leadership, SaaS, automation, and responsible AI delivery across a cross-functional product platform organisation.";
      applyButton.setAttribute("aria-label", "Apply to Director of Engineering, Product Platform at Example Product Company");

      await new Promise((resolve) => setTimeout(resolve, 3200));
      const autoRecord = globalThis.__arkStore.ark_lens_records["linkedin_jobs:4439789999"] || null;

      globalThis.__arkMessageListener({ type: "ARK_STOP_LISTENING" }, {}, () => {});
      globalThis.__arkMockLocation.href = "https://www.linkedin.com/jobs/search-results/?currentJobId=4439789998";
      globalThis.__arkMockLocation.pathname = "/jobs/search-results/";
      titleLink.textContent = "Engineering Manager, Stopped Session";
      await new Promise((resolve) => setTimeout(resolve, 2200));

      return {
        staleRecord,
        autoRecord,
        capturedAfterStop: Boolean(globalThis.__arkStore.ark_lens_records["linkedin_jobs:4439789998"])
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  if (result.exceptionDetails) {
    throw new Error(`LinkedIn auto-capture fixture failed: ${JSON.stringify(result.exceptionDetails)}`);
  }

  return result.result.value;
}

async function renderStaticScreenshot(name, width, height) {
  const screenshotProfile = `${profileDir}-screenshot-${name}`;
  const screenshotPath = path.join(outputDir, `${name}.png`);
  const sourcePath = pathToFileURL(path.join(outputDir, `${name}.html`)).href;
  const process = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--allow-file-access-from-files",
    "--no-first-run",
    `--user-data-dir=${screenshotProfile}`,
    `--window-size=${width},${height}`,
    `--screenshot=${screenshotPath}`,
    sourcePath
  ], { stdio: "ignore" });

  try {
    await Promise.race([
      new Promise((resolve, reject) => {
        process.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Static screenshot failed for ${name} with exit code ${code}`));
        });
        process.on("error", reject);
      }),
      sleep(20000).then(() => {
        throw new Error(`Static screenshot timed out for ${name}`);
      })
    ]);
  } finally {
    process.kill();
    fs.rmSync(screenshotProfile, { recursive: true, force: true });
  }
}

async function main() {
  const server = http.createServer((request, response) => {
    try {
      const requestPath = decodeURIComponent(new URL(request.url, rootUrl).pathname);
      const filePath = path.resolve(root, `.${requestPath}`);

      if (!filePath.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end();
        return;
      }

      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        response.writeHead(404).end();
        return;
      }

      const extension = path.extname(filePath);
      const contentTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8"
      };
      response.writeHead(200, { "Content-Type": contentTypes[extension] || "text/plain" });
      fs.createReadStream(filePath).pipe(response);
    } catch (_error) {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(webPort, "127.0.0.1", resolve));

  const browser = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--allow-file-access-from-files",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "about:blank"
  ], { stdio: "ignore" });

  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const pages = await waitForJson(`http://127.0.0.1:${port}/json`);
    const page = pages.find((target) => target.type === "page");

    if (!page) {
      throw new Error("Headless browser did not expose a page target.");
    }

    const client = new CdpClient(page.webSocketDebuggerUrl);
    await client.open();
    console.log("Connected to headless browser");
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: mockSource });

    console.log("Rendering report");
    const reportMetrics = await capturePage(client, "report/report.html", "report", 1440, 900);
    console.log("Rendering popup");
    const popupMetrics = await capturePage(client, "popup/popup.html", "popup", 390, 900);
    const exceptions = client.events.filter((event) => event.method === "Runtime.exceptionThrown");

    if (exceptions.length > 0) {
      throw new Error(`Browser exceptions: ${JSON.stringify(exceptions)}`);
    }
    if (reportMetrics.visibleRows !== records.length || reportMetrics.maxRowHeight > 90) {
      throw new Error(`Report layout regression: ${JSON.stringify(reportMetrics)}`);
    }
    if (popupMetrics.horizontalOverflow) {
      throw new Error(`Popup horizontal overflow: ${JSON.stringify(popupMetrics)}`);
    }
    if (
      !popupMetrics.hasLensEditorLink ||
      popupMetrics.checkedSources.join(",") !== "linkedin_jobs,seek_jobs"
    ) {
      throw new Error(`Popup state regression: ${JSON.stringify(popupMetrics)}`);
    }

    await renderStaticScreenshot("report", 1440, 900);
    await renderStaticScreenshot("popup", 390, 900);

    console.log("Testing SEEK extraction");
    const seekUrl = "https://au.seek.com/ai-engineer-real-time-jobs-in-information-communication-technology/engineering-software/in-Melbourne-VIC-3000?jobId=92971234&type=standard";
    const seekCapture = await runAdapterFixture(client, {
      fixture: "tests/fixtures/seek-job.html",
      mockLocation: {
        href: seekUrl,
        hostname: "au.seek.com",
        pathname: "/ai-engineer-real-time-jobs-in-information-communication-technology/engineering-software/in-Melbourne-VIC-3000"
      },
      recordId: "seek_jobs:92971234"
    });
    assert.equal(seekCapture.response.ok, true);
    assert.equal(seekCapture.record.source.id, "seek_jobs");
    assert.equal(seekCapture.record.source.url, seekUrl);
    assert.equal(seekCapture.record.display.primary_text, "Head of Engineering, Payments Platform");
    assert.equal(seekCapture.record.display.secondary_text, "Example Fintech");
    assert.equal(seekCapture.record.metadata.raw_location_text, "Melbourne VIC");
    assert.equal(seekCapture.record.metadata.extraction_mode, "job_detail");
    assert.ok(seekCapture.record.content.full_text.length >= 50);

    console.log("Testing LinkedIn currentJobId link with non-title link text");
    const linkedCardCapture = await runAdapterFixture(client, {
      fixture: "tests/fixtures/linkedin-currentjobid-card.html",
      mockLocation: {
        href: "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4437943610&discover=recommended",
        hostname: "www.linkedin.com",
        pathname: "/jobs/collections/recommended/"
      },
      recordId: "linkedin_jobs:4437943610",
      doctorBeforeCapture: true
    });
    assert.equal(linkedCardCapture.response.ok, true);
    assert.equal(linkedCardCapture.record.display.primary_text, "Senior Engineering Manager - Integrations");
    assert.equal(linkedCardCapture.record.display.secondary_text, "Traild");
    assert.equal(linkedCardCapture.record.source.source_item_id, "4437943610");
    assert.equal(linkedCardCapture.doctorHealth.fields.job_id, "4437943610");

    console.log("Testing LinkedIn collection-card fallback");
    const collectionCapture = await runAdapterFixture(client, {
      fixture: "tests/fixtures/linkedin-collection-card.html",
      mockLocation: {
        href: "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4437019765&discover=recommended&discoveryOrigin=JOBS_HOME_JYMBII",
        hostname: "www.linkedin.com",
        pathname: "/jobs/collections/recommended/"
      },
      recordId: "linkedin_jobs:4437019765",
      doctorBeforeCapture: true,
      beforeCapture: `(async () => {
        await new Promise((resolve) => globalThis.__arkMessageListener(
          { type: "ARK_START_LISTENING" },
          {},
          resolve
        ));
        document.querySelector("#actual-job-card-title").click();
      })()`
    });
    assert.equal(collectionCapture.response.ok, true);
    assert.equal(
      collectionCapture.doctorHealth.checks.find((check) => check.id === "identity").status,
      "pass"
    );
    assert.doesNotMatch(collectionCapture.doctorHealth.next_action, /run the health check again/i);
    assert.equal(collectionCapture.record.display.primary_text, "Head of Data Engineering");
    assert.equal(collectionCapture.record.display.secondary_text, "Jobgether");
    assert.equal(collectionCapture.record.metadata.extraction_mode, "collection_card");
    assert.equal(
      collectionCapture.record.source.url,
      "https://www.linkedin.com/jobs/view/4437019765/"
    );

    console.log("Testing LinkedIn search page waiting state without currentJobId");
    const waitingCapture = await runAdapterFixture(client, {
      fixture: "tests/fixtures/linkedin-collection-card.html",
      mockLocation: {
        href: "https://www.linkedin.com/jobs/search-results/?keywords=Respondent&origin=SEMANTIC_SEARCH_HISTORY",
        hostname: "www.linkedin.com",
        pathname: "/jobs/search-results/"
      },
      recordId: "linkedin_jobs:waiting",
      doctorBeforeCapture: true
    });
    assert.equal(waitingCapture.response.ok, false);
    assert.equal(waitingCapture.doctorHealth.health, "wait");
    assert.match(waitingCapture.doctorHealth.next_action, /capture the next job you select/i);
    assert.doesNotMatch(waitingCapture.doctorHealth.next_action, /run the health check again/i);

    console.log("Testing delayed semantic detail insertion on a collections URL");
    const delayedDetailCapture = await runAdapterFixture(client, {
      fixture: "tests/fixtures/linkedin-collection-card.html",
      mockLocation: {
        href: "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4430188857",
        hostname: "www.linkedin.com",
        pathname: "/jobs/collections/recommended/"
      },
      recordId: "linkedin_jobs:4430188857",
      skipManualCapture: true,
      beforeCapture: `(async () => {
        await new Promise((resolve) => globalThis.__arkMessageListener(
          { type: "ARK_START_LISTENING" },
          {},
          resolve
        ));
        await new Promise((resolve) => setTimeout(resolve, 1200));

        const detail = document.createElement("section");
        detail.setAttribute("data-test-detail-surface", "true");
        detail.innerHTML = [
          '<a href="https://www.linkedin.com/company/eftsure/life">Eftsure</a>',
          '<h1><a href="https://www.linkedin.com/jobs/view/4430188857/">Tech Team Lead</a></h1>',
          '<p>North Sydney, New South Wales, Australia - 3 weeks ago - 80 people clicked apply</p>',
          '<button aria-label="Apply to Tech Team Lead on company website">Apply</button>',
          '<section id="job-details">Lead a product engineering team across product strategy, stakeholder management, delivery leadership, automation, SaaS platforms, and responsible AI delivery.</section>'
        ].join("");
        document.body.appendChild(detail);

        await new Promise((resolve) => setTimeout(resolve, 2400));
      })()`
    });
    assert.equal(delayedDetailCapture.response.ok, true);
    assert.equal(delayedDetailCapture.record.context.observed_event, "job_changed_auto_capture");
    assert.equal(delayedDetailCapture.record.display.primary_text, "Tech Team Lead");
    assert.equal(delayedDetailCapture.record.display.secondary_text, "Eftsure");
    assert.equal(delayedDetailCapture.record.metadata.extraction_mode, "job_detail");

    console.log("Testing manual capture retry with nested LinkedIn detail");
    const nestedDetailCapture = await runAdapterFixture(client, {
      fixture: "tests/fixtures/linkedin-collection-card.html",
      mockLocation: {
        href: "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4437943610",
        hostname: "www.linkedin.com",
        pathname: "/jobs/collections/recommended/"
      },
      recordId: "linkedin_jobs:4437943610",
      beforeCapture: `(() => {
        setTimeout(() => {
          const host = document.createElement("div");
          document.body.appendChild(host);
          const shadow = host.attachShadow({ mode: "open" });
          shadow.innerHTML = [
            '<section class="jobs-search__job-details--container">',
            '<a href="https://www.linkedin.com/company/traild/life/">Traild</a>',
            '<h1><a href="https://www.linkedin.com/jobs/view/4437943610/">Senior Engineering Manager - Platform</a></h1>',
            '<p>Australia - 6 days ago - 83 applicants</p>',
            '<button aria-label="Easy Apply to Senior Engineering Manager - Platform at Traild">Easy Apply</button>',
            '<section id="job-details">Lead engineering managers across product strategy, stakeholder management, delivery leadership, SaaS automation, platform engineering, and responsible AI delivery.</section>',
            '</section>'
          ].join("");
        }, 900);
      })()`
    });
    assert.equal(nestedDetailCapture.response.ok, true);
    assert.equal(nestedDetailCapture.record.display.primary_text, "Senior Engineering Manager - Platform");
    assert.equal(nestedDetailCapture.record.display.secondary_text, "Traild");
    assert.equal(nestedDetailCapture.record.metadata.extraction_mode, "job_detail");

    console.log("Testing LinkedIn extraction");
    const linkedinUrl = "https://www.linkedin.com/jobs/search-results/?currentJobId=4439789246&keywords=engineering";
    const linkedinCapture = await runAdapterFixture(client, {
      fixture: "tests/fixtures/linkedin-job.html",
      mockLocation: {
        href: linkedinUrl,
        hostname: "www.linkedin.com",
        pathname: "/jobs/search-results/"
      },
      recordId: "linkedin_jobs:4439789246"
    });
    assert.equal(linkedinCapture.response.ok, true);
    assert.equal(linkedinCapture.record.source.id, "linkedin_jobs");
    assert.equal(
      linkedinCapture.record.source.url,
      "https://www.linkedin.com/jobs/view/4439789246/"
    );
    assert.equal(linkedinCapture.record.display.primary_text, "Engineering Manager, Developer Experience");
    assert.equal(linkedinCapture.record.display.secondary_text, "Cover Genius");
    assert.match(linkedinCapture.record.display.tertiary_text, /Sydney/);
    assert.equal(linkedinCapture.record.metadata.extraction_mode, "job_detail");

    console.log("Testing same-tab auto-capture lifecycle");
    const autoCapture = await testLinkedInAutoCapture(client);
    assert.equal(autoCapture.staleRecord, null, "Stale detail DOM was captured for a new job ID");
    assert.ok(autoCapture.autoRecord, "Job change did not auto-capture");
    assert.equal(autoCapture.autoRecord.context.observed_event, "job_changed_auto_capture");
    assert.equal(autoCapture.autoRecord.display.primary_text, "Director of Engineering, Product Platform");
    assert.equal(autoCapture.capturedAfterStop, false, "Capture continued after session stop");

    const fixtureExceptions = client.events.filter((event) =>
      event.method === "Runtime.exceptionThrown"
    );
    if (fixtureExceptions.length > 0) {
      throw new Error(`Adapter fixture browser exceptions: ${JSON.stringify(fixtureExceptions)}`);
    }

    fs.writeFileSync(
      path.join(outputDir, "metrics.json"),
      JSON.stringify({
        report: reportMetrics,
        popup: popupMetrics,
        seek: {
          title: seekCapture.record.display.primary_text,
          company: seekCapture.record.display.secondary_text,
          location: seekCapture.record.metadata.raw_location_text,
          extraction_mode: seekCapture.record.metadata.extraction_mode,
          url: seekCapture.record.source.url
        },
        linkedin: {
          title: linkedinCapture.record.display.primary_text,
          company: linkedinCapture.record.display.secondary_text,
          location: linkedinCapture.record.display.tertiary_text,
          extraction_mode: linkedinCapture.record.metadata.extraction_mode,
          url: linkedinCapture.record.source.url
        },
        linkedin_collection: {
          title: collectionCapture.record.display.primary_text,
          company: collectionCapture.record.display.secondary_text,
          extraction_mode: collectionCapture.record.metadata.extraction_mode,
          url: collectionCapture.record.source.url
        },
        session: {
          auto_capture_event: autoCapture.autoRecord.context.observed_event,
          auto_capture_title: autoCapture.autoRecord.display.primary_text,
          captured_after_stop: autoCapture.capturedAfterStop
        }
      }, null, 2)
    );
    console.log(JSON.stringify({ report: reportMetrics, popup: popupMetrics }, null, 2));
    client.send("Browser.close").catch(() => {});
  } finally {
    browser.kill();
    server.close();
    await sleep(150);
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
