const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const contentSource = read("content_bundle.js");
const linkedInAdapterSource = read("sources/jobs/linkedin_jobs_adapter.js");
const seekAdapterSource = read("sources/jobs/seek_jobs_adapter.js");
const popupSource = read("popup/popup.js");
const popupHtml = read("popup/popup.html");
const reportSource = read("report/report.js");
const reportHtml = read("report/report.html");
const reportCss = read("report/report.css");
const backgroundSource = read("background.js");
const manifest = JSON.parse(read("manifest.json"));
const canonicalLens = JSON.parse(read("lens-packs/bob_job_search.json"));
const { migrateLensPack } = require("../lens-packs/lens_pack_runtime.js");
const { containsAny } = require("../core/deterministic_matcher.js");
const { scoreSignals } = require("../policies/job_policy_runtime.js");
const sourceAdaptersRuntime = require("../sources/jobs/job_source_catalogue.js");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);

  const braceStart = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Unterminated function ${name}`);
}

function idsFromHtml(html) {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
}

function assertedDomIds(js, html, label) {
  const ids = idsFromHtml(html);
  const requested = [...js.matchAll(/getElementById\("([^"]+)"\)/g)]
    .map((match) => match[1]);
  const missing = [...new Set(requested)].filter((id) => !ids.has(id));
  assert.deepEqual(missing, [], `${label} references missing DOM ids`);
}

function testBackgroundRouting() {
  const listeners = {};
  const context = {
    URL,
    console,
    ARK_SOURCE_ADAPTERS: sourceAdaptersRuntime,
    chrome: {
      action: {
        setIcon: async () => {},
        setBadgeText: async () => {},
        setBadgeBackgroundColor: async () => {},
        setBadgeTextColor: async () => {},
        setTitle: async () => {}
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async () => {}
        },
        onChanged: { addListener: (listener) => { listeners.storage = listener; } }
      },
      scripting: { executeScript: async () => {} },
      tabs: {
        get: async () => null,
        create: async () => {},
        sendMessage: async () => {},
        onUpdated: { addListener: (listener) => { listeners.updated = listener; } },
        onRemoved: { addListener: (listener) => { listeners.removed = listener; } }
      },
      runtime: {
        getURL: (relativePath) => `chrome-extension://ark-lens/${relativePath}`,
        onStartup: { addListener: (listener) => { listeners.startup = listener; } },
        onInstalled: { addListener: (listener) => { listeners.installed = listener; } }
      }
    }
  };

  vm.runInNewContext(
    `${backgroundSource}\nthis.__isSupportedSourceUrl = isSupportedSourceUrl;`,
    context
  );

  const isSupported = context.__isSupportedSourceUrl;
  [
    "https://www.linkedin.com/jobs/view/4439789246/",
    "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4416392545",
    "https://www.linkedin.com/jobs/search-results/?currentJobId=4439789246",
    "https://au.seek.com/jobs?jobId=92840174&type=promoted",
    "https://au.seek.com/ai-engineer-real-time-jobs-in-information-communication-technology/engineering-software/in-Sydney-NSW-2000?jobId=92971234&type=standard",
    "https://www.seek.com.au/job/92971234"
  ].forEach((url) => assert.equal(isSupported(url), true, `Expected supported URL: ${url}`));

  assert.equal(isSupported("https://example.com/jobs?jobId=1"), false);
  assert.equal(typeof listeners.updated, "function");
  assert.equal(typeof listeners.removed, "function");
  assert.equal(typeof listeners.storage, "function");
  assert.equal(typeof listeners.startup, "function");
  assert.equal(typeof listeners.installed, "function");
}

function testKeywordMatchingAndScoring() {
  assert.deepEqual([...containsAny("Australia maintain availability candidate", ["ai"])], []);
  assert.deepEqual([...containsAny("AI-native systems", ["ai"])], ["ai"]);
  assert.deepEqual([...containsAny("Responsible use of AI", ["ai"])], ["ai"]);
  assert.deepEqual([...containsAny("Own the product-strategy roadmap", ["product strategy"])], ["product strategy"]);
  assert.deepEqual([...containsAny("Cloud native environments", ["cloud-native environments"])], ["cloud-native environments"]);

  const lens = migrateLensPack({
    signal_groups: {
      blockers: [{
        id: "clearance",
        keywords: ["nv1", "must be australian citizens"]
      }],
      must_have: [
        { id: "leadership_title", keywords: ["engineering manager"], weight: 35 },
        { id: "product_leadership", keywords: ["product strategy"], weight: 20 }
      ],
      nice_to_have: [
        { id: "ai", keywords: ["ai"], weight: 10 },
        { id: "preferred_domains", keywords: ["warehouse"], weight: 12 },
        {
          id: "adjacent_leadership_title",
          keywords: ["senior director delivery", "delivery manager"],
          weight: 15,
          match_scope: "title"
        }
      ],
      should_not_have: [
        { id: "cloud_heavy", keywords: ["cloud-native environments"], penalty: 20 },
        {
          id: "wrong_job_family_sales",
          keywords: ["sales development representative", "sales operations"],
          penalty: 100,
          match_scope: "title"
        },
        {
          id: "wrong_job_family_support",
          keywords: ["technical support representative"],
          penalty: 100,
          match_scope: "title"
        },
        {
          id: "wrong_job_family_title",
          keywords: ["quantity surveyor", "kennel hand"],
          penalty: 100,
          match_scope: "title"
        },
        {
          id: "wrong_engineering_discipline",
          keywords: ["aerospace manufacturing"],
          penalty: 100
        },
        {
          id: "cloud_infrastructure_title",
          keywords: ["cloud and data"],
          penalty: 55,
          match_scope: "title"
        },
        {
          id: "platform_infrastructure_title",
          keywords: ["engineering manager platform", "data platform"],
          penalty: 45,
          match_scope: "title"
        }
      ]
    }
  }, canonicalLens);
  const mixed = scoreSignals(
    "Engineering Manager leading product strategy for AI in cloud-native environments",
    lens,
    { title: "Engineering Manager (Cloud and Data)" }
  );
  assert.equal(mixed.matchScore, 25);
  assert.equal(mixed.workflowState, "ignore");
  assert.match(mixed.reason, /cloud infrastructure/i);

  const cloudRequirements = scoreSignals(
    "Engineering Manager leading product strategy in cloud-native environments",
    lens,
    { title: "Engineering Manager" }
  );
  assert.equal(cloudRequirements.matchScore, 45);
  assert.equal(cloudRequirements.workflowState, "ignore");

  const sales = scoreSignals(
    "Lead product strategy for a SaaS and AI business",
    lens,
    { title: "Sales Development Representative, Inbound - APJ" }
  );
  assert.equal(sales.matchScore, 0);
  assert.equal(sales.workflowState, "ignore");
  assert.match(sales.reason, /sales role/i);

  const platform = scoreSignals(
    "Engineering Manager leading product strategy and AI delivery",
    lens,
    { title: "Senior Engineering Manager - Platform" }
  );
  assert.ok(platform.matchScore <= 40);
  assert.equal(platform.workflowState, "ignore");
  assert.match(platform.reason, /platform infrastructure/i);

  const dataPlatform = scoreSignals(
    "Lead product strategy and AI delivery for the data organization",
    lens,
    { title: "Tech Lead Manager - Data Platform" }
  );
  assert.ok(dataPlatform.matchScore < 50);
  assert.equal(dataPlatform.workflowState, "ignore");
  assert.match(dataPlatform.reason, /platform infrastructure/i);

  const support = scoreSignals(
    "Support a SaaS platform using AI tools",
    lens,
    { title: "Technical Support Representative, In-Store" }
  );
  assert.equal(support.matchScore, 0);
  assert.equal(support.workflowState, "ignore");

  const generic = scoreSignals(
    "Lead product strategy for an AI product",
    lens,
    { title: "Sales Operations Lead" }
  );
  assert.equal(generic.matchScore, 0);
  assert.equal(generic.workflowState, "ignore");

  const adjacent = scoreSignals(
    "Lead product strategy for an AI product across stakeholder groups",
    lens,
    { title: "Senior Director, Delivery" }
  );
  assert.equal(adjacent.matchScore, 80);
  assert.equal(adjacent.workflowState, "apply");
  assert.doesNotMatch(adjacent.reason, /no target leadership title/i);

  const evidenceWithoutTargetTitle = scoreSignals(
    "Own product strategy and AI delivery",
    lens,
    { title: "Solutions Delivery Lead" }
  );
  assert.equal(evidenceWithoutTargetTitle.matchScore, 65);
  assert.equal(evidenceWithoutTargetTitle.workflowState, "review");
  assert.match(evidenceWithoutTargetTitle.reason, /Relevant evidence/i);
  assert.doesNotMatch(evidenceWithoutTargetTitle.reason, /no target leadership title/i);

  const unrelatedWithIncidentalTerms = scoreSignals(
    "Quantity Surveyor responsible for stakeholder management and AI tools",
    lens,
    { title: "Quantity Surveyor" }
  );
  assert.equal(unrelatedWithIncidentalTerms.matchScore, 0);
  assert.equal(unrelatedWithIncidentalTerms.workflowState, "ignore");
  assert.match(unrelatedWithIncidentalTerms.reason, /unrelated job family/i);

  const noEvidence = scoreSignals(
    "Manage daily animal care and facility routines",
    lens,
    { title: "Kennel Hand" }
  );
  assert.equal(noEvidence.matchScore, 0);
  assert.equal(noEvidence.workflowState, "ignore");

  const contextOnly = scoreSignals(
    "Receiving and checking warehouse stock",
    lens,
    { title: "Warehouse Store Person" }
  );
  assert.equal(contextOnly.matchScore, 0);
  assert.equal(contextOnly.workflowState, "ignore");
  assert.match(contextOnly.reason, /context signals without role-fit evidence/i);

  const manufacturingEngineering = scoreSignals(
    "Engineering Manager leading an aerospace manufacturing production facility",
    lens,
    { title: "Production Engineering Manager" }
  );
  assert.equal(manufacturingEngineering.matchScore, 0);
  assert.equal(manufacturingEngineering.workflowState, "ignore");
  assert.match(manufacturingEngineering.reason, /wrong engineering discipline/i);

  const adjacentWithConcern = scoreSignals(
    "Operate as a Scrum Master for delivery governance",
    migrateLensPack({
      signal_groups: {
        blockers: [],
        must_have: [],
        nice_to_have: [
          {
            id: "adjacent_leadership_title",
            keywords: ["delivery manager"],
            weight: 15,
            match_scope: "title"
          }
        ],
        should_not_have: [
          { id: "scrum_master_heavy", keywords: ["scrum master"], penalty: 25, reason: "Process-heavy" }
        ]
      }
    }, canonicalLens),
    { title: "Delivery Manager" }
  );
  assert.equal(adjacentWithConcern.matchScore, 25);
  assert.equal(adjacentWithConcern.workflowState, "ignore");

  const duplicateLens = migrateLensPack({
    signal_groups: {
      blockers: [],
      must_have: [
        { id: "leadership_title", keywords: ["engineering manager"], weight: 35 }
      ],
      nice_to_have: [
        { id: "preferred_domains", keywords: ["automation"], weight: 12 },
        { id: "ai_product_delivery", keywords: ["automation"], weight: 8 }
      ],
      should_not_have: []
    }
  }, canonicalLens);
  const deduplicated = scoreSignals(
    "Engineering Manager leading automation",
    duplicateLens,
    { title: "Engineering Manager" }
  );
  assert.equal(deduplicated.matchScore, 82);
  assert.deepEqual(
    [...deduplicated.signals.positive.map((signal) => signal.id)],
    ["leadership_title", "ai_product_delivery"]
  );

  const leadership = scoreSignals(
    "Engineering Manager leading product strategy for AI",
    lens,
    { title: "Engineering Manager" }
  );
  assert.equal(leadership.matchScore, 100);
  assert.equal(leadership.workflowState, "apply");

  const resumeAlignedLens = migrateLensPack({
    version: "v2026.06.008",
    signal_groups: {
      blockers: [],
      must_have: [
        {
          id: "leadership_title",
          keywords: ["engineering manager", "head of product"],
          weight: 35,
          match_scope: "title"
        },
        {
          id: "engineering_management_scope",
          keywords: ["engineering management"],
          weight: 20
        },
        {
          id: "product_engineering_leadership",
          keywords: ["product strategy"],
          weight: 15
        }
      ],
      nice_to_have: [],
      should_not_have: []
    }
  }, canonicalLens);
  const engineeringFit = scoreSignals(
    "Engineering Manager accountable for engineering management",
    resumeAlignedLens,
    { title: "Engineering Manager" }
  );
  const productFit = scoreSignals(
    "Head of Product accountable for product strategy",
    resumeAlignedLens,
    { title: "Head of Product" }
  );
  assert.equal(engineeringFit.matchScore, 90);
  assert.equal(productFit.matchScore, 88);
  assert.ok(engineeringFit.matchScore > productFit.matchScore);

  const blocked = scoreSignals(
    "Engineering Manager requiring NV1",
    lens,
    { title: "Engineering Manager" }
  );
  assert.equal(blocked.matchScore, 0);
  assert.equal(blocked.workflowState, "ignore");

  const citizenshipBlocked = scoreSignals(
    "Applicants must be Australian Citizens to meet Defence security requirements",
    lens,
    { title: "Production Engineering Manager" }
  );
  assert.equal(citizenshipBlocked.matchScore, 0);
  assert.equal(citizenshipBlocked.workflowState, "ignore");
  assert.match(citizenshipBlocked.reason, /blocker/i);
  assert.deepEqual(
    [...citizenshipBlocked.signals.blockers[0].keywords],
    ["must be australian citizens"]
  );

  const residencyAllowed = scoreSignals(
    "You must be an Australian or NZ Citizen or Permanent Resident",
    lens,
    { title: "Engineering Manager" }
  );
  assert.equal(residencyAllowed.signals.blockers.length, 0);

  const scopedLens = migrateLensPack({
    id: "scoped_lens",
    name: "Scoped Lens",
    version: "1",
    signal_groups: {
      custom: [
        { id: "title_rule", display_name: "Title", keywords: ["captain"], weight: 1, match_scope: "title", blocker: false, qualifies_role_fit: true, role_fit_kind: "target" },
        { id: "company_rule", display_name: "Company", keywords: ["acme"], weight: 1, match_scope: "company", blocker: false, qualifies_role_fit: false, role_fit_kind: "context" },
        { id: "location_rule", display_name: "Location", keywords: ["antarctica"], weight: 1, match_scope: "location", blocker: false, qualifies_role_fit: false, role_fit_kind: "context" },
        { id: "description_rule", display_name: "Description", keywords: ["quantum"], weight: 1, match_scope: "description", blocker: false, qualifies_role_fit: false, role_fit_kind: "context" },
        { id: "metadata_rule", display_name: "Metadata", keywords: ["ref-42"], weight: 1, match_scope: "metadata", blocker: false, qualifies_role_fit: false, role_fit_kind: "context" },
        { id: "scoped_decoy", display_name: "Decoy", keywords: ["decoy"], weight: 50, match_scope: "company", blocker: false, qualifies_role_fit: false, role_fit_kind: "context" }
      ]
    }
  }, canonicalLens);
  const scoped = scoreSignals(
    "Captain Acme Antarctica Quantum ref-42 decoy",
    scopedLens,
    {
      title: "Captain",
      company: "Acme",
      location: "Antarctica",
      description: "Quantum",
      metadata: "ref-42"
    }
  );
  assert.deepEqual(
    [...scoped.signals.positive.map((signal) => signal.id)],
    ["title_rule", "company_rule", "location_rule", "description_rule", "metadata_rule"]
  );
}

function testSeekExactUrl() {
  const source = extractFunction(seekAdapterSource, "getSeekRecordUrl");
  const original = "https://au.seek.com/ai-engineer-real-time-jobs-in-information-communication-technology/engineering-software/in-Sydney-NSW-2000?jobId=92971234&type=standard";
  const context = { URL, encodeURIComponent, location: { href: original } };

  vm.runInNewContext(`${source}\nthis.__getSeekRecordUrl = getSeekRecordUrl;`, context);
  assert.equal(context.__getSeekRecordUrl("92971234"), original);
}

function testLinkedInCanonicalUrlAndTitleGuard() {
  const contentFunctions = [
    "getLinkedInRecordUrl",
    "isUsefulLinkedInJobTitle"
  ].map((name) => extractFunction(linkedInAdapterSource, name)).join("\n");
  const contentContext = {
    cleanText: (value) => (value || "").replace(/\s+/g, " ").trim(),
    encodeURIComponent,
    location: { href: "https://www.linkedin.com/jobs/collections/recommended/" }
  };

  vm.runInNewContext(
    `${contentFunctions}\nthis.__api = { getLinkedInRecordUrl, isUsefulLinkedInJobTitle };`,
    contentContext
  );
  assert.equal(
    contentContext.__api.getLinkedInRecordUrl("4437019765"),
    "https://www.linkedin.com/jobs/view/4437019765/"
  );
  assert.equal(contentContext.__api.isUsefulLinkedInJobTitle("More"), false);
  assert.equal(contentContext.__api.isUsefulLinkedInJobTitle("Show more"), false);
  assert.equal(contentContext.__api.isUsefulLinkedInJobTitle("Engineering Manager"), true);

  const reportFunctions = ["getSafeHttpUrl", "getRecordOpenUrl"]
    .map((name) => extractFunction(reportSource, name))
    .join("\n");
  const reportContext = { URL, encodeURIComponent };
  vm.runInNewContext(
    `${reportFunctions}\nthis.__getRecordOpenUrl = getRecordOpenUrl;`,
    reportContext
  );
  assert.equal(
    reportContext.__getRecordOpenUrl({
      source: {
        id: "linkedin_jobs",
        source_item_id: "4439916932",
        url: "https://www.linkedin.com/jobs/search-results/?currentJobId=4439916932&keywords=Respondent"
      }
    }),
    "https://www.linkedin.com/jobs/view/4439916932/"
  );
}

function testReportReasonClarity() {
  const names = [
    "getSignalLabel",
    "getDisplayReason"
  ];
  const source = names.map((name) => extractFunction(reportSource, name)).join("\n");
  const context = {};

  vm.runInNewContext(
    `${source}\nthis.__api = { getDisplayReason, getSignalLabel };`,
    context
  );
  const { getDisplayReason: getReason, getSignalLabel } = context.__api;
  const makeRecord = (title, negative = []) => ({
    display: { primary_text: title },
    classification: {
      workflow_state: "ignore",
      reason: "No relevant job-search signals",
      signals: { positive: [], negative, blockers: [] }
    }
  });

  assert.equal(
    getReason(makeRecord("Sales Development Representative")),
    "No relevant job-search signals"
  );
  assert.match(
    getReason(makeRecord("Sales Development Representative", [
      {
        id: "custom_sales_rule",
        outcome_reason: "Low fit: sales role, outside product/engineering leadership",
        reason_priority: 100
      }
    ])),
    /Low fit: sales role/i
  );
  assert.match(
    getReason(makeRecord("Senior Engineering Manager - Platform", [{
      id: "custom_platform_rule",
      outcome_reason: "Low fit: platform infrastructure role",
      reason_priority: 90
    }])),
    /Low fit: platform infrastructure role/i
  );
  assert.match(
    getReason(makeRecord("Quantity Surveyor", [
      {
        id: "custom_job_family_rule",
        outcome_reason: "Low fit: unrelated job family",
        reason_priority: 80
      }
    ])),
    /Low fit: unrelated job family/i
  );

  const adjacentRecord = makeRecord("Senior Director, Delivery");
  adjacentRecord.classification.workflow_state = "review";
  adjacentRecord.classification.reason = "Adjacent leadership role; review against target scope";
  adjacentRecord.classification.signals.positive = [
    {
      id: "custom_adjacent_rule",
      display_name: "Adjacent leadership",
      keywords: ["senior director delivery"],
      role_fit_kind: "adjacent"
    }
  ];
  assert.match(getReason(adjacentRecord), /Adjacent leadership role/i);
  assert.equal(getSignalLabel({ id: "custom_adjacent_rule", display_name: "My label" }), "My label");
}

function testTrustLanguageAndSourceReadiness() {
  const reportFunctions = ["formatMatchScore", "getFitDisplayState", "getStateLabel"]
    .map((name) => extractFunction(reportSource, name))
    .join("\n");
  const reportContext = {};
  vm.runInNewContext(
    `${reportFunctions}\nthis.__api = { formatMatchScore, getFitDisplayState, getStateLabel };`,
    reportContext
  );

  assert.equal(reportContext.__api.getStateLabel("apply"), "Strong Match");
  assert.equal(reportContext.__api.getStateLabel("review"), "Review");
  assert.equal(reportContext.__api.getFitDisplayState("ignore", 0), "ignore");
  assert.equal(reportContext.__api.getFitDisplayState("ignore", 10), "ignore");
  assert.equal(reportContext.__api.getFitDisplayState("ignore", 10.1), "low_match");
  assert.equal(reportContext.__api.getFitDisplayState("ignore", 49.99), "low_match");
  assert.equal(reportContext.__api.getStateLabel("ignore", 0), "Ignore");
  assert.equal(reportContext.__api.getStateLabel("ignore", 10), "Ignore");
  assert.equal(reportContext.__api.getStateLabel("ignore", 10.1), "Low Match");
  assert.equal(reportContext.__api.getStateLabel("ignore", 49.99), "Low Match");
  assert.equal(reportContext.__api.getStateLabel("applied"), "Applied");
  assert.equal(reportContext.__api.formatMatchScore(100), "100%");
  assert.equal(reportContext.__api.formatMatchScore(0), "0%");

  const popupFunctions = ["getJobSourceForUrl", "getSourceReadiness"]
    .map((name) => extractFunction(popupSource, name))
    .join("\n");
  const popupContext = { URL, SOURCE_ADAPTERS_RUNTIME: sourceAdaptersRuntime };
  vm.runInNewContext(
    `${popupFunctions}\nthis.__api = { getJobSourceForUrl, getSourceReadiness };`,
    popupContext
  );
  const supportedLens = { supported_source_adapters: ["linkedin_jobs", "seek_jobs"] };
  const disabledLens = { supported_source_adapters: ["seek_jobs"] };
  const linkedInTab = { url: "https://www.linkedin.com/jobs/view/123/" };

  assert.deepEqual(
    JSON.parse(JSON.stringify(popupContext.__api.getSourceReadiness(linkedInTab, supportedLens))),
    {
      sourceId: "linkedin_jobs",
      label: "LinkedIn Jobs · Ready",
      canStart: true,
      message: ""
    }
  );
  assert.match(
    popupContext.__api.getSourceReadiness(linkedInTab, disabledLens).message,
    /Enable LinkedIn Jobs/
  );
  assert.equal(
    popupContext.__api.getSourceReadiness({ url: "https://example.com/" }, supportedLens).label,
    "Unsupported page"
  );
}

function testPopupSessionTimer() {
  const names = [
    "parseSessionTimestamp",
    "formatSessionDuration",
    "formatSessionStartTime",
    "formatCapturedCount",
    "getSessionTimerDisplay"
  ];
  const functions = names.map((name) => extractFunction(popupSource, name)).join("\n");
  const context = {};
  vm.runInNewContext(
    `${functions}\nthis.__api = { ${names.join(", ")} };`,
    context
  );
  const api = context.__api;
  const startedAt = "2026-07-17T00:00:00.000Z";
  const startedMs = Date.parse(startedAt);
  const activeSession = {
    active: true,
    session_id: "session_test",
    started_at: startedAt,
    stopped_at: null,
    captured_count: 3
  };
  const active = api.getSessionTimerDisplay(activeSession, startedMs + 728000);
  const activeNextSecond = api.getSessionTimerDisplay(activeSession, startedMs + 729000);

  assert.equal(active.primary, "Running for 12m 08s");
  assert.equal(activeNextSecond.primary, "Running for 12m 09s");
  assert.equal(active.ticking, true);
  assert.equal(
    api.formatSessionStartTime(startedAt),
    new Date(startedMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  );
  assert.match(active.secondary, /^Started .+ · 3 jobs captured$/);
  assert.equal(api.formatCapturedCount(1), "1 job captured");
  assert.equal(
    api.getSessionTimerDisplay({
      ...activeSession,
      active: false,
      stopped_at: new Date(startedMs + 1122000).toISOString(),
      captured_count: 5
    }, startedMs + 2000000).primary,
    "Last session: 18m 42s · 5 jobs captured"
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.getSessionTimerDisplay({ active: false }))),
    { primary: "No active session", secondary: "", ticking: false }
  );
  const invalid = api.getSessionTimerDisplay({
    active: true,
    started_at: "not-a-date",
    captured_count: 0
  });
  assert.equal(invalid.primary, "Session active");
  assert.equal(invalid.secondary, "0 jobs captured");
  assert.equal(invalid.ticking, false);
  assert.doesNotMatch(JSON.stringify(invalid), /NaN|undefined/);

  assert.equal(idsFromHtml(popupHtml).has("sessionMeta"), true);
  assert.match(popupSource, /sessionTimerInterval = setInterval\(/);
  assert.match(popupSource, /clearInterval\(sessionTimerInterval\)/);
  assert.match(popupSource, /window\.addEventListener\("unload", cleanupPopup/);
  assert.match(popupSource, /chrome\.storage\.onChanged\.removeListener\(handlePopupStorageChange\)/);
  assert.doesNotMatch(backgroundSource, /setInterval\(/);
}

function testStaticContracts() {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "2026.6.19");
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
  assert.equal("content_scripts" in manifest, false);
  assert.equal("web_accessible_resources" in manifest, false);

  assert.match(contentSource, /const SCHEMA_VERSION = "v2026\.06\.001"/);
  assert.match(contentSource, /const ADAPTER_VERSION = "v2026\.06\.003"/);
  assert.match(
    contentSource,
    /const CONTENT_BUNDLE_VERSION = "v2026\.06\.019-fixed-fit-columns"/
  );
  assert.equal(canonicalLens.version, "v2026.06.019");
  assert.equal(canonicalLens.name, "My Job Search");
  assert.doesNotMatch(contentSource, /^\s*(?:import|export)\s/m);
  assert.doesNotMatch(contentSource, /function scoreSignals\(/);
  assert.doesNotMatch(contentSource, /function getMatchedSignals\(/);
  assert.match(contentSource, /JOB_POLICY\.classifyLensItem\(lensItem, activeLensPack\)/);
  [backgroundSource, popupSource].forEach((source) => {
    const itemIndex = source.indexOf('"core/lens_item.js"');
    const matcherIndex = source.indexOf('"core/deterministic_matcher.js"');
    const extractionIndex = source.indexOf('"core/extraction_result.js"');
    const registryIndex = source.lastIndexOf('"sources/source_adapter_registry.js"');
    const jobCatalogueIndex = source.lastIndexOf('"sources/jobs/job_source_catalogue.js"');
    const domReadIndex = source.indexOf('"sources/dom_read_utils.js"');
    const diagnosticsIndex = source.indexOf('"sources/adapter_diagnostics.js"');
    const builderIndex = source.indexOf('"sources/jobs/job_extraction_builder.js"');
    const resultIndex = source.indexOf('"sources/jobs/job_adapter_result.js"');
    const linkedInIndex = source.indexOf('"sources/jobs/linkedin_jobs_adapter.js"');
    const seekIndex = source.indexOf('"sources/jobs/seek_jobs_adapter.js"');
    const compatibilityIndex = source.indexOf('"compatibility/job_extraction_compat.js"');
    const capturePolicyIndex = source.indexOf('"policies/job_capture_policy.js"');
    const policyIndex = source.indexOf('"policies/job_policy_runtime.js"');
    const contentIndex = source.indexOf('"content_bundle.js"');
    assert.ok(itemIndex >= 0 && itemIndex < matcherIndex);
    assert.ok(matcherIndex < extractionIndex && extractionIndex < registryIndex);
    assert.ok(registryIndex < jobCatalogueIndex && jobCatalogueIndex < domReadIndex);
    assert.ok(domReadIndex < diagnosticsIndex);
    assert.ok(diagnosticsIndex < builderIndex && builderIndex < resultIndex);
    assert.ok(resultIndex < linkedInIndex && linkedInIndex < seekIndex);
    assert.ok(seekIndex < compatibilityIndex);
    assert.ok(compatibilityIndex < capturePolicyIndex && capturePolicyIndex < policyIndex);
    assert.ok(policyIndex < contentIndex);
  });
  assert.match(popupHtml, /\.\.\/sources\/source_adapter_registry\.js/);
  assert.match(popupHtml, /\.\.\/sources\/jobs\/job_source_catalogue\.js/);
  assert.doesNotMatch(contentSource, /\.innerHTML\s*=/);
  assert.doesNotMatch(popupSource, /\.innerHTML\s*=/);
  assert.doesNotMatch(reportSource, /\.innerHTML\s*=/);
  assert.match(contentSource, /captureCurrentJob\("job_changed_auto_capture"\)/);
  assert.match(contentSource, /clearInterval\(jobChangeInterval\)/);
  assert.doesNotMatch(contentSource, /function getSeekRecordUrl\(/);
  assert.doesNotMatch(contentSource, /function getLinkedInRecordUrl\(/);
  assert.match(seekAdapterSource, /sourceId:\s*"seek_jobs"/);
  assert.match(seekAdapterSource, /const domDescription = getSeekText/);
  assert.doesNotMatch(
    seekAdapterSource.slice(0, seekAdapterSource.indexOf("function create")),
    /detail_root:\s*\[[\s\S]*?"\[data-job-id\]"/
  );

  assertedDomIds(popupSource, popupHtml, "Popup");
  assertedDomIds(reportSource, reportHtml, "Report");
  assert.match(popupHtml, /Saved jobs/);
  assert.match(popupHtml, /Current source/);
  assert.match(popupHtml, /Captures and ranks jobs locally/);
  assert.match(reportHtml, />Strong Match</);
  assert.match(reportHtml, />Low Match</);
  assert.match(reportHtml, />Ignore \(10% or below\)</);
  assert.match(reportHtml, />Export JSON</);
  assert.match(reportHtml, />Export CSV</);
  assert.doesNotMatch(reportHtml, />Apply</);
  assert.doesNotMatch(reportHtml, /Rule Fit\s+\d+\/100/);
  assert.doesNotMatch(reportSource, /Rule Fit\s+\$\{[^}]+\}\/100/);
  assert.match(reportSource, /"effective_workflow_state"/);
  assert.match(reportSource, /"manual_override"/);
  assert.match(reportSource, /"positive_signals"/);
  assert.match(reportSource, /"negative_signals"/);
  assert.match(reportSource, /"blockers"/);
  assert.match(reportSource, /"notes"/);
  assert.match(reportSource, /record\.memory\?\.last_seen_at,\s*getRecordOpenUrl\(record\),/);
  assert.match(reportCss, /tbody tr\.selected/);
  assert.match(reportCss, /background:\s*var\(--row-bg/);
}

testBackgroundRouting();
testKeywordMatchingAndScoring();
testSeekExactUrl();
testLinkedInCanonicalUrlAndTitleGuard();
testReportReasonClarity();
testTrustLanguageAndSourceReadiness();
testPopupSessionTimer();
testStaticContracts();

console.log("ARK Lens smoke tests passed");
