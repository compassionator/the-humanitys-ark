const SESSION_KEY = "ark_lens_session";
const RECORDS_KEY = "ark_lens_records";
const LENS_PACKS_KEY = "ark_lens_packs";
const ACTIVE_LENS_PACK_ID_KEY = "ark_lens_active_lens_pack_id";
const ADAPTER_PROFILE_OVERRIDES_KEY = "ark_lens_adapter_profile_overrides";
const ADAPTER_PROFILE_LAST_KNOWN_GOOD_KEY = "ark_lens_adapter_profile_last_known_good";
const ADAPTER_PROFILE_ROLLBACKS_KEY = "ark_lens_adapter_profile_rollbacks";
const LENS_PACK_RUNTIME = globalThis.ARK_LENS_PACK_RUNTIME;
const BUNDLED_LENS_PACK = globalThis.ARK_BUNDLED_LENS_PACK;
const SOURCE_ADAPTERS_RUNTIME = globalThis.ARK_SOURCE_ADAPTERS;

if (!LENS_PACK_RUNTIME || !BUNDLED_LENS_PACK || !SOURCE_ADAPTERS_RUNTIME) {
  throw new Error("ARK Lens Pack and source adapter runtimes were not loaded before the popup.");
}
const SOURCE_ADAPTERS = SOURCE_ADAPTERS_RUNTIME.listAdapterDefinitions();

let popupNotice = "";
let popupNoticeTimer = null;
let sessionOperationInProgress = false;
let sessionTimerInterval = null;
let currentPopupSession = { active: false };
let pendingDoctorHelpFile = null;
let pendingRepairProfile = null;
let pendingRepairTest = null;

function normalizeLensPack(lensPack) {
  return LENS_PACK_RUNTIME.migrateLensPack(lensPack, BUNDLED_LENS_PACK);
}

async function ensureLensPackStorage() {
  const result = await chrome.storage.local.get([
    LENS_PACKS_KEY,
    ACTIVE_LENS_PACK_ID_KEY
  ]);
  const migrated = LENS_PACK_RUNTIME.migrateLensPackStorage(
    result[LENS_PACKS_KEY],
    result[ACTIVE_LENS_PACK_ID_KEY],
    BUNDLED_LENS_PACK
  );

  if (migrated.changed) {
    await chrome.storage.local.set({
      [LENS_PACKS_KEY]: migrated.packs,
      [ACTIVE_LENS_PACK_ID_KEY]: migrated.activeId
    });
  }

  return { packs: migrated.packs, activeId: migrated.activeId };
}

async function getActiveLensPack() {
  const { packs, activeId } = await ensureLensPackStorage();
  return normalizeLensPack(packs?.[activeId]);
}

async function saveLensPack(lensPack, makeActive = true) {
  const normalized = normalizeLensPack(lensPack);
  const { packs } = await ensureLensPackStorage();
  const updates = {
    [LENS_PACKS_KEY]: {
      ...packs,
      [normalized.id]: normalized
    }
  };

  if (makeActive) {
    updates[ACTIVE_LENS_PACK_ID_KEY] = normalized.id;
  }

  await chrome.storage.local.set(updates);
}

function sourceLabel(sourceAdapter) {
  return SOURCE_ADAPTERS.find((adapter) => adapter.id === sourceAdapter)?.display_name ||
    sourceAdapter;
}

function behaviorLabel(behavior) {
  return behavior === "report_only" ? "Captures and ranks jobs locally" : behavior;
}

function lensOptionLabelText(lensPack) {
  return lensPack.name;
}

function renderSourceControls(lensPack) {
  const sourceOptions = document.getElementById("sourceOptions");
  const supported = new Set(lensPack.supported_source_adapters || []);

  sourceOptions.textContent = "";

  SOURCE_ADAPTERS.filter((adapter) => adapter.status === "implemented").forEach((adapter) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    const name = document.createElement("span");

    label.className = `source-option ${adapter.status === "planned" ? "planned" : ""}`;

    checkbox.type = "checkbox";
    checkbox.value = adapter.id;
    checkbox.dataset.sourceAdapterId = adapter.id;
    checkbox.checked = adapter.status === "implemented" && supported.has(adapter.id);
    checkbox.disabled = adapter.status !== "implemented";

    name.textContent = adapter.display_name;

    label.appendChild(checkbox);
    label.appendChild(name);

    if (adapter.status !== "implemented") {
      const status = document.createElement("span");
      status.className = "source-status";
      status.textContent = "(planned)";
      label.appendChild(status);
    }

    sourceOptions.appendChild(label);
  });
}

async function renderLensControls() {
  const { packs, activeId } = await ensureLensPackStorage();
  const lensSelect = document.getElementById("lensSelect");
  const activeLens = normalizeLensPack(packs?.[activeId]);

  lensSelect.textContent = "";

  Object.values(packs).map(normalizeLensPack).forEach((lensPack) => {
    const option = document.createElement("option");
    option.value = lensPack.id;
    option.textContent = lensOptionLabelText(lensPack);
    lensSelect.appendChild(option);
  });

  lensSelect.value = activeLens.id;
  document.getElementById("lensMeta").textContent =
    `Job Search Lens \u00b7 ${behaviorLabel(activeLens.behavior)}`;

  renderSourceControls(activeLens);
  return activeLens;
}

function download(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentBundle(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [
      "lens-packs/bundled_lens_pack.js",
      "lens-packs/lens_pack_runtime.js",
      "core/lens_item.js",
      "core/deterministic_matcher.js",
      "core/extraction_result.js",
      "sources/source_adapter_registry.js",
      "sources/jobs/job_source_catalogue.js",
      "sources/dom_read_utils.js",
      "sources/adapter_diagnostics.js",
      "sources/jobs/job_extraction_builder.js",
      "sources/jobs/job_adapter_result.js",
      "sources/jobs/linkedin_jobs_adapter.js",
      "sources/jobs/seek_jobs_adapter.js",
      "compatibility/job_extraction_compat.js",
      "policies/job_capture_policy.js",
      "policies/job_policy_runtime.js",
      "content_bundle.js"
    ]
  });
}

async function sendToTab(tabId, message) {
  await ensureContentBundle(tabId);
  return chrome.tabs.sendMessage(tabId, message);
}

async function getSession() {
  const result = await chrome.storage.local.get(SESSION_KEY);
  return result[SESSION_KEY] || { active: false };
}

async function getRecordsCount() {
  const result = await chrome.storage.local.get(RECORDS_KEY);
  const records = result[RECORDS_KEY] || {};
  return Object.keys(records).length;
}

function parseSessionTimestamp(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatSessionDuration(startedAt, endedAt) {
  const started = parseSessionTimestamp(startedAt);
  const ended = parseSessionTimestamp(endedAt);

  if (started === null || ended === null || ended < started) {
    return "";
  }

  const totalSeconds = Math.floor((ended - started) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${paddedSeconds}s`;
  }
  return `${minutes}m ${paddedSeconds}s`;
}

function formatSessionStartTime(startedAt) {
  const timestamp = parseSessionTimestamp(startedAt);

  if (timestamp === null) {
    return "";
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatCapturedCount(value) {
  const numeric = Number(value);
  const count = Number.isFinite(numeric) && numeric >= 0
    ? Math.floor(numeric)
    : 0;
  return `${count} ${count === 1 ? "job" : "jobs"} captured`;
}

function getSessionTimerDisplay(session, now = Date.now()) {
  const current = session || { active: false };
  const captured = formatCapturedCount(current.captured_count);

  if (current.active) {
    const duration = formatSessionDuration(current.started_at, now);
    const started = formatSessionStartTime(current.started_at);
    return {
      primary: duration ? `Running for ${duration}` : "Session active",
      secondary: [started ? `Started ${started}` : "", captured]
        .filter(Boolean)
        .join(" · "),
      ticking: parseSessionTimestamp(current.started_at) !== null
    };
  }

  const hasPreviousSession = Boolean(
    current.session_id || current.started_at || current.stopped_at
  );
  if (!hasPreviousSession) {
    return { primary: "No active session", secondary: "", ticking: false };
  }

  const duration = formatSessionDuration(current.started_at, current.stopped_at);
  return {
    primary: `Last session: ${[duration, captured].filter(Boolean).join(" · ")}`,
    secondary: "",
    ticking: false
  };
}

function renderSessionTiming(session, now = Date.now()) {
  const display = getSessionTimerDisplay(session, now);
  const meta = document.getElementById("sessionMeta");

  document.getElementById("sessionLabel").textContent = display.primary;
  meta.textContent = display.secondary;
  meta.hidden = !display.secondary;
}

function stopSessionTimer() {
  if (sessionTimerInterval !== null) {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
  }
}

function syncSessionTimer(session) {
  stopSessionTimer();
  currentPopupSession = session || { active: false };
  const display = getSessionTimerDisplay(currentPopupSession);

  renderSessionTiming(currentPopupSession);
  if (display.ticking) {
    sessionTimerInterval = setInterval(() => {
      renderSessionTiming(currentPopupSession);
    }, 1000);
  }
}

function getJobSourceForUrl(value) {
  const source = SOURCE_ADAPTERS_RUNTIME.getSourceForLocation(value || "");
  return source ? { id: source.id, displayName: source.display_name } : null;
}

function getSourceReadiness(tab, lensPack) {
  const source = getJobSourceForUrl(tab?.url);

  if (!source) {
    return {
      sourceId: null,
      label: "Unsupported page",
      canStart: false,
      message: "Open a LinkedIn Jobs or SEEK Jobs page to start a session."
    };
  }

  const supported = Array.isArray(lensPack?.supported_source_adapters)
    ? lensPack.supported_source_adapters
    : [];
  const enabled = supported.includes(source.id) ||
    lensPack?.source_adapter === source.id ||
    lensPack?.active_source_adapter === source.id;

  if (!enabled) {
    return {
      sourceId: source.id,
      label: `${source.displayName} · Disabled`,
      canStart: false,
      message: `Enable ${source.displayName} in the active Lens before starting a session.`
    };
  }

  return {
    sourceId: source.id,
    label: `${source.displayName} · Ready`,
    canStart: true,
    message: ""
  };
}

function setPopupNotice(message, duration = 4000) {
  popupNotice = String(message || "");
  clearTimeout(popupNoticeTimer);

  if (popupNotice && duration > 0) {
    popupNoticeTimer = setTimeout(() => {
      popupNotice = "";
      refreshPopup();
    }, duration);
  }
}

function safeFilenamePart(value) {
  return String(value || "adapter-profile")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "adapter-profile";
}

function createRepairActivationState(
  overrides,
  rollbacks,
  lastKnownGood,
  adapterId,
  candidateProfile,
  currentProfile,
  currentProfileSource
) {
  const nextOverrides = JSON.parse(JSON.stringify(overrides || {}));
  const nextRollbacks = JSON.parse(JSON.stringify(rollbacks || {}));
  const knownGood = lastKnownGood?.[adapterId];
  const rollbackProfile = knownGood?.profile || currentProfile;
  const rollbackSource = knownGood?.profile
    ? knownGood.profile_source
    : currentProfileSource;

  nextOverrides[adapterId] = JSON.parse(JSON.stringify(candidateProfile));
  nextRollbacks[adapterId] = {
    adapter_id: adapterId,
    profile: JSON.parse(JSON.stringify(rollbackProfile)),
    profile_source: rollbackSource === "override" ? "override" : "default",
    verified_at: knownGood?.verified_at || null,
    saved_at: new Date().toISOString()
  };

  return { overrides: nextOverrides, rollbacks: nextRollbacks };
}

function createRepairRollbackState(overrides, rollbacks, adapterId) {
  const nextOverrides = JSON.parse(JSON.stringify(overrides || {}));
  const nextRollbacks = JSON.parse(JSON.stringify(rollbacks || {}));
  const rollback = nextRollbacks[adapterId];

  if (!rollback?.profile) {
    return { overrides: nextOverrides, rollbacks: nextRollbacks, restored: false };
  }

  if (rollback.profile_source === "override") {
    nextOverrides[adapterId] = JSON.parse(JSON.stringify(rollback.profile));
  } else {
    delete nextOverrides[adapterId];
  }
  delete nextRollbacks[adapterId];

  return { overrides: nextOverrides, rollbacks: nextRollbacks, restored: true };
}

function summarizeRepairChanges(currentProfile, candidateProfile) {
  const currentFields = currentProfile?.fields || {};
  const candidateFields = candidateProfile?.fields || {};
  const fieldIds = [...new Set([
    ...Object.keys(currentFields),
    ...Object.keys(candidateFields)
  ])];
  const changedFields = fieldIds.filter((fieldId) =>
    JSON.stringify(currentFields[fieldId] || []) !==
      JSON.stringify(candidateFields[fieldId] || [])
  );

  return {
    changed_fields: changedFields,
    job_identity_changed:
      JSON.stringify(currentProfile?.job_id || {}) !==
      JSON.stringify(candidateProfile?.job_id || {}),
    readiness_changed:
      JSON.stringify(currentProfile?.readiness || {}) !==
      JSON.stringify(candidateProfile?.readiness || {})
  };
}

async function sendDoctorMessage(type, payload) {
  const tab = await getActiveTab();

  if (!tab?.id) {
    throw new Error("No active tab found");
  }

  return sendToTab(tab.id, { type, ...(payload || {}) });
}

function profileSourceLabel(value) {
  if (value === "override") return "Active repair";
  if (value === "candidate") return "Repair preview";
  return "Built-in";
}

function renderDoctorStatus(status) {
  const unsupported = !status?.source_adapter_id;

  document.getElementById("doctorSource").textContent =
    unsupported ? "No supported job source" : status.source_adapter_display_name;
  document.getElementById("doctorProfile").textContent =
    status?.adapter_profile_id
      ? `${status.adapter_profile_id} (${status.adapter_profile_version || "unknown"})`
      : "Unavailable";
  document.getElementById("doctorProfileSource").textContent =
    profileSourceLabel(status?.profile_source);
  document.getElementById("doctorMessage").textContent =
    unsupported
      ? "No supported job source detected on this tab."
      : status?.message || "Adapter Doctor is idle.";
}

async function refreshAdapterDoctorStatus() {
  try {
    const status = await sendDoctorMessage("ARK_ADAPTER_DOCTOR_STATUS");
    renderDoctorStatus(status);
    await updateDoctorRollbackAvailability(status);
    return status;
  } catch (error) {
    renderDoctorStatus({
      source_adapter_display_name: "Unsupported page",
      profile_source: "default",
      message: error?.message || "Adapter Doctor unavailable on this page."
    });
    await updateDoctorRollbackAvailability(null);
    return null;
  }
}

function doctorHealthLabel(health) {
  const labels = {
    pass: "Ready",
    warn: "Limited",
    wait: "Waiting",
    fail: "Needs attention"
  };

  return labels[health] || "Not checked";
}

function doctorCheckMark(status) {
  const marks = {
    pass: "OK",
    warn: "!",
    wait: "...",
    fail: "X"
  };

  return marks[status] || "-";
}

function renderDoctorHealth(result) {
  const health = result?.health || "fail";
  const healthPill = document.getElementById("doctorHealth");
  const checks = document.getElementById("doctorChecks");

  healthPill.className = `doctor-health ${health}`;
  healthPill.textContent = doctorHealthLabel(health);
  checks.textContent = "";

  (result?.checks || []).forEach((check) => {
    const item = document.createElement("li");
    const mark = document.createElement("span");
    const copy = document.createElement("span");
    const label = document.createElement("span");
    const detail = document.createElement("span");

    item.className = `doctor-check ${check.status || "fail"}`;
    mark.className = "doctor-check-mark";
    mark.textContent = doctorCheckMark(check.status);
    copy.className = "doctor-check-copy";
    label.className = "doctor-check-label";
    label.textContent = check.label || check.id || "Check";
    detail.className = "doctor-check-detail";
    detail.textContent = check.detail || "";
    detail.title = check.detail || "";

    copy.appendChild(label);
    copy.appendChild(detail);
    item.appendChild(mark);
    item.appendChild(copy);
    checks.appendChild(item);
  });

  if (result?.status) {
    renderDoctorStatus(result.status);
    const profile = result.status.adapter_profile_id;

    if (profile) {
      document.getElementById("doctorProfile").textContent =
        `${profile} (${result.status.adapter_profile_version || "unknown"})`;
    }
  }

  document.getElementById("doctorMessage").textContent =
    result?.next_action || result?.message || "Health check finished.";
}

function renderDoctorResult(value) {
  document.getElementById("doctorResult").textContent =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

async function runAdapterDoctorHealthCheck() {
  const result = await sendDoctorMessage("ARK_ADAPTER_DOCTOR_HEALTH_CHECK");
  renderDoctorHealth(result);
  renderDoctorResult(result);
  await updateDoctorRollbackAvailability(result?.status);
  return result;
}

function renderDoctorHelpPreview(helpFile) {
  pendingDoctorHelpFile = helpFile;
  document.getElementById("doctorHelpSummary").textContent =
    "Includes capture results, field examples, selector diagnostics, and the current repair profile. URL query parameters, contact details, session data, and raw page HTML are removed.";
  document.getElementById("doctorHelpJsonPreview").textContent =
    JSON.stringify(helpFile, null, 2);
  document.getElementById("doctorHelpPreview").hidden = false;
}

function clearDoctorHelpPreview() {
  pendingDoctorHelpFile = null;
  document.getElementById("doctorHelpJsonPreview").textContent = "";
  document.getElementById("doctorHelpPreview").hidden = true;
}

function clearRepairPreview() {
  pendingRepairProfile = null;
  pendingRepairTest = null;
  document.getElementById("doctorRepairPreview").hidden = true;
  document.getElementById("doctorRepairValidation").textContent = "";
  document.getElementById("doctorRepairValidation").className = "doctor-stage-copy";
  document.getElementById("doctorRepairTestResult").textContent =
    "Test this repair on the current job before activation.";
  document.getElementById("doctorTestRepair").disabled = true;
  document.getElementById("doctorActivateRepair").disabled = true;
}

function renderRepairInspection(result, profile) {
  const preview = document.getElementById("doctorRepairPreview");
  const validation = document.getElementById("doctorRepairValidation");
  const testButton = document.getElementById("doctorTestRepair");
  const activateButton = document.getElementById("doctorActivateRepair");

  preview.hidden = false;
  activateButton.disabled = true;
  pendingRepairTest = null;

  if (result?.validation?.valid) {
    const summary = result.profile_summary;
    const changes = result.change_summary;
    const changeParts = [];

    if (changes?.changed_fields?.length) {
      changeParts.push(`changes ${changes.changed_fields.length} field selector set(s): ${changes.changed_fields.join(", ")}`);
    }
    if (changes?.job_identity_changed) changeParts.push("changes job identity rules");
    if (changes?.readiness_changed) changeParts.push("changes readiness rules");
    if (changeParts.length === 0) changeParts.push("matches the current capture setup");

    pendingRepairProfile = profile;
    validation.className = "doctor-stage-copy success-copy";
    validation.textContent =
      `${summary.display_name} (${summary.version}) · ${summary.field_count} fields · ${summary.selector_count} selectors. Validation passed; ${changeParts.join("; ")}.`;
    testButton.disabled = false;
  } else {
    pendingRepairProfile = null;
    validation.className = "doctor-stage-copy error-copy";
    validation.textContent = result?.validation_message || result?.message || "Repair File validation failed.";
    testButton.disabled = true;
  }
}

async function getDoctorProfileStorage() {
  const result = await chrome.storage.local.get([
    ADAPTER_PROFILE_OVERRIDES_KEY,
    ADAPTER_PROFILE_LAST_KNOWN_GOOD_KEY,
    ADAPTER_PROFILE_ROLLBACKS_KEY
  ]);

  return {
    overrides: result[ADAPTER_PROFILE_OVERRIDES_KEY] || {},
    lastKnownGood: result[ADAPTER_PROFILE_LAST_KNOWN_GOOD_KEY] || {},
    rollbacks: result[ADAPTER_PROFILE_ROLLBACKS_KEY] || {}
  };
}

async function updateDoctorRollbackAvailability(status) {
  const button = document.getElementById("doctorRollback");
  const adapterId = status?.source_adapter_id;

  if (!adapterId) {
    button.hidden = true;
    return;
  }

  const { rollbacks } = await getDoctorProfileStorage();
  button.hidden = !rollbacks[adapterId]?.profile;
}

async function refreshPopup() {
  const [session, count, tab, activeLens] = await Promise.all([
    getSession(),
    getRecordsCount(),
    getActiveTab(),
    renderLensControls()
  ]);
  const statusPill = document.getElementById("statusPill");
  const sessionToggle = document.getElementById("sessionToggle");
  const captureButton = document.getElementById("capture");
  const sessionNote = document.getElementById("sessionNote");
  const tabMismatch = Boolean(session.active && tab?.id && session.tab_id && tab.id !== session.tab_id);
  const readiness = getSourceReadiness(tab, activeLens);

  statusPill.textContent = session.active ? "Active" : "Stopped";
  statusPill.classList.toggle("active", Boolean(session.active));
  sessionToggle.textContent = session.active ? "Stop Session" : "Start Session";
  sessionToggle.disabled = sessionOperationInProgress || (!session.active && !readiness.canStart);
  sessionToggle.title = session.active
    ? "Stop the active capture session."
    : readiness.canStart
      ? `Start capturing from ${readiness.label.replace(" · Ready", "")}.`
      : readiness.message;
  captureButton.disabled =
    !session.active ||
    tabMismatch ||
    !readiness.canStart ||
    sessionOperationInProgress;
  captureButton.title = !session.active
    ? "Start a session before manual capture."
    : tabMismatch
      ? "Switch to the tab where this session is running."
      : !readiness.canStart
        ? readiness.message
      : "Capture the current supported job";

  syncSessionTimer(session);
  document.getElementById("count").textContent =
    String(session.active ? session.captured_count || 0 : count);
  document.getElementById("countLabel").textContent =
    session.active ? "This session" : "Saved jobs";
  document.getElementById("activeTab").textContent = readiness.label;
  document.getElementById("lastJob").textContent =
    session.last_captured_title || "None yet";
  const note = tabMismatch
    ? "Session is running on another tab."
    : popupNotice || (!session.active ? readiness.message : "");
  sessionNote.hidden = !note;
  sessionNote.textContent = note;

}

async function startSession() {
  const tab = await getActiveTab();

  if (!tab?.id) {
    throw new Error("No active tab found");
  }

  await ensureLensPackStorage();

  const status = await sendToTab(tab.id, { type: "ARK_ADAPTER_DOCTOR_STATUS" });

  if (!status?.source_adapter_id || status.adapter_status !== "implemented") {
    throw new Error("Open a supported LinkedIn or SEEK Jobs page before starting a session.");
  }

  if (!status.supported_by_active_lens) {
    throw new Error("Enable this source in the active Lens Pack before starting a session.");
  }

  const now = new Date().toISOString();
  const session = {
    active: true,
    session_id: `session_${Date.now()}`,
    started_at: now,
    stopped_at: null,
    tab_id: tab.id,
    window_id: tab.windowId ?? null,
    mode: "same_tab_active_session",
    last_captured_job_id: null,
    last_captured_title: "",
    captured_count: 0,
    last_capture_at: null
  };

  await chrome.storage.local.set({ [SESSION_KEY]: session });
  try {
    const result = await sendToTab(tab.id, { type: "ARK_START_LISTENING" });

    if (result?.ok === false) {
      throw new Error(result.message || "The capture listener could not start.");
    }
  } catch (error) {
    await chrome.storage.local.set({
      [SESSION_KEY]: {
        ...session,
        active: false,
        stopped_at: new Date().toISOString()
      }
    });
    throw error;
  }

  setPopupNotice(`Session started on ${status.source_adapter_display_name}.`);
  setTimeout(refreshPopup, 600);
}

async function stopSession() {
  const session = await getSession();
  const stopped = {
    ...session,
    active: false,
    stopped_at: new Date().toISOString()
  };

  await chrome.storage.local.set({ [SESSION_KEY]: stopped });

  if (session.tab_id) {
    try {
      await chrome.tabs.sendMessage(session.tab_id, { type: "ARK_STOP_LISTENING" });
    } catch (error) {
      console.warn("[ARK Lens] stop listener message failed", error);
    }
  }

  setPopupNotice("Session stopped.");
  await refreshPopup();
}

document.getElementById("lensSelect").addEventListener("change", async (event) => {
  await chrome.storage.local.set({ [ACTIVE_LENS_PACK_ID_KEY]: event.target.value });
  await renderLensControls();
});

document.getElementById("sourceOptions").addEventListener("change", async (event) => {
  const lensPack = await getActiveLensPack();
  const selectedSources = [
    ...document.querySelectorAll("#sourceOptions input[data-source-adapter-id]:checked:not(:disabled)")
  ].map((input) => input.value);

  if (selectedSources.length === 0) {
    event.target.checked = true;
    setPopupNotice("Keep at least one capture source enabled.");
    await refreshPopup();
    return;
  }

  lensPack.supported_source_adapters = selectedSources;

  if (selectedSources.length > 0) {
    lensPack.source_adapter = selectedSources.includes(lensPack.source_adapter)
      ? lensPack.source_adapter
      : selectedSources[0];
    lensPack.active_source_adapter = selectedSources.includes(lensPack.active_source_adapter)
      ? lensPack.active_source_adapter
      : selectedSources[0];
  }

  await saveLensPack(lensPack, true);
  await renderLensControls();
});

document.getElementById("alphaGuide").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("alpha/guide.html") });
});

document.getElementById("editLens").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("lens-editor/editor.html") });
});

document.getElementById("sessionToggle").addEventListener("click", async () => {
  if (sessionOperationInProgress) {
    return;
  }

  sessionOperationInProgress = true;
  await refreshPopup();

  try {
    const session = await getSession();

    if (session.active) {
      await stopSession();
    } else {
      await startSession();
    }
  } catch (error) {
    console.error("[ARK Lens] session toggle failed", error);
    setPopupNotice(error?.message || "Session action failed.", 6000);
  } finally {
    sessionOperationInProgress = false;
    await refreshPopup();
  }
});

document.getElementById("capture").addEventListener("click", async () => {
  try {
    const [tab, session] = await Promise.all([getActiveTab(), getSession()]);

    if (!tab?.id) {
      throw new Error("No active tab found");
    }

    if (!session.active) {
      throw new Error("Start a session before manual capture.");
    }

    if (session.tab_id && session.tab_id !== tab.id) {
      throw new Error("Switch to the tab where this session is running before capturing.");
    }

    await ensureLensPackStorage();
    const result = await sendToTab(tab.id, { type: "ARK_CAPTURE_NOW" });

    if (!result?.ok) {
      throw new Error(result?.message || "No job was ready to capture.");
    }

    setPopupNotice(result.title ? `Saved: ${result.title}` : "Job saved.");
    setTimeout(refreshPopup, 600);
  } catch (error) {
    console.error("[ARK Lens] capture failed", error);
    setPopupNotice(error?.message || "Capture failed.", 6000);
    await refreshPopup();
  }
});

document.getElementById("report").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("report/report.html") });
});

document.getElementById("adapterDoctor").addEventListener("toggle", async (event) => {
  if (event.target !== event.currentTarget) {
    return;
  }

  if (event.target.open) {
    try {
      await runAdapterDoctorHealthCheck();
    } catch (error) {
      renderDoctorHealth({
        health: "fail",
        checks: [],
        next_action: error?.message || "Adapter Doctor unavailable on this page."
      });
    }
  }
});

document.getElementById("doctorTest").addEventListener("click", async () => {
  try {
    await runAdapterDoctorHealthCheck();
  } catch (error) {
    renderDoctorHealth({
      health: "fail",
      checks: [],
      next_action: error?.message || "Adapter Doctor health check failed."
    });
  }
});

document.getElementById("doctorExportDebug").addEventListener("click", async () => {
  try {
    const result = await sendDoctorMessage("ARK_ADAPTER_DOCTOR_EXPORT_DEBUG");

    if (!result?.ok || !result.debug) {
      throw new Error(result?.message || "Adapter debug export failed.");
    }

    renderDoctorHelpPreview(result.debug);
    document.getElementById("doctorMessage").textContent =
      "Review what the Help File contains before downloading or sharing it.";
  } catch (error) {
    document.getElementById("doctorMessage").textContent =
      error?.message || "Adapter help export failed.";
  }
});

document.getElementById("doctorDownloadHelp").addEventListener("click", () => {
  if (!pendingDoctorHelpFile) return;

  const adapterId = pendingDoctorHelpFile.detected_source_adapter_id || "unknown-source";
  download(
    `ark-capture-help-${safeFilenamePart(adapterId)}-${Date.now()}.json`,
    JSON.stringify(pendingDoctorHelpFile, null, 2),
    "application/json"
  );
  document.getElementById("doctorMessage").textContent = "Help File downloaded.";
});

document.getElementById("doctorCancelHelp").addEventListener("click", clearDoctorHelpPreview);

document.getElementById("doctorExportProfile").addEventListener("click", async () => {
  try {
    const result = await sendDoctorMessage("ARK_ADAPTER_DOCTOR_EXPORT_PROFILE");

    if (!result?.ok || !result.profile) {
      throw new Error(result?.message || "Adapter profile export failed.");
    }

    download(
      `ark-repair-file-${safeFilenamePart(result.source_adapter_id)}-${safeFilenamePart(result.adapter_profile_version)}.json`,
      JSON.stringify(result.profile, null, 2),
      "application/json"
    );
    document.getElementById("doctorMessage").textContent = "Current Repair File downloaded.";
  } catch (error) {
    document.getElementById("doctorMessage").textContent =
      error?.message || "Adapter profile export failed.";
  }
});

document.getElementById("doctorPreviewRepair").addEventListener("click", async () => {
  try {
    const profile = JSON.parse(document.getElementById("doctorRepairJson").value || "{}");
    const result = await sendDoctorMessage("ARK_ADAPTER_DOCTOR_VALIDATE_REPAIR", { profile });
    if (result?.validation?.valid) {
      const current = await sendDoctorMessage("ARK_ADAPTER_DOCTOR_EXPORT_PROFILE");
      result.change_summary = summarizeRepairChanges(current?.profile, profile);
    }
    renderRepairInspection(result, profile);
  } catch (error) {
    clearRepairPreview();
    document.getElementById("doctorRepairPreview").hidden = false;
    document.getElementById("doctorRepairValidation").className =
      "doctor-stage-copy error-copy";
    document.getElementById("doctorRepairValidation").textContent =
      error?.message || "Repair File JSON could not be read.";
  }
});

document.getElementById("doctorCancelRepair").addEventListener("click", clearRepairPreview);

document.getElementById("doctorTestRepair").addEventListener("click", async () => {
  const resultCopy = document.getElementById("doctorRepairTestResult");

  try {
    if (!pendingRepairProfile) throw new Error("Preview a valid Repair File first.");

    resultCopy.className = "doctor-stage-copy muted-copy";
    resultCopy.textContent = "Testing this repair on the current job…";
    const result = await sendDoctorMessage("ARK_ADAPTER_DOCTOR_TEST_REPAIR", {
      profile: pendingRepairProfile
    });
    pendingRepairTest = result;
    document.getElementById("doctorActivateRepair").disabled = !result?.can_activate;
    resultCopy.className = result?.can_activate
      ? "doctor-stage-copy success-copy"
      : "doctor-stage-copy error-copy";
    const fields = result?.health_check?.fields || {};
    const capturedExample = result?.can_activate
      ? ` Reads “${fields.title || "Untitled job"}”${fields.company ? ` at ${fields.company}` : ""}${fields.location ? ` in ${fields.location}` : ""}.`
      : "";
    resultCopy.textContent = `${result?.message || "Repair test finished."}${capturedExample}`;
    renderDoctorResult(result);
  } catch (error) {
    pendingRepairTest = null;
    document.getElementById("doctorActivateRepair").disabled = true;
    resultCopy.className = "doctor-stage-copy error-copy";
    resultCopy.textContent = error?.message || "Repair test failed. Nothing was activated.";
  }
});

document.getElementById("doctorActivateRepair").addEventListener("click", async () => {
  try {
    if (!pendingRepairProfile || !pendingRepairTest?.can_activate) {
      throw new Error("The Repair File must pass its test before activation.");
    }

    const status = await refreshAdapterDoctorStatus();
    const adapterId = status?.source_adapter_id;
    if (!adapterId || adapterId !== pendingRepairTest.adapter_id) {
      throw new Error("Return to the source where this Repair File was tested.");
    }

    const current = await sendDoctorMessage("ARK_ADAPTER_DOCTOR_EXPORT_PROFILE");
    if (!current?.profile) throw new Error("The current capture setup could not be backed up.");

    const storage = await getDoctorProfileStorage();
    const activation = createRepairActivationState(
      storage.overrides,
      storage.rollbacks,
      storage.lastKnownGood,
      adapterId,
      pendingRepairProfile,
      current.profile,
      current.profile_source
    );

    await chrome.storage.local.set({
      [ADAPTER_PROFILE_OVERRIDES_KEY]: activation.overrides,
      [ADAPTER_PROFILE_ROLLBACKS_KEY]: activation.rollbacks
    });
    document.getElementById("doctorRepairJson").value = "";
    clearRepairPreview();
    await runAdapterDoctorHealthCheck();
    document.getElementById("doctorMessage").textContent =
      "Repair activated. You can undo it with Undo Last Repair.";
  } catch (error) {
    document.getElementById("doctorMessage").textContent =
      error?.message || "Repair activation failed.";
  }
});

document.getElementById("doctorRollback").addEventListener("click", async () => {
  try {
    const status = await refreshAdapterDoctorStatus();
    const adapterId = status?.source_adapter_id;
    if (!adapterId) throw new Error("Open the job source whose repair you want to undo.");
    if (!confirm(`Undo the last capture repair for ${sourceLabel(adapterId)}?`)) return;

    const storage = await getDoctorProfileStorage();
    const rollback = createRepairRollbackState(
      storage.overrides,
      storage.rollbacks,
      adapterId
    );
    if (!rollback.restored) throw new Error("No previous capture setup is available.");

    await chrome.storage.local.set({
      [ADAPTER_PROFILE_OVERRIDES_KEY]: rollback.overrides,
      [ADAPTER_PROFILE_ROLLBACKS_KEY]: rollback.rollbacks
    });
    await runAdapterDoctorHealthCheck();
    document.getElementById("doctorMessage").textContent = "Previous capture setup restored.";
  } catch (error) {
    document.getElementById("doctorMessage").textContent =
      error?.message || "The previous capture setup could not be restored.";
  }
});

document.getElementById("doctorResetProfile").addEventListener("click", async () => {
  try {
    const status = await refreshAdapterDoctorStatus();
    const adapterId = status?.source_adapter_id;

    if (!adapterId) {
      throw new Error("No source adapter detected for this page.");
    }

    if (status.profile_source !== "override") {
      document.getElementById("doctorMessage").textContent =
        "The built-in capture setup is already active.";
      return;
    }

    if (!confirm(`Use the built-in capture setup for ${sourceLabel(adapterId)}? You can undo this change.`)) {
      return;
    }

    const current = await sendDoctorMessage("ARK_ADAPTER_DOCTOR_EXPORT_PROFILE");
    const storage = await getDoctorProfileStorage();
    const overrides = { ...storage.overrides };
    const rollbacks = {
      ...storage.rollbacks,
      [adapterId]: {
        adapter_id: adapterId,
        profile: current.profile,
        profile_source: "override",
        verified_at: storage.lastKnownGood[adapterId]?.verified_at || null,
        saved_at: new Date().toISOString()
      }
    };
    delete overrides[adapterId];

    await chrome.storage.local.set({
      [ADAPTER_PROFILE_OVERRIDES_KEY]: overrides,
      [ADAPTER_PROFILE_ROLLBACKS_KEY]: rollbacks
    });
    await runAdapterDoctorHealthCheck();
  } catch (error) {
    document.getElementById("doctorMessage").textContent =
      error?.message || "Adapter profile reset failed.";
  }
});

function handlePopupStorageChange(changes, areaName) {
  if (areaName !== "local") {
    return;
  }

  if (changes[SESSION_KEY] || changes[RECORDS_KEY]) {
    refreshPopup();
  }

  if (
    changes[ADAPTER_PROFILE_OVERRIDES_KEY] ||
    changes[ADAPTER_PROFILE_ROLLBACKS_KEY]
  ) {
    refreshAdapterDoctorStatus();
  }
}

function cleanupPopup() {
  stopSessionTimer();
  clearTimeout(popupNoticeTimer);
  chrome.storage.onChanged.removeListener(handlePopupStorageChange);
}

chrome.storage.onChanged.addListener(handlePopupStorageChange);
window.addEventListener("unload", cleanupPopup, { once: true });

refreshPopup();
