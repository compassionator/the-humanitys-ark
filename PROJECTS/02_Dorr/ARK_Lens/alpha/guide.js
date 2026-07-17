const RECORDS_KEY = "ark_lens_records";
const SESSION_KEY = "ark_lens_session";
const LENS_PACKS_KEY = "ark_lens_packs";
const ACTIVE_LENS_PACK_ID_KEY = "ark_lens_active_lens_pack_id";
const LENS_PACK_RUNTIME = globalThis.ARK_LENS_PACK_RUNTIME;
const BUNDLED_LENS_PACK = globalThis.ARK_BUNDLED_LENS_PACK;
let currentAlphaSummary = null;

if (!LENS_PACK_RUNTIME || !BUNDLED_LENS_PACK) {
  throw new Error("ARK Lens Pack runtime was not loaded before the Alpha Guide.");
}

function getFeedbackValue(record) {
  const stored = record?.memory?.relevance_feedback;
  const value = typeof stored === "string" ? stored : stored?.value;
  return ["relevant", "not_relevant", "unsure"].includes(value)
    ? value
    : "unrated";
}

function incrementCount(counts, key) {
  const normalizedKey = String(key || "unknown");
  counts[normalizedKey] = (counts[normalizedKey] || 0) + 1;
  return counts;
}

function buildPeerTestSummary(manifest, activeLens, records, session, generatedAt) {
  const safeRecords = Array.isArray(records) ? records : [];
  const bySource = {};
  const byEffectiveFit = {};
  const byRelevance = {};
  const allowedSources = ["linkedin_jobs", "seek_jobs"];

  safeRecords.forEach((record) => {
    const source = allowedSources.includes(record?.source?.id)
      ? record.source.id
      : "other";
    const originalFit = record?.classification?.workflow_state;
    const effectiveFit = record?.memory?.user_workflow_override || originalFit;
    const normalizedFit = ["apply", "review", "ignore", "applied"].includes(effectiveFit)
      ? effectiveFit
      : "unknown";

    incrementCount(bySource, source);
    incrementCount(byEffectiveFit, normalizedFit);
    incrementCount(byRelevance, getFeedbackValue(record));
  });

  return {
    schema_version: "1.0.0",
    release_channel: "controlled_peer_alpha",
    generated_at: generatedAt || new Date().toISOString(),
    ark_lens_version: String(manifest?.version || "unknown"),
    lens_contract: {
      version: String(activeLens?.lens_pack_version || activeLens?.version || "unknown"),
      enabled_sources: (activeLens?.supported_source_adapters || [])
        .filter((sourceId) => allowedSources.includes(sourceId))
    },
    counts: {
      saved_jobs: safeRecords.length,
      with_relevance_feedback: safeRecords.filter(
        (record) => getFeedbackValue(record) !== "unrated"
      ).length,
      by_source: bySource,
      by_effective_fit: byEffectiveFit,
      by_relevance: byRelevance
    },
    session: {
      active: Boolean(session?.active),
      captured_count: Number.isFinite(session?.captured_count)
        ? session.captured_count
        : 0
    },
    privacy: {
      local_only: true,
      excluded: [
        "job titles",
        "companies",
        "locations",
        "descriptions",
        "URLs",
        "notes",
        "feedback details",
        "Lens names and ids",
        "session and tab ids"
      ]
    }
  };
}

async function ensureLensStorage() {
  const stored = await chrome.storage.local.get([
    LENS_PACKS_KEY,
    ACTIVE_LENS_PACK_ID_KEY
  ]);
  const migrated = LENS_PACK_RUNTIME.migrateLensPackStorage(
    stored[LENS_PACKS_KEY],
    stored[ACTIVE_LENS_PACK_ID_KEY],
    BUNDLED_LENS_PACK
  );

  if (migrated.changed) {
    await chrome.storage.local.set({
      [LENS_PACKS_KEY]: migrated.packs,
      [ACTIVE_LENS_PACK_ID_KEY]: migrated.activeId
    });
  }

  return {
    activeLens: migrated.packs[migrated.activeId],
    activeId: migrated.activeId
  };
}

function setCheck(id, state, title, copy) {
  const card = document.getElementById(id);
  card.classList.remove("checking", "ready", "neutral");
  card.classList.add(state);
  card.querySelector("strong").textContent = title;
  card.querySelector("p").textContent = copy;
}

function setNotice(message, isError = false) {
  const notice = document.getElementById("alphaNotice");
  notice.textContent = message || "";
  notice.classList.toggle("error", isError);
}

async function loadAlphaState() {
  const [{ activeLens }, stored] = await Promise.all([
    ensureLensStorage(),
    chrome.storage.local.get([RECORDS_KEY, SESSION_KEY])
  ]);
  const records = Object.values(stored[RECORDS_KEY] || {});
  const session = stored[SESSION_KEY] || { active: false };
  const manifest = chrome.runtime.getManifest();

  return { activeLens, records, session, manifest };
}

async function refreshReadiness() {
  try {
    const { activeLens, records, session, manifest } = await loadAlphaState();
    const sources = (activeLens?.supported_source_adapters || [])
      .filter((sourceId) => ["linkedin_jobs", "seek_jobs"].includes(sourceId));
    const feedbackCount = records.filter(
      (record) => getFeedbackValue(record) !== "unrated"
    ).length;
    const ready = Boolean(activeLens && sources.length > 0);
    const overall = document.getElementById("readinessOverall");

    document.getElementById("buildVersion").textContent = `v${manifest.version}`;
    overall.textContent = ready ? "Ready for testing" : "Needs setup";
    overall.className = `overall-status ${ready ? "ready" : "needs-setup"}`;

    setCheck(
      "checkLens",
      activeLens ? "ready" : "neutral",
      activeLens?.name || "Needs setup",
      activeLens
        ? `Contract ${activeLens.lens_pack_version || activeLens.version}`
        : "Open Customize My Lens to create or restore a Lens."
    );
    setCheck(
      "checkSources",
      sources.length > 0 ? "ready" : "neutral",
      sources.length > 0 ? `${sources.length} enabled` : "None enabled",
      sources.length > 0
        ? sources.map((sourceId) => sourceId === "linkedin_jobs" ? "LinkedIn Jobs" : "SEEK Jobs").join(" and ")
        : "Enable at least one source in your Lens."
    );
    setCheck(
      "checkStorage",
      "ready",
      `${records.length} saved job${records.length === 1 ? "" : "s"}`,
      `${feedbackCount} with relevance feedback. Stored locally.`
    );
    setCheck(
      "checkSession",
      session.active ? "ready" : "neutral",
      session.active ? "Active" : "Stopped",
      session.active
        ? `Green A badge shown · ${session.captured_count || 0} captured this session.`
        : "Start from the popup on a supported job page."
    );

    currentAlphaSummary = buildPeerTestSummary(
      manifest,
      activeLens,
      records,
      session,
      new Date().toISOString()
    );
  } catch (error) {
    const overall = document.getElementById("readinessOverall");
    overall.textContent = "Check failed";
    overall.className = "overall-status needs-setup";
    setNotice(error?.message || "Readiness could not be checked.", true);
  }
}

function downloadText(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy was not available in this browser.");
}

function getFeedbackTemplate(version) {
  return [
    "ARK Lens peer-alpha feedback",
    `Build: v${version}`,
    "",
    "What were you trying to do?",
    "",
    "What did you expect?",
    "",
    "What happened instead?",
    "",
    "Impact: Blocked / Difficult / Minor / Suggestion",
    "Source: LinkedIn Jobs / SEEK Jobs / Report / Lens setup / Fix Capture",
    "",
    "Steps to reproduce:",
    "1. ",
    "2. ",
    "3. ",
    "",
    "Attachments: Alpha Test Summary, screenshot, and Help File if capture failed.",
    "Please do not attach raw job-page HTML or files containing information you do not want to share."
  ].join("\n");
}

document.getElementById("refreshReadiness").addEventListener("click", async () => {
  setNotice("");
  await refreshReadiness();
});

document.getElementById("openLensEditor").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("lens-editor/editor.html") });
});

document.getElementById("openReport").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("report/report.html") });
});

document.getElementById("downloadAlphaSummary").addEventListener("click", async () => {
  try {
    await refreshReadiness();
    const version = chrome.runtime.getManifest().version;
    downloadText(
      `ark-lens-v${version}-alpha-test-summary.json`,
      JSON.stringify(currentAlphaSummary, null, 2),
      "application/json"
    );
    setNotice("Alpha Test Summary downloaded. It contains aggregate counts only.");
  } catch (error) {
    setNotice(error?.message || "The Alpha Test Summary could not be downloaded.", true);
  }
});

document.getElementById("copyFeedbackTemplate").addEventListener("click", async () => {
  try {
    await copyText(getFeedbackTemplate(chrome.runtime.getManifest().version));
    setNotice("Feedback template copied.");
  } catch (error) {
    setNotice(error?.message || "The feedback template could not be copied.", true);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === "local" &&
    (
      changes[RECORDS_KEY] ||
      changes[SESSION_KEY] ||
      changes[LENS_PACKS_KEY] ||
      changes[ACTIVE_LENS_PACK_ID_KEY]
    )
  ) {
    refreshReadiness();
  }
});

refreshReadiness();
