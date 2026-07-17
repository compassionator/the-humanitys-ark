const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..", "..");
const outputDir = path.join(root, "tests", "fixtures", "real-world");
const [pagesDir, reportPath] = process.argv.slice(2);
const resanitizeExisting = pagesDir === "--resanitize-existing";

if ((!pagesDir || !reportPath) && !resanitizeExisting) {
  throw new Error(
    "Usage: node tests/tools/build-characterization-fixtures.js <page-capture-directory> <report.json>\n" +
      "   or: node tests/tools/build-characterization-fixtures.js --resanitize-existing"
  );
}

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));

if (!chromePath) {
  throw new Error("Chrome or Edge is required to sanitize the captured DOM fixtures.");
}

function splitCapture(raw) {
  const htmlIndex = raw.search(/<!doctype\s+html|<html\b/i);
  assert.notEqual(htmlIndex, -1, "Capture does not contain an HTML document");

  return {
    header: raw.slice(0, htmlIndex).trim(),
    html: raw.slice(htmlIndex)
  };
}

function parseHeader(header) {
  const values = {};

  header.split(/\r?\n/).forEach((line) => {
    const separator = line.indexOf(":");
    if (separator < 0) return;

    const key = line.slice(0, separator).trim().toLowerCase();
    values[key] = line.slice(separator + 1).trim();
  });

  const expected = {
    title: values.title || "",
    company: values.company || "",
    location: values.location || "",
    posted: values["posted date"] || "",
    employment_type: values["employment type"] || "",
    salary: values.salary || "",
    job_id: values["job id"] || "",
    canonical_url: values["canonical url"] || "",
    already_applied: /^yes$/i.test(values["already applied"] || "")
  };

  assert.ok(expected.title, "Capture header is missing Title");
  assert.ok(expected.company, "Capture header is missing Company");
  assert.ok(expected.job_id, "Capture header is missing Job ID");
  assert.ok(expected.canonical_url, "Capture header is missing Canonical URL");

  return expected;
}

function extractBody(html) {
  return html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
}

function extractDocumentTitle(html) {
  return html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
}

function sanitizeJobUrl(value, sourceId, jobId) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";

  if (sourceId === "linkedin_jobs" && !/\/jobs\/view\//i.test(url.pathname)) {
    url.searchParams.set("currentJobId", String(jobId));
  } else if (sourceId === "seek_jobs" && !new RegExp(`/job/${jobId}(?:/|$)`, "i").test(url.pathname)) {
    url.searchParams.set("jobId", String(jobId));
    const original = new URL(value);
    const type = original.searchParams.get("type");
    if (type) url.searchParams.set("type", type);
  }

  return url.toString();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function removeExecutableMarkup(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
}

function extractJsonObjectAfterMarker(text, marker) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;

  const start = text.indexOf("{", markerIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

function retainSeekApolloData(raw, targetJobId) {
  const jsonText = extractJsonObjectAfterMarker(raw, "window.SEEK_APOLLO_DATA");
  if (!jsonText) return null;

  const data = JSON.parse(jsonText);
  const targetEntry = Object.entries(data).find(([, value]) =>
    value &&
    typeof value === "object" &&
    value.__typename === "JobSearchV6Data" &&
    (String(value.id || "") === String(targetJobId) ||
      String(value.solMetadata?.jobId || "") === String(targetJobId))
  );

  if (!targetEntry) return null;

  const retained = {};
  const visit = (key) => {
    if (!key || retained[key] || !data[key]) return;
    retained[key] = data[key];

    const walk = (value) => {
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === "object") {
        if (value.__ref) visit(value.__ref);
        Object.values(value).forEach(walk);
      }
    };

    walk(data[key]);
  };

  visit(targetEntry[0]);

  const scrub = (value) => {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== "object") return value;

    const clean = {};
    Object.entries(value).forEach(([key, child]) => {
      if (/^(tracking|searchRequestToken|token|tags)$/i.test(key)) return;
      if (/(?:logo|externalReferences|companyUrl|relativeCompanyUrl)$/i.test(key)) return;
      if (key === "solMetadata") {
        clean.solMetadata = { jobId: String(child?.jobId || targetJobId) };
        return;
      }
      clean[key] = scrub(child);
    });
    return clean;
  };

  const sanitized = {};
  Object.entries(retained).forEach(([key, value]) => {
    const safeKey = key === targetEntry[0]
      ? `JobSearchV6Data:${JSON.stringify({ id: String(targetJobId) })}`
      : key;
    sanitized[safeKey] = scrub(value);
  });
  return sanitized;
}

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function sanitizeDomFixture(bodyHtml, expected, sourceId) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ark-lens-fixture-"));
  const sourcePath = path.join(tempDir, "source.html");
  const profilePath = path.join(tempDir, "profile");
  const safeBody = removeExecutableMarkup(bodyHtml).replace(/<\/template/gi, "<\\/template");
  const browserScript = `(() => {
    const source = document.querySelector("#source").content;
    const expected = ${JSON.stringify(expected)};
    const sourceId = ${JSON.stringify(sourceId)};

    function smallestMatchingAncestor(element, predicate) {
      const candidates = [];
      let current = element;

      for (let depth = 0; current && depth < 12; depth += 1) {
        if (predicate(current)) candidates.push(current);
        current = current.parentElement;
      }

      return candidates.sort((a, b) => a.outerHTML.length - b.outerHTML.length)[0] || null;
    }

    function getLinkedInRoot() {
      const semantic = source.querySelector(
        '[data-sdui-screen*="SemanticJobDetails"], [data-sdui-screen*="JobDetails"]'
      );
      if (semantic) {
        const primary = semantic.querySelector('section[aria-label="Primary content"]');
        if (!primary) return semantic;

        const trimmed = document.createElement("div");
        trimmed.setAttribute("data-sdui-screen", semantic.getAttribute("data-sdui-screen") || "JobDetails");
        const applied = [...semantic.querySelectorAll("p,span")].find((element) =>
          /^Applied(?:\\s|$)/i.test((element.textContent || "").trim())
        );
        if (applied) {
          const status = document.createElement("p");
          status.textContent = (applied.textContent || "").trim();
          trimmed.appendChild(status);
        }
        trimmed.appendChild(primary.cloneNode(true));
        return trimmed;
      }

      const classic = source.querySelector([
        ".jobs-search__job-details--container",
        ".scaffold-layout__detail.jobs-search__job-details",
        ".jobs-search__job-details",
        ".job-view-layout.jobs-details"
      ].join(","));
      if (classic) return classic;

      const titleElements = [...source.querySelectorAll("h1,h2,h3,a,p,span,button")]
        .filter((element) => (element.textContent || "").trim() === expected.title);
      const target = titleElements
        .map((element) => smallestMatchingAncestor(element, (candidate) =>
          candidate.outerHTML.includes(expected.job_id) &&
          (candidate.textContent || "").includes(expected.company)
        ))
        .filter(Boolean)
        .sort((a, b) => a.outerHTML.length - b.outerHTML.length)[0];

      if (target) {
        const workspace = document.createElement("main");
        workspace.id = "workspace";
        workspace.appendChild(target.cloneNode(true));
        return workspace;
      }

      const incompleteWorkspace = document.createElement("main");
      incompleteWorkspace.id = "workspace";
      const identityLink = [...source.querySelectorAll("a[href]")].find((link) =>
        (link.getAttribute("href") || "").includes(expected.job_id)
      );

      if (identityLink) incompleteWorkspace.appendChild(identityLink.cloneNode(true));
      return incompleteWorkspace;
    }

    function getSeekRoot() {
      return source.querySelector([
        '[data-automation="splitViewJobDetailsWrapper"]',
        '[data-automation="job-details-page"]',
        '[data-automation="job-detail"]',
        "main"
      ].join(","));
    }

    const selected = sourceId === "linkedin_jobs" ? getLinkedInRoot() : getSeekRoot();
    if (!selected) throw new Error("No fixture root found");

    const container = document.createElement("div");
    container.appendChild(selected.cloneNode(true));
    container.querySelectorAll(
      "script,style,svg,img,picture,video,audio,canvas,iframe,noscript,form,input,textarea"
    ).forEach((element) => element.remove());
    container.querySelectorAll('a[href*="/in/"]').forEach((element) => element.remove());
    container.querySelectorAll("a[href]").forEach((element) => {
      const href = element.getAttribute("href") || "";
      let url;
      try {
        url = new URL(href, expected.canonical_url);
      } catch {
        element.removeAttribute("href");
        return;
      }

      const pathParts = url.pathname.split("/").filter(Boolean);
      const linkedInIndex = pathParts.findIndex((part, index) =>
        part.toLowerCase() === "view" && pathParts[index - 1]?.toLowerCase() === "jobs"
      );
      const seekIndex = pathParts.findIndex((part) => part.toLowerCase() === "job");
      const linkedInId = (linkedInIndex >= 0 ? pathParts[linkedInIndex + 1] : "") ||
        url.searchParams.get("currentJobId");
      const seekId = (seekIndex >= 0 ? pathParts[seekIndex + 1] : "") ||
        url.searchParams.get("jobId");
      const linkedInTarget = sourceId === "linkedin_jobs" && linkedInId === String(expected.job_id);
      const seekTarget = sourceId === "seek_jobs" && seekId === String(expected.job_id);

      if (linkedInTarget) {
        element.setAttribute("href", "https://www.linkedin.com/jobs/view/" + expected.job_id + "/");
      } else if (seekTarget) {
        element.setAttribute("href", expected.canonical_url);
      } else {
        element.removeAttribute("href");
      }
    });
    container.querySelectorAll("*").forEach((element) => {
      [...element.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const keep = name === "id" ||
          name === "class" ||
          name === "role" ||
          name === "href" ||
          name === "tabindex" ||
          name.startsWith("aria-") ||
          name.startsWith("data-test") ||
          name.startsWith("data-automation") ||
          name === "data-sdui-screen" ||
          name === "data-view-name" ||
          name === "data-job-id" ||
          name === "data-entity-urn";

        if (!keep) element.removeAttribute(attribute.name);
      });
      if (element.hasAttribute("data-entity-urn") &&
          !element.getAttribute("data-entity-urn").includes(String(expected.job_id))) {
        element.removeAttribute("data-entity-urn");
      }
    });

    const result = document.createElement("script");
    result.id = "ark-sanitized-result";
    result.type = "application/json";
    result.textContent = JSON.stringify({ html: container.innerHTML }).replace(/</g, "\\u003c");
    document.body.replaceChildren(result);
  })();`;
  const wrapper = `<!doctype html><meta charset="utf-8"><body>
    <template id="source">${safeBody}</template>
    <script>${browserScript}</script>
  </body>`;

  fs.writeFileSync(sourcePath, wrapper);
  const result = spawnSync(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--allow-file-access-from-files",
    "--dump-dom",
    "--virtual-time-budget=2000",
    `--user-data-dir=${profilePath}`,
    sourcePath
  ], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 30000
  });

  try {
    assert.equal(result.status, 0, result.stderr || "Chrome fixture sanitization failed");
    const marker = result.stdout.match(
      /<script id="ark-sanitized-result" type="application\/json">([\s\S]*?)<\/script>/i
    );
    assert.ok(
      marker,
      `Sanitized fixture result marker was not found: ${result.stderr}\n${result.stdout.slice(-1000)}`
    );
    return JSON.parse(decodeHtml(marker[1])).html;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function sanitizeScoringRecords(records) {
  return records.map((record, index) => ({
    case_id: `report_${String(index + 1).padStart(2, "0")}`,
    source_id: record.source?.id || "",
    input: {
      title: record.display?.primary_text || "",
      company: record.display?.secondary_text || "",
      location: record.display?.tertiary_text || "",
      summary: record.content?.summary || "",
      full_text: record.content?.full_text || ""
    },
    expected: {
      match_score: record.classification?.match_score,
      workflow_state: record.classification?.workflow_state,
      reason: record.classification?.reason || "",
      confidence: record.classification?.confidence,
      signals: record.classification?.signals || {
        positive: [],
        negative: [],
        blockers: [],
        matched_rule_ids: [],
        matched_keywords: []
      }
    }
  }));
}

function sanitizeReportRecords(records) {
  return records.map((record) => ({
    record_id: record.record_id,
    source: record.source,
    display: record.display,
    classification: record.classification,
    memory: {
      first_seen_at: "2000-01-01T00:00:00.000Z",
      last_seen_at: "2000-01-01T00:00:00.000Z",
      notes: "",
      seen_count: record.memory?.seen_count || 1,
      user_workflow_override: record.memory?.user_workflow_override || null
    },
    metadata: record.metadata
  }));
}

function writePageFixture(fixturePath, documentTitle, fixtureHtml) {
  fs.writeFileSync(
    fixturePath,
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(documentTitle)}</title></head><body>${fixtureHtml}</body></html>\n`
  );
}

function resanitizeExistingFixtures() {
  const manifestPath = path.join(outputDir, "page-cases.json");
  const cases = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  cases.forEach((testCase) => {
    const fixturePath = path.join(outputDir, testCase.fixture);
    const raw = fs.readFileSync(fixturePath, "utf8");
    const safeUrl = sanitizeJobUrl(
      testCase.expected.canonical_url,
      testCase.source_id,
      testCase.expected.job_id
    );
    testCase.expected.canonical_url = safeUrl;
    testCase.mock_location.href = safeUrl;
    testCase.mock_location.pathname = new URL(safeUrl).pathname;

    let fixtureHtml = sanitizeDomFixture(extractBody(raw), testCase.expected, testCase.source_id);
    if (testCase.source_id === "seek_jobs") {
      const apolloData = retainSeekApolloData(raw, testCase.expected.job_id);
      if (apolloData) {
        fixtureHtml += `<script>window.SEEK_APOLLO_DATA = ${JSON.stringify(apolloData)};</script>`;
      }
    }
    writePageFixture(fixturePath, extractDocumentTitle(raw), fixtureHtml);
  });

  fs.writeFileSync(manifestPath, `${JSON.stringify(cases, null, 2)}\n`);
  console.log(`Re-sanitized ${cases.length} existing page fixtures.`);
}

if (resanitizeExisting) {
  resanitizeExistingFixtures();
  process.exit(0);
}

fs.mkdirSync(outputDir, { recursive: true });
const cases = [];

for (let index = 1; index <= 7; index += 1) {
  const capturePath = path.join(path.resolve(pagesDir), `${index}.txt`);
  assert.ok(fs.existsSync(capturePath), `Missing page capture: ${capturePath}`);

  const raw = fs.readFileSync(capturePath, "utf8");
  const { header, html } = splitCapture(raw);
  const expected = parseHeader(header);
  expected.capture_ready = html.toLowerCase().includes(expected.title.toLowerCase()) &&
    html.toLowerCase().includes(expected.company.trim().toLowerCase());
  const inputUrl = new URL(expected.canonical_url);
  const sourceId = /linkedin\.com$/i.test(inputUrl.hostname)
    ? "linkedin_jobs"
    : "seek_jobs";
  expected.canonical_url = sanitizeJobUrl(expected.canonical_url, sourceId, expected.job_id);
  const parsedUrl = new URL(expected.canonical_url);
  let fixtureHtml = sanitizeDomFixture(extractBody(html), expected, sourceId);

  if (sourceId === "seek_jobs") {
    const apolloData = retainSeekApolloData(raw, expected.job_id);
    if (apolloData) {
      fixtureHtml += `<script>window.SEEK_APOLLO_DATA = ${JSON.stringify(apolloData)};</script>`;
    }
  }

  const fixtureName = `${sourceId}-${expected.job_id}.html`;
  writePageFixture(path.join(outputDir, fixtureName), extractDocumentTitle(html), fixtureHtml);

  cases.push({
    case_id: `page_${index}`,
    fixture: fixtureName,
    source_id: sourceId,
    mock_location: {
      href: expected.canonical_url,
      hostname: parsedUrl.hostname,
      pathname: parsedUrl.pathname
    },
    expected
  });
}

const reportRecords = JSON.parse(fs.readFileSync(path.resolve(reportPath), "utf8"));
fs.writeFileSync(path.join(outputDir, "page-cases.json"), `${JSON.stringify(cases, null, 2)}\n`);
fs.writeFileSync(
  path.join(outputDir, "scoring-corpus.json"),
  `${JSON.stringify(sanitizeScoringRecords(reportRecords), null, 2)}\n`
);
fs.writeFileSync(
  path.join(outputDir, "report-corpus.json"),
  `${JSON.stringify(sanitizeReportRecords(reportRecords), null, 2)}\n`
);

console.log(`Generated ${cases.length} page fixtures and ${reportRecords.length} scoring cases.`);
