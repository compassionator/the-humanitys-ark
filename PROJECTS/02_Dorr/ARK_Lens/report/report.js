const RECORDS_KEY = "ark_lens_records";
const LENS_PACKS_KEY = "ark_lens_packs";
const ACTIVE_LENS_PACK_ID_KEY = "ark_lens_active_lens_pack_id";
const LENS_PACK_RUNTIME = globalThis.ARK_LENS_PACK_RUNTIME;
const BUNDLED_LENS_PACK = globalThis.ARK_BUNDLED_LENS_PACK;

if (!LENS_PACK_RUNTIME || !BUNDLED_LENS_PACK) {
  throw new Error("ARK Lens Pack runtime was not loaded before the report.");
}


let recordsMap = {};
let visibleRecordIds = [];
const selectedRecordIds = new Set();
let activeDrawerRecordId = null;
let drawerPreviousFocus = null;
let selectedFeedbackValue = "unrated";
let renderGeneration = 0;

async function loadRecords() {
  const result = await chrome.storage.local.get(RECORDS_KEY);
  recordsMap = result[RECORDS_KEY] || {};
  return Object.values(recordsMap);
}

async function saveRecords() {
  await chrome.storage.local.set({ [RECORDS_KEY]: recordsMap });
}

function cloneDefaultLensPack() {
  return LENS_PACK_RUNTIME.clone(BUNDLED_LENS_PACK);
}

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

function normalizeDisplayText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getRelevanceReasonLabel(reason) {
  const labels = {
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

  return labels[reason] || "";
}

function getRelevanceFeedbackValue(record) {
  const feedback = record?.memory?.relevance_feedback;
  const value = typeof feedback === "string" ? feedback : feedback?.value;
  return ["relevant", "not_relevant", "unsure"].includes(value) ? value : "unrated";
}

function getRelevanceFeedbackLabel(value) {
  const labels = {
    relevant: "Relevant",
    not_relevant: "Not relevant",
    unsure: "Unsure",
    unrated: "Unrated"
  };

  return labels[value] || labels.unrated;
}

function applyRelevanceFeedback(record, input, timestamp, eventId) {
  const value = String(input?.value || "");
  const reason = String(input?.reason || "");
  const detail = String(input?.detail || "").trim().slice(0, 1000);
  const validValues = ["relevant", "not_relevant", "unsure"];
  const validReasons = [
    "wrong_job_family",
    "wrong_seniority",
    "wrong_domain",
    "wrong_location",
    "too_hands_on",
    "too_managerial",
    "technology_mismatch",
    "work_rights",
    "other"
  ];

  if (!validValues.includes(value)) {
    throw new Error("Choose Relevant, Not relevant, or Unsure.");
  }
  if (value === "not_relevant" && !validReasons.includes(reason)) {
    throw new Error("Choose a reason for marking this job Not relevant.");
  }
  if (value === "not_relevant" && reason === "other" && !detail) {
    throw new Error("Add a short detail when the reason is Other.");
  }

  const updated = JSON.parse(JSON.stringify(record));
  const createdAt = timestamp || new Date().toISOString();
  const id = eventId || `feedback-${Date.now()}`;
  const normalizedReason = value === "not_relevant" ? reason : null;
  const normalizedDetail = value === "not_relevant" ? detail : "";
  const context = {
    local_match_score: updated.classification?.match_score ?? null,
    original_workflow_state: updated.classification?.workflow_state ?? null,
    effective_workflow_state:
      updated.memory?.user_workflow_override ||
      updated.classification?.workflow_state ||
      null,
    lens_pack_id: updated.classification?.lens_pack_id ?? null,
    lens_pack_version: updated.classification?.lens_pack_version ?? null,
    source_id: updated.source?.id ?? null,
    title: updated.display?.primary_text ?? null
  };
  const event = {
    schema_version: "1.0.0",
    id,
    type: "relevance_feedback",
    value,
    reason: normalizedReason,
    detail: normalizedDetail,
    created_at: createdAt,
    context
  };
  const previousEvents = Array.isArray(updated.memory?.feedback_events)
    ? updated.memory.feedback_events
    : [];
  const history = [...previousEvents, event].slice(-100);

  updated.memory = {
    ...updated.memory,
    relevance_feedback: {
      schema_version: "1.0.0",
      event_id: id,
      value,
      reason: normalizedReason,
      detail: normalizedDetail,
      updated_at: createdAt
    },
    feedback_events: history
  };

  return updated;
}

function clearRelevanceFeedback(record, timestamp, eventId) {
  const updated = JSON.parse(JSON.stringify(record));
  const createdAt = timestamp || new Date().toISOString();
  const id = eventId || `feedback-${Date.now()}`;
  const event = {
    schema_version: "1.0.0",
    id,
    type: "relevance_feedback_cleared",
    value: null,
    reason: null,
    detail: "",
    created_at: createdAt,
    context: {
      local_match_score: updated.classification?.match_score ?? null,
      original_workflow_state: updated.classification?.workflow_state ?? null,
      effective_workflow_state:
        updated.memory?.user_workflow_override ||
        updated.classification?.workflow_state ||
        null,
      lens_pack_id: updated.classification?.lens_pack_id ?? null,
      lens_pack_version: updated.classification?.lens_pack_version ?? null,
      source_id: updated.source?.id ?? null,
      title: updated.display?.primary_text ?? null
    }
  };
  const previousEvents = Array.isArray(updated.memory?.feedback_events)
    ? updated.memory.feedback_events
    : [];

  updated.memory = {
    ...updated.memory,
    relevance_feedback: null,
    feedback_events: [...previousEvents, event].slice(-100)
  };

  return updated;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addCell(row, text, className = "") {
  const cell = document.createElement("td");
  const displayText = text ?? "";
  const content = document.createElement("span");

  content.className = "cell-text";
  content.textContent = displayText;
  cell.title = String(displayText);

  if (className) {
    cell.className = className;
  }

  cell.appendChild(content);
  row.appendChild(cell);
  return cell;
}

function formatDateTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });

  if (sameDay) {
    return `Today ${time}`;
  }

  const dayMonth = date.toLocaleDateString([], {
    day: "2-digit",
    month: "short"
  });

  return `${dayMonth} ${time}`;
}

function formatFullDateTime(value) {
  if (!value) return "";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function formatMatchScore(value) {
  return Number.isFinite(value) ? `${value}%` : "";
}

function formatSignals(signals) {
  return (signals || [])
    .map((signal) => {
      const keywords = (signal.keywords || []).join(", ");
      return keywords ? `${signal.id}: ${keywords}` : signal.id;
    })
    .join(" | ");
}

function formatAllSignals(record) {
  const signals = record.classification?.signals || {};
  const parts = [
    formatSignals(signals.negative),
    formatSignals(signals.blockers),
    formatSignals(signals.positive)
  ].filter(Boolean);

  return parts.join(" | ");
}

function cleanLinkedInMetaText(value) {
  return normalizeDisplayText(value)
    .replace(/\u00c2\u00b7/g, "\u00b7")
    .replace(/applyPromoted/g, "apply \u00b7 Promoted")
    .replace(/hirerResponses/g, "hirer \u00b7 Responses")
    .replace(/applicantsPromoted/g, "applicants \u00b7 Promoted")
    .replace(/\s*\u00b7\s*/g, " \u00b7 ");
}

function parseRecordMetaText(record) {
  const raw = record.display?.tertiary_text ||
    record.metadata?.raw_location_text ||
    "";
  const cleaned = cleanLinkedInMetaText(raw);
  const parts = cleaned
    .split(/\s*\u00b7\s*/)
    .map(normalizeDisplayText)
    .filter(Boolean);
  const postedPattern = /\b(?:\d+\s*(?:m|h|d|w|mo|y)\s+ago|\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago|just now|today)\b/i;
  const interestPattern = /\b(?:Over\s+)?\d+\s+(?:people clicked apply|applicants?)\b/i;
  const postedAge = normalizeDisplayText(record.metadata?.posted) ||
    (parts.find((part) => postedPattern.test(part)) || "")
    .match(postedPattern)?.[0] || "";
  const interestText = normalizeDisplayText(
    record.metadata?.interest_text ||
    record.metadata?.interest ||
    record.metadata?.applicant_count
  ) || (parts.find((part) => interestPattern.test(part)) || "")
    .match(interestPattern)?.[0] || "";
  const rawLocation = normalizeDisplayText(record.metadata?.raw_location_text);
  const preferRawLocation =
    rawLocation &&
    record.source?.id === "seek_jobs" &&
    !postedPattern.test(rawLocation) &&
    !interestPattern.test(rawLocation);
  const cleanLocation = preferRawLocation ? rawLocation : parts.find((part) =>
    !postedPattern.test(part) &&
    !interestPattern.test(part) &&
    !/promoted|responses managed|responses off linkedin|hirer/i.test(part)
  ) || "";
  const extraMeta = parts.filter((part) =>
    part !== cleanLocation &&
    part !== postedAge &&
    part !== interestText
  ).join(" \u00b7 ");

  return {
    cleanLocation,
    postedAge,
    interestText,
    extraMeta,
    fullText: cleaned
  };
}

function getExportLocation(record) {
  const meta = parseRecordMetaText(record);
  return meta.cleanLocation ||
    normalizeDisplayText(record.metadata?.raw_location_text) ||
    normalizeDisplayText(record.display?.tertiary_text);
}

function getLinkedInLocationPattern() {
  return /\b(?:remote|hybrid|onsite|on-site)\b|(?:[A-Z][A-Za-z .'-]+,\s*(?:New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Australian Capital Territory|Northern Territory|NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia)\b[^\n]*)|(?:[A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)?\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b(?:\s*\([^)]*\))?)/i;
}

function getLinkedInGeoLocationPattern() {
  return /(?:[A-Z][A-Za-z .'-]+,\s*(?:New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Australian Capital Territory|Northern Territory|NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia)\b[^\n]*)|(?:[A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)?\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b(?:\s*\([^)]*\))?)/g;
}

function getLinkedInGeoLocationMatches(text) {
  const patterns = [
    /(?=([A-Z][A-Za-z .'-]+,\s*(?:New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Australian Capital Territory|Northern Territory|NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia)\b[^\n]*))/g,
    /(?=([A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)?\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b(?:\s*\([^)]*\))?))/g
  ];
  const matches = patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => normalizeDisplayText(match[1]))
  );

  return [...new Set(matches.filter(Boolean))]
    .sort((a, b) => a.length - b.length);
}

function inferCompanyAndLocationForDisplay(record) {
  const title = normalizeDisplayText(record.display?.primary_text);
  const text = record.content?.full_text || record.content?.summary || "";

  if (!title || !text) {
    return { company: "", location: "" };
  }

  const lines = String(text)
    .split(/\r?\n/)
    .map(normalizeDisplayText)
    .filter(Boolean)
    .filter((line, index, arr) => arr.indexOf(line) === index);
  const titleIndex = lines.findIndex((line) => line === title || line.includes(title));
  const usefulLines = titleIndex >= 0 ? lines.slice(titleIndex + 1) : lines;
  const noisyLinePattern =
    /^(viewed|promoted|apply|save|saved|share|show more|dismiss|view job|active job|jump to)$/i;
  const metadataLinePattern =
    /\b(?:people clicked apply|applicants?|responses managed|promoted by hirer|school alum|school alumni|connection works|connections work|viewed|hybrid|remote|on-site|onsite|full-time|part-time|contract|temporary)\b/i;
  const locationPattern =
    /\b(?:remote|hybrid|onsite|on-site)\b|(?:[A-Z][A-Za-z .'-]+,\s*(?:New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Australian Capital Territory|Northern Territory|NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia)\b[^·\n]*)/i;
  const company = usefulLines.find((line) =>
    line !== title &&
    !noisyLinePattern.test(line) &&
    !metadataLinePattern.test(line) &&
    !locationPattern.test(line)
  ) || "";
  const location = usefulLines.find((line) =>
    line !== company &&
    locationPattern.test(line)
  ) || "";

  const broadLocation = location || usefulLines.find((line) =>
    line !== company &&
    getLinkedInLocationPattern().test(line)
  ) || "";

  if (company || broadLocation) {
    return { company, location: broadLocation };
  }

  const compactText = normalizeDisplayText(text);
  const titleOffset = compactText.indexOf(title);
  const afterTitle = titleOffset >= 0
    ? compactText.slice(titleOffset + title.length).trim()
    : compactText;
  const compactLocationMatches = [...afterTitle.matchAll(
    /(?=([A-Z][A-Za-z .'-]+,\s*(?:New South Wales|Victoria|Queensland|Western Australia|South Australia|Tasmania|Australian Capital Territory|Northern Territory|NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Australia)\b[^·\n]*))/g
  )].map((match) => match[1]);
  const broadCompactLocationMatches = getLinkedInGeoLocationMatches(afterTitle);
  const compactLocation = [...broadCompactLocationMatches, ...compactLocationMatches]
    .sort((a, b) => a.length - b.length)[0] || "";
  const compactCompany = compactLocation
    ? normalizeDisplayText(afterTitle.slice(0, afterTitle.indexOf(compactLocation)))
    : "";

  return {
    company: cleanInferredCompany(compactCompany, title),
    location: compactLocation
  };
}

function cleanInferredCompany(value, title = "") {
  let company = normalizeDisplayText(value)
    .replace(/\u00c2\u00b7/g, "\u00b7")
    .replace(/^[\s\u00b7•|,-]+|[\s\u00b7•|,-]+$/g, "")
    .replace(/\b(?:Viewed|Promoted|Apply|Save|Saved)\b.*$/i, "")
    .trim();

  if (title) {
    company = company
      .replace(new RegExp(`^${escapeRegExp(normalizeDisplayText(title))}\\s*`, "i"), "")
      .trim();
  }

  return company
    .replace(/\s*(?:\u00b7|•|Â·)\s*$/g, "")
    .trim();
}

function getDisplayFields(record) {
  const meta = parseRecordMetaText(record);
  const inferred = inferCompanyAndLocationForDisplay(record);
  const title = normalizeDisplayText(record.display?.primary_text);

  return {
    meta,
    company: cleanInferredCompany(record.display?.secondary_text || inferred.company, title),
    location: meta.cleanLocation || inferred.location
  };
}

function getFitDisplayState(state, matchScore) {
  if (state !== "ignore") return state;
  return Number.isFinite(matchScore) && matchScore <= 10
    ? "ignore"
    : "low_match";
}

function getStateLabel(state, matchScore) {
  const labels = {
    apply: "Strong Match",
    review: "Review",
    low_match: "Low Match",
    ignore: "Ignore",
    applied: "Applied"
  };

  const displayState = getFitDisplayState(state, matchScore);
  return labels[displayState] || displayState || "";
}

function getEffectiveWorkflowState(record) {
  return record.memory?.user_workflow_override ||
    record.classification?.workflow_state ||
    "";
}

function sourceLabel(sourceId) {
  const labels = {
    linkedin_jobs: "LinkedIn Jobs",
    seek_jobs: "SEEK Jobs"
  };

  return labels[sourceId] || sourceId || "Unknown Source";
}

function sourceShortLabel(sourceId) {
  const labels = {
    linkedin_jobs: "LinkedIn",
    seek_jobs: "SEEK"
  };

  return labels[sourceId] || "Source";
}

async function renderReportSummary(records) {
  const lensPack = await getActiveLensPack();
  const counts = {
    apply: 0,
    review: 0,
    low_match: 0,
    ignore: 0,
    applied: 0
  };
  const feedbackCounts = {
    relevant: 0,
    not_relevant: 0,
    unsure: 0,
    unrated: 0
  };
  records.forEach((record) => {
    const state = getEffectiveWorkflowState(record);
    const displayState = getFitDisplayState(state, record.classification?.match_score);
    if (Object.prototype.hasOwnProperty.call(counts, displayState)) {
      counts[displayState] += 1;
    }
    feedbackCounts[getRelevanceFeedbackValue(record)] += 1;
  });

  document.getElementById("reportLensName").textContent =
    `Active Lens: ${lensPack.name}`;
  document.getElementById("reportRecordCount").textContent =
    `Records: ${records.length}`;
  document.getElementById("reportStateCounts").textContent =
    `Strong Match ${counts.apply} · Review ${counts.review} · Low Match ${counts.low_match} · Ignore ${counts.ignore} · Applied ${counts.applied}`;
  document.getElementById("reportFeedbackCounts").textContent =
    `Relevant ${feedbackCounts.relevant} \u00b7 Not relevant ${feedbackCounts.not_relevant} \u00b7 Unsure ${feedbackCounts.unsure} \u00b7 Unrated ${feedbackCounts.unrated}`;
}

function formatEffectiveWorkflowState(record) {
  const effective = getEffectiveWorkflowState(record);
  const score = record.classification?.match_score;
  return record.memory?.user_workflow_override
    ? `${getStateLabel(effective, score)} \u00b7 manual`
    : getStateLabel(effective, score);
}

function stateClass(state) {
  return `badge badge-state-${state || "unknown"}`;
}

function getSignalLabel(signal) {
  if (signal && typeof signal === "object" && signal.display_name) {
    return signal.display_name;
  }

  const signalId = typeof signal === "string" ? signal : signal?.id;
  const humanized = String(signalId || "Signal")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return humanized.replace(/\b\w/g, (character) => character.toUpperCase());
}

function getSignalChipText(signal, prefix) {
  const keyword = (signal.keywords || [])[0];
  const label = getSignalLabel(signal);
  return keyword ? `${prefix}${label}: ${keyword}` : `${prefix}${label}`;
}

function getSignalItems(record) {
  const signals = record.classification?.signals || {};
  const groups = [
    { items: signals.negative || [], type: "negative", prefix: "-" },
    { items: signals.blockers || [], type: "blocker", prefix: "!" },
    { items: signals.positive || [], type: "positive", prefix: "+" }
  ];

  return groups.flatMap((group) =>
    group.items.map((signal) => ({ ...group, signal }))
  );
}

function appendCompactSignals(container, record, limit = 2) {
  const items = getSignalItems(record);
  const fullText = formatAllSignals(record);

  if (items.length === 0) {
    return;
  }

  const list = document.createElement("div");
  list.className = "signal-list";
  list.title = fullText;

  items.slice(0, limit).forEach((item) => {
    const chip = document.createElement("span");
    chip.className = `signal-chip signal-${item.type}`;
    chip.textContent = getSignalChipText(item.signal, item.prefix);
    chip.title = [
      `${item.prefix}${getSignalLabel(item.signal)}: ${(item.signal.keywords || []).join(", ")}`,
      item.signal.reason || "",
      item.signal.penalty ? `Penalty: ${item.signal.penalty}` : "",
      item.signal.weight ? `Weight: ${item.signal.weight}` : ""
    ].filter(Boolean).join(" | ");
    list.appendChild(chip);
  });

  if (items.length > limit) {
    const more = document.createElement("span");
    more.className = "signal-chip";
    more.textContent = `+${items.length - limit}`;
    more.title = fullText;
    list.appendChild(more);
  }

  container.appendChild(list);
}

function addDecisionCell(row, record) {
  const fitCell = document.createElement("td");
  const percentageCell = document.createElement("td");
  const stack = document.createElement("div");
  const state = getEffectiveWorkflowState(record);
  const displayState = getFitDisplayState(state, record.classification?.match_score);
  const stateBadge = document.createElement("span");
  const percentage = document.createElement("span");
  const percentageText = formatMatchScore(record.classification?.match_score);
  const tooltip = [
    `Effective: ${formatEffectiveWorkflowState(record)}`,
    `Original: ${getStateLabel(
      record.classification?.workflow_state,
      record.classification?.match_score
    )}`,
    percentageText ? `Match: ${percentageText}` : "",
    record.capture?.adapter_warning ? "Limited adapter metadata" : ""
  ].filter(Boolean).join(" | ");

  fitCell.className = "col-fit fit-label-cell";
  percentageCell.className = "col-percentage fit-percentage-cell";
  stack.className = "decision-stack";
  percentage.className = `fit-percentage fit-percentage-${displayState}`;
  percentage.textContent = percentageText;
  stateBadge.className = `${stateClass(displayState)} fit-label`;
  stateBadge.textContent = getStateLabel(
    state,
    record.classification?.match_score
  ).toUpperCase();
  fitCell.title = tooltip;
  percentageCell.title = tooltip;

  stack.appendChild(stateBadge);

  if (record.memory?.user_workflow_override) {
    const manual = document.createElement("span");
    manual.className = "manual";
    manual.textContent = "manual";
    stack.appendChild(manual);
  }

  const relevanceValue = getRelevanceFeedbackValue(record);
  if (relevanceValue !== "unrated") {
    const relevance = document.createElement("span");
    relevance.className = `relevance-badge relevance-badge-${relevanceValue}`;
    relevance.textContent = getRelevanceFeedbackLabel(relevanceValue);
    stack.appendChild(relevance);
  }

  fitCell.appendChild(stack);
  percentageCell.appendChild(percentage);
  row.appendChild(fitCell);
  row.appendChild(percentageCell);
}

function addJobSummaryCell(row, record, display) {
  const cell = document.createElement("td");
  const title = record.display?.primary_text || "Untitled job";
  const url = getRecordOpenUrl(record);
  const titleElement = document.createElement(url ? "a" : "span");
  const meta = document.createElement("div");
  const company = document.createElement("span");
  const source = document.createElement("span");
  const note = normalizeDisplayText(record.memory?.notes);
  const sourceId = record.source?.id || "";

  cell.title = note
    ? `${title}\n${display.company || "Unknown company"}\nNote: ${note}`
    : `${title}\n${display.company || "Unknown company"}`;
  titleElement.className = "job-title";
  titleElement.textContent = title;

  if (url) {
    titleElement.href = url;
    titleElement.target = "_blank";
    titleElement.rel = "noopener noreferrer";
  }

  meta.className = "job-meta";
  company.className = "job-company";
  company.textContent = display.company || "Company unavailable";
  company.title = display.company || "Company unavailable";
  source.className = `source-badge source-${sourceId.replace("_jobs", "")}`;
  source.textContent = sourceShortLabel(sourceId);
  source.title = sourceLabel(sourceId);

  meta.appendChild(company);
  meta.appendChild(source);

  if (note) {
    const noteIndicator = document.createElement("span");
    noteIndicator.className = "note-indicator";
    noteIndicator.textContent = "Note";
    noteIndicator.title = note;
    meta.appendChild(noteIndicator);
  }

  cell.appendChild(titleElement);
  cell.appendChild(meta);
  row.appendChild(cell);
}

function addActivityCell(row, meta) {
  const cell = document.createElement("td");
  const primary = document.createElement("div");
  const secondary = document.createElement("div");

  primary.className = "activity-primary";
  primary.textContent = meta.postedAge || "";
  secondary.className = "activity-secondary";
  secondary.textContent = meta.interestText || "";
  cell.title = meta.fullText || [meta.postedAge, meta.interestText].filter(Boolean).join(" | ");
  cell.appendChild(primary);
  cell.appendChild(secondary);
  row.appendChild(cell);
}

function getDisplayReason(record) {
  const signals = record.classification?.signals || {};
  const positive = signals.positive || [];
  const negative = signals.negative || [];
  const blockers = signals.blockers || [];
  const originalReason = record.classification?.reason || "";

  if (blockers.length > 0) {
    return `Blocked: ${blockers[0].reason || getSignalLabel(blockers[0])}`;
  }

  const declaredOutcome = [...negative]
    .sort((left, right) => (right.reason_priority || 0) - (left.reason_priority || 0))
    .find((signal) => signal.outcome_reason)?.outcome_reason;

  if (declaredOutcome) {
    return declaredOutcome;
  }

  if (record.classification?.workflow_state === "applied") {
    return originalReason || "Already applied";
  }

  const adjacentSignal = positive.find((signal) => signal.role_fit_kind === "adjacent");

  if (adjacentSignal) {
    return originalReason || adjacentSignal.reason || getSignalLabel(adjacentSignal);
  }

  return originalReason || "No matching explanation available";
}

function addWhyCell(row, record) {
  const cell = document.createElement("td");
  const reason = document.createElement("div");
  const reasonText = getDisplayReason(record);

  reason.className = "why-reason";
  reason.textContent = reasonText;
  cell.title = [reasonText, formatAllSignals(record)].filter(Boolean).join(" | ");
  cell.appendChild(reason);
  appendCompactSignals(cell, record, 2);
  row.appendChild(cell);
}

function setDrawerNotice(message, type = "success") {
  const notice = document.getElementById("drawerNotice");
  notice.textContent = message || "";
  notice.classList.toggle("error", type === "error");
}

function renderEvidenceList(containerId, signals, kind) {
  const container = document.getElementById(containerId);
  container.textContent = "";

  if (!Array.isArray(signals) || signals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "evidence-empty";
    empty.textContent = kind === "positive"
      ? "No positive evidence matched."
      : kind === "blocker"
        ? "No blockers matched."
        : "No concerns matched.";
    container.appendChild(empty);
    return;
  }

  signals.forEach((signal) => {
    const item = document.createElement("div");
    const title = document.createElement("strong");
    const keywords = document.createElement("span");
    const reason = document.createElement("span");
    const behavior = document.createElement("span");
    const behaviorParts = [];

    item.className = "evidence-item";
    title.textContent = getSignalLabel(signal);
    keywords.textContent = signal.keywords?.length
      ? `Matched: ${signal.keywords.join(", ")}`
      : "Matched without a recorded phrase.";
    reason.textContent = signal.outcome_reason || signal.reason || "No additional explanation.";

    if (signal.group) behaviorParts.push(`Group: ${signal.group}`);
    if (signal.match_scope) behaviorParts.push(`Scope: ${signal.match_scope}`);
    if (signal.blocker || kind === "blocker") behaviorParts.push("Effect: blocker");
    else if (Number.isFinite(signal.penalty) && signal.penalty > 0) {
      behaviorParts.push(`Penalty: ${signal.penalty}`);
    } else if (Number.isFinite(signal.weight) && signal.weight > 0) {
      behaviorParts.push(`Weight: ${signal.weight}`);
    }
    if (Number.isFinite(signal.score_cap)) behaviorParts.push(`Score cap: ${signal.score_cap}`);
    behavior.textContent = behaviorParts.join(" · ");

    item.appendChild(title);
    item.appendChild(keywords);
    item.appendChild(reason);
    if (behavior.textContent) item.appendChild(behavior);
    container.appendChild(item);
  });
}

function appendCaptureQualityItem(container, label, value) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");

  term.textContent = label;
  description.textContent = value || "Not available";
  row.appendChild(term);
  row.appendChild(description);
  container.appendChild(row);
}

function renderCaptureQuality(record) {
  const container = document.getElementById("drawerCaptureQuality");
  const description = record.content?.full_text || record.content?.summary || "";
  const captureQuality = record.capture?.adapter_warning
    ? "Limited capture — review missing fields"
    : description.length >= 50
      ? "Full description captured"
      : "Basic job fields captured";

  container.textContent = "";
  appendCaptureQualityItem(container, "Status", captureQuality);
  appendCaptureQualityItem(container, "Source", sourceLabel(record.source?.id));
  appendCaptureQualityItem(container, "Source job ID", String(record.source?.source_item_id || ""));
  appendCaptureQualityItem(container, "Extraction mode", record.metadata?.extraction_mode);
  appendCaptureQualityItem(container, "Capture method", record.capture?.method);
  appendCaptureQualityItem(
    container,
    "Adapter profile",
    [record.metadata?.adapter_profile_id, record.metadata?.adapter_profile_version]
      .filter(Boolean)
      .join(" · ")
  );
  appendCaptureQualityItem(container, "Description size", `${description.length.toLocaleString()} characters`);
  appendCaptureQualityItem(container, "First seen", formatFullDateTime(record.memory?.first_seen_at));
  appendCaptureQualityItem(container, "Last seen", formatFullDateTime(record.memory?.last_seen_at));
  appendCaptureQualityItem(container, "Times seen", String(record.memory?.seen_count || 1));
  appendCaptureQualityItem(container, "Job URL", getRecordOpenUrl(record));
}

function renderFeedbackHistory(record) {
  const container = document.getElementById("feedbackHistory");
  const storedEvents = Array.isArray(record.memory?.feedback_events)
    ? record.memory.feedback_events
    : [];
  const events = [...storedEvents].reverse().slice(0, 20);
  container.textContent = "";

  if (events.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No relevance feedback recorded yet.";
    container.appendChild(item);
    return;
  }

  events.forEach((event) => {
    const item = document.createElement("li");
    const action = event.type === "relevance_feedback_cleared"
      ? "Feedback cleared"
      : getRelevanceFeedbackLabel(event.value);
    const reason = event.reason ? ` — ${getRelevanceReasonLabel(event.reason)}` : "";
    const detail = event.detail ? ` — ${event.detail}` : "";
    const score = Number.isFinite(event.context?.local_match_score)
      ? ` — ${event.context.local_match_score}% match`
      : "";

    item.textContent = `${formatFullDateTime(event.created_at) || "Unknown time"}: ${action}${reason}${detail}${score}`;
    container.appendChild(item);
  });
}

function setFeedbackSelection(value, preserveFields = false) {
  selectedFeedbackValue = ["relevant", "not_relevant", "unsure"].includes(value)
    ? value
    : "unrated";
  document.querySelectorAll("[data-feedback-value]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.feedbackValue === selectedFeedbackValue)
    );
  });
  document.getElementById("feedbackReasonGroup").hidden =
    selectedFeedbackValue !== "not_relevant";

  if (selectedFeedbackValue !== "not_relevant" && !preserveFields) {
    document.getElementById("feedbackReason").value = "";
    document.getElementById("feedbackDetail").value = "";
  }
}

function renderDrawerWorkflow(record) {
  const override = record.memory?.user_workflow_override || "";
  document.querySelectorAll("[data-drawer-workflow]").forEach((button) => {
    const isActive = button.dataset.drawerWorkflow === override;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderRecordDrawer(record) {
  const display = getDisplayFields(record);
  const effectiveState = getEffectiveWorkflowState(record);
  const displayState = getFitDisplayState(
    effectiveState,
    record.classification?.match_score
  );
  const currentFeedback = record.memory?.relevance_feedback;
  const feedbackValue = getRelevanceFeedbackValue(record);
  const signals = record.classification?.signals || {};
  const description = record.content?.full_text ||
    record.content?.summary ||
    "The full job description was not available in this capture.";
  const openUrl = getRecordOpenUrl(record);
  const openLink = document.getElementById("drawerOpenJob");
  const state = document.getElementById("drawerState");
  const percentage = document.getElementById("drawerPercentage");
  const manual = document.getElementById("drawerManual");

  document.getElementById("drawerTitle").textContent =
    record.display?.primary_text || "Untitled job";
  document.getElementById("drawerCompany").textContent = [
    display.company,
    display.location,
    sourceLabel(record.source?.id)
  ].filter(Boolean).join(" · ");

  if (openUrl) {
    openLink.href = openUrl;
    openLink.hidden = false;
  } else {
    openLink.removeAttribute("href");
    openLink.hidden = true;
  }

  state.className = `${stateClass(displayState)} fit-label`;
  state.textContent = getStateLabel(
    effectiveState,
    record.classification?.match_score
  ).toUpperCase();
  percentage.className = `fit-percentage fit-percentage-${displayState}`;
  percentage.textContent = formatMatchScore(record.classification?.match_score);
  manual.hidden = !record.memory?.user_workflow_override;
  document.getElementById("drawerReason").textContent = getDisplayReason(record);
  document.getElementById("drawerDescription").textContent = description;
  document.getElementById("drawerNotes").value = record.memory?.notes || "";

  renderDrawerWorkflow(record);
  renderEvidenceList("drawerPositiveSignals", signals.positive, "positive");
  renderEvidenceList("drawerNegativeSignals", signals.negative, "negative");
  renderEvidenceList("drawerBlockers", signals.blockers, "blocker");
  renderCaptureQuality(record);
  renderFeedbackHistory(record);
  setFeedbackSelection(feedbackValue, true);
  document.getElementById("feedbackReason").value =
    feedbackValue === "not_relevant" ? currentFeedback?.reason || "" : "";
  document.getElementById("feedbackDetail").value =
    feedbackValue === "not_relevant" ? currentFeedback?.detail || "" : "";
  document.getElementById("clearFeedback").disabled = feedbackValue === "unrated";
  setDrawerNotice("");
}

function openRecordDrawer(recordId) {
  const record = recordsMap[recordId];
  if (!record) return;

  drawerPreviousFocus = document.activeElement;
  activeDrawerRecordId = recordId;
  renderRecordDrawer(record);
  document.getElementById("drawerBackdrop").hidden = false;
  document.getElementById("recordDrawer").hidden = false;
  document.body.classList.add("drawer-open");
  document.getElementById("drawerClose").focus();
}

function closeRecordDrawer() {
  document.getElementById("drawerBackdrop").hidden = true;
  document.getElementById("recordDrawer").hidden = true;
  document.body.classList.remove("drawer-open");
  activeDrawerRecordId = null;

  if (drawerPreviousFocus?.isConnected) drawerPreviousFocus.focus();
  drawerPreviousFocus = null;
}

function createFeedbackEventId() {
  if (globalThis.crypto?.randomUUID) return `feedback-${globalThis.crypto.randomUUID()}`;
  return `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function saveDrawerFeedback() {
  const record = recordsMap[activeDrawerRecordId];
  if (!record) return;

  try {
    if (selectedFeedbackValue === "unrated") {
      throw new Error("Choose Relevant, Not relevant, or Unsure first.");
    }

    const input = {
      value: selectedFeedbackValue,
      reason: document.getElementById("feedbackReason").value,
      detail: document.getElementById("feedbackDetail").value
    };
    const previous = record.memory?.relevance_feedback;
    const normalizedReason = input.value === "not_relevant" ? input.reason : null;
    const normalizedDetail = input.value === "not_relevant" ? input.detail.trim() : "";

    if (
      previous?.value === input.value &&
      previous?.reason === normalizedReason &&
      (previous?.detail || "") === normalizedDetail
    ) {
      setDrawerNotice("No feedback changes to save.");
      return;
    }

    recordsMap[record.record_id] = applyRelevanceFeedback(
      record,
      input,
      new Date().toISOString(),
      createFeedbackEventId()
    );
    await saveRecords();
    await render();
    setDrawerNotice("Relevance feedback saved. Your Lens and match percentage were not changed.");
  } catch (error) {
    setDrawerNotice(error?.message || "Feedback could not be saved.", "error");
  }
}

async function clearDrawerFeedback() {
  const record = recordsMap[activeDrawerRecordId];
  if (!record || getRelevanceFeedbackValue(record) === "unrated") return;

  recordsMap[record.record_id] = clearRelevanceFeedback(
    record,
    new Date().toISOString(),
    createFeedbackEventId()
  );
  await saveRecords();
  await render();
  setDrawerNotice("Relevance feedback cleared. The history was retained.");
}

async function saveDrawerNotes() {
  const record = recordsMap[activeDrawerRecordId];
  if (!record) return;

  record.memory = {
    ...record.memory,
    notes: document.getElementById("drawerNotes").value.trim().slice(0, 4000)
  };
  await saveRecords();
  await render();
  setDrawerNotice("Notes saved.");
}

function trapDrawerKeyboard(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeRecordDrawer();
    return;
  }
  if (event.key !== "Tab") return;

  const drawer = document.getElementById("recordDrawer");
  const focusable = [...drawer.querySelectorAll(
    'a[href], button:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hidden);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
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

function escapeCsv(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function toCsv(records) {
  const header = [
    "effective_workflow_state",
    "original_workflow_state",
    "manual_override",
    "feedback_value",
    "feedback_reason",
    "feedback_detail",
    "feedback_updated_at",
    "feedback_event_count",
    "match_score",
    "title",
    "company",
    "location",
    "reason",
    "positive_signals",
    "negative_signals",
    "blockers",
    "notes",
    "seen_count",
    "last_seen_at",
    "url",
    "source_id",
    "source_label",
    "adapter_profile_id",
    "adapter_profile_version"
  ];

  const lines = records.map((record) => [
    getEffectiveWorkflowState(record),
    record.classification?.workflow_state,
    record.memory?.user_workflow_override || "",
    getRelevanceFeedbackValue(record),
    record.memory?.relevance_feedback?.reason || "",
    record.memory?.relevance_feedback?.detail || "",
    record.memory?.relevance_feedback?.updated_at || "",
    record.memory?.feedback_events?.length || 0,
    record.classification?.match_score,
    record.display?.primary_text,
    record.display?.secondary_text,
    getExportLocation(record),
    record.classification?.reason,
    formatSignals(record.classification?.signals?.positive),
    formatSignals(record.classification?.signals?.negative),
    formatSignals(record.classification?.signals?.blockers),
    record.memory?.notes,
    record.memory?.seen_count,
    record.memory?.last_seen_at,
    getRecordOpenUrl(record),
    record.source?.id,
    sourceLabel(record.source?.id),
    record.metadata?.adapter_profile_id,
    record.metadata?.adapter_profile_version
  ].map(escapeCsv).join(","));

  return [header.join(","), ...lines].join("\n");
}

function getSortedRecords(records) {
  const sortMode = document.getElementById("sortMode").value;
  const sorted = [...records];

  if (sortMode === "newest_first") {
    return sorted.sort((a, b) =>
      (b.memory?.first_seen_at || "").localeCompare(a.memory?.first_seen_at || "")
    );
  }

  if (sortMode === "last_seen") {
    return sorted.sort((a, b) =>
      (b.memory?.last_seen_at || "").localeCompare(a.memory?.last_seen_at || "")
    );
  }

  if (sortMode === "company") {
    return sorted.sort((a, b) =>
      getDisplayFields(a).company.localeCompare(getDisplayFields(b).company)
    );
  }

  return sorted.sort((a, b) =>
    (b.classification?.match_score || 0) - (a.classification?.match_score || 0)
  );
}

function populateSourceFilter(records) {
  const sourceFilter = document.getElementById("filterSource");
  const currentValue = sourceFilter.value || "all";
  const sourceIds = [...new Set(records.map((record) => record.source?.id).filter(Boolean))]
    .sort((a, b) => sourceLabel(a).localeCompare(sourceLabel(b)));

  sourceFilter.textContent = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All Sources";
  sourceFilter.appendChild(allOption);

  sourceIds.forEach((sourceId) => {
    const option = document.createElement("option");
    option.value = sourceId;
    option.textContent = sourceLabel(sourceId);
    sourceFilter.appendChild(option);
  });

  sourceFilter.value = sourceIds.includes(currentValue) ? currentValue : "all";
}

function recordMatchesSearch(record, query) {
  if (!query) {
    return true;
  }

  const display = getDisplayFields(record);
  const searchableText = [
    record.display?.primary_text,
    display.company,
    display.location,
    sourceLabel(record.source?.id),
    record.classification?.reason,
    record.memory?.notes,
    getRelevanceFeedbackLabel(getRelevanceFeedbackValue(record)),
    getRelevanceReasonLabel(record.memory?.relevance_feedback?.reason),
    record.memory?.relevance_feedback?.detail
  ].join(" ").toLowerCase();

  return searchableText.includes(query);
}

function getVisibleRecords(records) {
  const filterState = document.getElementById("filterState").value;
  const filterRelevance = document.getElementById("filterRelevance").value;
  const filterSource = document.getElementById("filterSource").value;
  const searchQuery = normalizeDisplayText(document.getElementById("searchText").value).toLowerCase();
  const filtered = records.filter((record) => {
    const displayState = getFitDisplayState(
      getEffectiveWorkflowState(record),
      record.classification?.match_score
    );
    const stateMatches = filterState === "all" || displayState === filterState;
    const sourceMatches = filterSource === "all" ||
      record.source?.id === filterSource;
    const relevanceMatches = filterRelevance === "all" ||
      getRelevanceFeedbackValue(record) === filterRelevance;

    return stateMatches &&
      sourceMatches &&
      relevanceMatches &&
      recordMatchesSearch(record, searchQuery);
  });

  return getSortedRecords(filtered);
}

function setOverride(recordId, value) {
  const record = recordsMap[recordId];
  if (!record) return;

  record.memory = {
    ...record.memory,
    user_workflow_override: value,
    last_seen_at: record.memory?.last_seen_at || new Date().toISOString()
  };
}

function getSelectedRecords() {
  return [...selectedRecordIds]
    .map((recordId) => recordsMap[recordId])
    .filter(Boolean);
}

function updateBulkControls() {
  const selectedCount = getSelectedRecords().length;
  const selectionBar = document.getElementById("selectionBar");
  const bulkButtons = [
    "bulkOpen",
    "bulkApplied",
    "bulkRelevant",
    "bulkReview",
    "bulkIgnore",
    "bulkNote",
    "bulkReset",
    "bulkDelete"
  ];

  document.getElementById("selectedCount").textContent = `${selectedCount} selected`;
  selectionBar.hidden = selectedCount === 0;
  bulkButtons.forEach((id) => {
    document.getElementById(id).disabled = selectedCount === 0;
  });
}

function updateSelectAllState() {
  const selectAll = document.getElementById("selectAll");
  const visibleSelectedCount = visibleRecordIds
    .filter((recordId) => selectedRecordIds.has(recordId))
    .length;

  selectAll.checked = visibleRecordIds.length > 0 &&
    visibleSelectedCount === visibleRecordIds.length;
  selectAll.indeterminate = visibleSelectedCount > 0 &&
    visibleSelectedCount < visibleRecordIds.length;
  updateBulkControls();
}

function addSelectCell(row, record) {
  const cell = document.createElement("td");
  const checkbox = document.createElement("input");
  const recordId = record.record_id;

  cell.className = "col-select";
  checkbox.type = "checkbox";
  checkbox.checked = selectedRecordIds.has(recordId);
  checkbox.setAttribute("aria-label", `Select ${record.display?.primary_text || "record"}`);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      selectedRecordIds.add(recordId);
      row.classList.add("selected");
    } else {
      selectedRecordIds.delete(recordId);
      row.classList.remove("selected");
    }

    updateSelectAllState();
  });

  cell.appendChild(checkbox);
  row.appendChild(cell);
  return checkbox;
}

async function render() {
  const generation = ++renderGeneration;
  const records = await loadRecords();
  const tbody = document.getElementById("rows");

  if (generation !== renderGeneration) return;

  if (activeDrawerRecordId && !recordsMap[activeDrawerRecordId]) {
    closeRecordDrawer();
  }

  populateSourceFilter(records);
  const visibleRecords = getVisibleRecords(records);
  await renderReportSummary(records);

  if (generation !== renderGeneration) return;

  tbody.textContent = "";
  visibleRecordIds = visibleRecords.map((record) => record.record_id);

  if (visibleRecords.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.className = "empty-state";
    cell.colSpan = 9;
    cell.textContent = "No jobs match the current filters.";
    row.appendChild(cell);
    tbody.appendChild(row);
    updateSelectAllState();
    return;
  }

  for (const record of visibleRecords) {
    const row = document.createElement("tr");
    const display = getDisplayFields(record);

    if (selectedRecordIds.has(record.record_id)) {
      row.classList.add("selected");
    }

    addSelectCell(row, record);
    addDecisionCell(row, record);
    addJobSummaryCell(row, record, display);
    addCell(row, display.location, "clamp").title = display.meta.fullText || display.location;
    addActivityCell(row, display.meta);
    addWhyCell(row, record);
    addCell(row, record.memory?.seen_count, "col-seen");
    addCell(row, formatDateTime(record.memory?.last_seen_at), "col-date").title =
      formatFullDateTime(record.memory?.last_seen_at);

    row.addEventListener("click", (event) => {
      if (event.target.closest("a, button, input, select, textarea")) {
        return;
      }

      openRecordDrawer(record.record_id);
    });
    row.tabIndex = 0;
    row.setAttribute("aria-label", `View details for ${record.display?.primary_text || "job"}`);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openRecordDrawer(record.record_id);
      }
    });

    tbody.appendChild(row);
  }

  updateSelectAllState();
  if (activeDrawerRecordId && recordsMap[activeDrawerRecordId]) {
    renderRecordDrawer(recordsMap[activeDrawerRecordId]);
  } else if (activeDrawerRecordId) {
    closeRecordDrawer();
  }
}

function getSafeHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch (_error) {
    return "";
  }
}

function getRecordOpenUrl(record) {
  const sourceUrl = record.source?.url || "";
  const sourceId = record.source?.id || "";
  const sourceItemId = record.source?.source_item_id || "";

  if (sourceId === "linkedin_jobs" && /^\d+$/.test(String(sourceItemId))) {
    return `https://www.linkedin.com/jobs/view/${encodeURIComponent(sourceItemId)}/`;
  }

  if (sourceId === "seek_jobs" && sourceItemId) {
    try {
      const parsed = new URL(sourceUrl);
      const hasJobRoute = /^\/job\/\d+/.test(parsed.pathname);
      const hasJobId = Boolean(parsed.searchParams.get("jobId"));

      if (!hasJobRoute && !hasJobId) {
        return getSafeHttpUrl(`${parsed.origin}/job/${encodeURIComponent(sourceItemId)}`);
      }
    } catch (_error) {
      return `https://au.seek.com/job/${encodeURIComponent(sourceItemId)}`;
    }
  }

  return getSafeHttpUrl(sourceUrl);
}

async function openSelected() {
  getSelectedRecords().forEach((record) => {
    const url = getRecordOpenUrl(record);

    if (url) {
      chrome.tabs.create({ url });
    }
  });
}

async function applyOverrideToSelected(value) {
  getSelectedRecords().forEach((record) => {
    setOverride(record.record_id, value);
  });
  await saveRecords();
  await render();
}

async function noteSelected() {
  const selectedRecords = getSelectedRecords();
  const nextNote = prompt("Add/edit note for selected records", selectedRecords[0]?.memory?.notes || "");

  if (nextNote === null) {
    return;
  }

  selectedRecords.forEach((record) => {
    record.memory = {
      ...record.memory,
      notes: nextNote
    };
  });
  await saveRecords();
  await render();
}

async function deleteSelected() {
  const selectedRecords = getSelectedRecords();

  if (!confirm(`Delete ${selectedRecords.length} selected record(s)?`)) {
    return;
  }

  selectedRecords.forEach((record) => {
    delete recordsMap[record.record_id];
    selectedRecordIds.delete(record.record_id);
    if (activeDrawerRecordId === record.record_id) closeRecordDrawer();
  });
  await saveRecords();
  await render();
}

document.getElementById("filterState").addEventListener("change", render);
document.getElementById("filterRelevance").addEventListener("change", render);
document.getElementById("filterSource").addEventListener("change", render);
document.getElementById("searchText").addEventListener("input", render);
document.getElementById("sortMode").addEventListener("change", render);
document.getElementById("refresh").addEventListener("click", render);
document.getElementById("bulkOpen").addEventListener("click", openSelected);
document.getElementById("bulkApplied").addEventListener("click", () => applyOverrideToSelected("applied"));
document.getElementById("bulkRelevant").addEventListener("click", () => applyOverrideToSelected("apply"));
document.getElementById("bulkReview").addEventListener("click", () => applyOverrideToSelected("review"));
document.getElementById("bulkIgnore").addEventListener("click", () => applyOverrideToSelected("ignore"));
document.getElementById("bulkNote").addEventListener("click", noteSelected);
document.getElementById("bulkReset").addEventListener("click", () => applyOverrideToSelected(null));
document.getElementById("bulkDelete").addEventListener("click", deleteSelected);
document.getElementById("drawerClose").addEventListener("click", closeRecordDrawer);
document.getElementById("drawerBackdrop").addEventListener("click", closeRecordDrawer);
document.getElementById("recordDrawer").addEventListener("keydown", trapDrawerKeyboard);
document.getElementById("relevanceFeedback").addEventListener("click", (event) => {
  const button = event.target.closest("[data-feedback-value]");
  if (!button) return;
  setFeedbackSelection(button.dataset.feedbackValue);
  setDrawerNotice("");
});
document.getElementById("saveFeedback").addEventListener("click", saveDrawerFeedback);
document.getElementById("clearFeedback").addEventListener("click", clearDrawerFeedback);
document.getElementById("drawerSaveNotes").addEventListener("click", saveDrawerNotes);
document.getElementById("drawerWorkflow").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-drawer-workflow]");
  if (!button || !activeDrawerRecordId) return;

  setOverride(activeDrawerRecordId, button.dataset.drawerWorkflow || null);
  await saveRecords();
  await render();
  setDrawerNotice(
    button.dataset.drawerWorkflow
      ? `Fit decision set to ${getStateLabel(
        button.dataset.drawerWorkflow,
        recordsMap[activeDrawerRecordId]?.classification?.match_score
      )}. Relevance feedback was not changed.`
      : "Manual fit decision cleared. Relevance feedback was not changed."
  );
});
document.getElementById("selectAll").addEventListener("change", (event) => {
  if (event.target.checked) {
    visibleRecordIds.forEach((recordId) => selectedRecordIds.add(recordId));
  } else {
    visibleRecordIds.forEach((recordId) => selectedRecordIds.delete(recordId));
  }

  render();
});

document.getElementById("clearAll").addEventListener("click", async () => {
  if (!confirm("Permanently clear all saved jobs?")) {
    return;
  }

  recordsMap = {};
  selectedRecordIds.clear();
  closeRecordDrawer();
  await saveRecords();
  await render();
});

document.getElementById("exportJson").addEventListener("click", async () => {
  const records = await loadRecords();
  download(
    "ark-lens-report.json",
    JSON.stringify(records, null, 2),
    "application/json"
  );
});

document.getElementById("exportCsv").addEventListener("click", async () => {
  const records = await loadRecords();
  download("ark-lens-report.csv", toCsv(records), "text/csv");
});

render();
