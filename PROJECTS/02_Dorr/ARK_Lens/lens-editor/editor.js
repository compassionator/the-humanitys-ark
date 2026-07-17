const LENS_PACKS_KEY = "ark_lens_packs";
const ACTIVE_LENS_PACK_ID_KEY = "ark_lens_active_lens_pack_id";
const LENS_PACK_RUNTIME = globalThis.ARK_LENS_PACK_RUNTIME;
const BUNDLED_LENS_PACK = globalThis.ARK_BUNDLED_LENS_PACK;

if (!LENS_PACK_RUNTIME || !BUNDLED_LENS_PACK) {
  throw new Error("ARK Lens Pack runtime was not loaded before the editor.");
}

const SOURCE_ADAPTERS = [
  { id: "linkedin_jobs", display_name: "LinkedIn Jobs" },
  { id: "seek_jobs", display_name: "SEEK Jobs" }
];

const SECTION_DEFINITIONS = [
  {
    id: "target_roles",
    title: "Roles I want",
    description: "Job titles that should count as a direct role match."
  },
  {
    id: "related_roles",
    title: "Related roles worth showing",
    description: "Adjacent job titles you still want to review."
  },
  {
    id: "role_evidence",
    title: "Evidence of desired scope",
    description: "Responsibilities or scope that make a role more relevant."
  },
  {
    id: "strong_preferences",
    title: "Strong preferences",
    description: "Domains, technologies, or experience that raise Rule Fit."
  },
  {
    id: "job_preferences",
    title: "Job preferences",
    description: "Preferred location, seniority, work arrangement, and employment type."
  },
  {
    id: "deal_breakers",
    title: "Deal-breakers",
    description: "Requirements that should make a job a Low Match."
  },
  {
    id: "prefer_to_avoid",
    title: "Things I prefer to avoid",
    description: "Terms that should lower Rule Fit without always excluding the job."
  }
];

let editorState = {
  packs: {},
  activeId: "",
  activePack: null
};
let noticeTimer = null;

function slugifyLensId(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "lens";
}

function makeUniqueLensId(name, packs) {
  const base = slugifyLensId(name);

  if (!Object.prototype.hasOwnProperty.call(packs || {}, base)) {
    return base;
  }

  let suffix = 2;
  while (Object.prototype.hasOwnProperty.call(packs || {}, `${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

function textToKeywords(value) {
  const seen = new Set();

  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((keyword) => {
      const normalized = keyword.toLowerCase();

      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);
      return true;
    });
}

function getBasicEditorSection(signal) {
  if (typeof signal?.editor_section === "string" && signal.editor_section.trim()) {
    return signal.editor_section.trim();
  }
  if (signal?.blocker === true) return "deal_breakers";
  if (typeof signal?.penalty === "number" && signal.penalty > 0) return "prefer_to_avoid";
  if (signal?.role_fit_kind === "target") return "target_roles";
  if (signal?.role_fit_kind === "adjacent") return "related_roles";
  if (signal?.qualifies_role_fit === true) return "role_evidence";
  if (typeof signal?.weight === "number" && signal.weight > 0) return "strong_preferences";
  return "strong_preferences";
}

function createLensFromTemplate(template, name, packs) {
  const created = JSON.parse(JSON.stringify(template));
  const id = makeUniqueLensId(name, packs);

  created.id = id;
  created.lens_pack_id = id;
  created.name = String(name || "").trim();
  created.version = "v1.0.0";
  created.lens_pack_version = "v1.0.0";

  return created;
}

function normalizeLensPack(lensPack) {
  return LENS_PACK_RUNTIME.migrateLensPack(lensPack, BUNDLED_LENS_PACK);
}

async function loadEditorStorage() {
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

  editorState = {
    packs: migrated.packs,
    activeId: migrated.activeId,
    activePack: normalizeLensPack(migrated.packs[migrated.activeId])
  };
}

async function persistPacks(packs, activeId) {
  await chrome.storage.local.set({
    [LENS_PACKS_KEY]: packs,
    [ACTIVE_LENS_PACK_ID_KEY]: activeId
  });
  editorState = {
    packs,
    activeId,
    activePack: normalizeLensPack(packs[activeId])
  };
}

function setNotice(message, type = "success", duration = 5000) {
  const notice = document.getElementById("editorNotice");

  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.classList.toggle("error", type === "error");
  notice.hidden = false;

  if (duration > 0) {
    noticeTimer = setTimeout(() => {
      notice.hidden = true;
    }, duration);
  }
}

function download(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function signalEffectText(signal) {
  if (signal.blocker) return "Effect: deal-breaker";
  if (typeof signal.penalty === "number" && signal.penalty > 0) return "Effect: lowers Rule Fit";
  if (signal.role_fit_kind === "target") return "Effect: direct role match";
  if (signal.role_fit_kind === "adjacent") return "Effect: related role match";
  if (signal.qualifies_role_fit) return "Effect: evidence of role fit";
  return "Effect: raises Rule Fit";
}

function keywordCountForSection(entries) {
  return entries.reduce((total, entry) => total + (entry.signal.keywords?.length || 0), 0);
}

function getSectionEntries(lensPack) {
  const entries = Object.entries(lensPack.signal_groups || {}).flatMap(([groupId, signals]) =>
    (Array.isArray(signals) ? signals : []).map((signal, signalIndex) => ({
      groupId,
      signalIndex,
      signal
    }))
  );

  return entries.reduce((sections, entry) => {
    const sectionId = getBasicEditorSection(entry.signal);
    sections[sectionId] = sections[sectionId] || [];
    sections[sectionId].push(entry);
    return sections;
  }, {});
}

function renderLensManager() {
  const select = document.getElementById("lensSelect");
  select.textContent = "";

  Object.values(editorState.packs)
    .map(normalizeLensPack)
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((lensPack) => {
      const option = document.createElement("option");
      option.value = lensPack.id;
      option.textContent = lensPack.name;
      select.appendChild(option);
    });

  select.value = editorState.activeId;
  document.getElementById("lensName").value = editorState.activePack.name;
  document.getElementById("deleteLens").disabled = Object.keys(editorState.packs).length < 2;
}

function renderSources() {
  const container = document.getElementById("sourceOptions");
  const supported = new Set(editorState.activePack.supported_source_adapters || []);
  container.textContent = "";

  SOURCE_ADAPTERS.forEach((adapter) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const text = document.createElement("span");

    label.className = "source-option";
    input.type = "checkbox";
    input.value = adapter.id;
    input.dataset.sourceAdapterId = adapter.id;
    input.checked = supported.has(adapter.id);
    text.textContent = adapter.display_name;

    label.appendChild(input);
    label.appendChild(text);
    container.appendChild(label);
  });
}

function renderBasicSections() {
  const container = document.getElementById("basicSections");
  const sectionEntries = getSectionEntries(editorState.activePack);
  const knownSectionIds = new Set(SECTION_DEFINITIONS.map((definition) => definition.id));
  const customDefinitions = Object.keys(sectionEntries)
    .filter((sectionId) => !knownSectionIds.has(sectionId))
    .map((sectionId) => ({
      id: sectionId,
      title: LENS_PACK_RUNTIME.humanizeId(sectionId),
      description: "Additional preferences declared by this Lens Pack."
    }));
  const definitions = [...SECTION_DEFINITIONS, ...customDefinitions];
  let renderedSectionCount = 0;
  container.textContent = "";

  definitions.forEach((definition) => {
    const entries = sectionEntries[definition.id] || [];
    if (entries.length === 0) return;

    const details = document.createElement("details");
    const summary = document.createElement("summary");
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    const description = document.createElement("span");
    const count = document.createElement("span");
    const body = document.createElement("div");

    details.className = "basic-section";
    details.open = renderedSectionCount === 0;
    renderedSectionCount += 1;
    copy.className = "summary-copy";
    title.textContent = definition.title;
    description.textContent = definition.description;
    count.className = "section-count";
    count.textContent = `${keywordCountForSection(entries)} phrases`;
    body.className = "basic-section-body";

    copy.appendChild(title);
    copy.appendChild(description);
    summary.appendChild(copy);
    summary.appendChild(count);
    details.appendChild(summary);

    entries.forEach(({ groupId, signalIndex, signal }) => {
      const field = document.createElement("label");
      const labelText = document.createElement("span");
      const textarea = document.createElement("textarea");
      const help = document.createElement("p");
      const effect = document.createElement("p");

      field.className = "signal-field";
      labelText.textContent = signal.display_name || LENS_PACK_RUNTIME.humanizeId(signal.id);
      textarea.value = (signal.keywords || []).join("\n");
      textarea.dataset.signalGroup = groupId;
      textarea.dataset.signalIndex = String(signalIndex);
      textarea.rows = 5;
      textarea.setAttribute("aria-label", `${labelText.textContent} phrases`);
      help.className = "signal-help";
      help.textContent = signal.editor_help || signal.reason || "Add the wording you expect job ads to use.";
      effect.className = "signal-effect";
      effect.textContent = signalEffectText(signal);

      field.appendChild(labelText);
      field.appendChild(textarea);
      field.appendChild(help);
      field.appendChild(effect);
      body.appendChild(field);
    });

    details.appendChild(body);
    container.appendChild(details);
  });
}

function renderAdvancedJson() {
  document.getElementById("advancedJson").value = JSON.stringify(
    editorState.activePack,
    null,
    2
  );
}

function renderEditor() {
  renderLensManager();
  renderSources();
  renderBasicSections();
  renderAdvancedJson();
}

function collectBasicLensPack() {
  const lensPack = LENS_PACK_RUNTIME.clone(editorState.activePack);
  const name = document.getElementById("lensName").value.trim();
  const selectedSources = [
    ...document.querySelectorAll("#sourceOptions input[data-source-adapter-id]:checked")
  ].map((input) => input.value);

  if (!name) throw new Error("Enter a name for this Lens.");
  if (selectedSources.length === 0) throw new Error("Choose at least one job source.");

  lensPack.name = name;
  lensPack.supported_source_adapters = selectedSources;
  lensPack.source_adapter = selectedSources.includes(lensPack.source_adapter)
    ? lensPack.source_adapter
    : selectedSources[0];
  lensPack.active_source_adapter = selectedSources.includes(lensPack.active_source_adapter)
    ? lensPack.active_source_adapter
    : selectedSources[0];

  document.querySelectorAll("textarea[data-signal-group]").forEach((textarea) => {
    const groupId = textarea.dataset.signalGroup;
    const signalIndex = Number(textarea.dataset.signalIndex);
    const signal = lensPack.signal_groups?.[groupId]?.[signalIndex];

    if (signal) {
      signal.keywords = textToKeywords(textarea.value);
    }
  });

  return lensPack;
}

function parseAdvancedLensPack() {
  let parsed;

  try {
    parsed = JSON.parse(document.getElementById("advancedJson").value);
  } catch (error) {
    throw new Error(`JSON could not be read: ${error.message}`);
  }

  if (!LENS_PACK_RUNTIME.isPlainObject(parsed?.signal_groups)) {
    throw new Error("Lens Pack validation failed:\n- $.signal_groups: must be an object");
  }

  const lensPack = normalizeLensPack(parsed);
  lensPack.lens_pack_id = lensPack.id;
  lensPack.lens_pack_version = lensPack.version;
  const validation = LENS_PACK_RUNTIME.validateLensPack(lensPack);

  if (!validation.valid) {
    throw new Error(LENS_PACK_RUNTIME.formatValidationErrors(validation, 12));
  }

  return lensPack;
}

async function saveBasic() {
  try {
    const lensPack = collectBasicLensPack();
    const validation = LENS_PACK_RUNTIME.validateLensPack(lensPack);

    if (!validation.valid) {
      throw new Error(LENS_PACK_RUNTIME.formatValidationErrors(validation, 12));
    }

    const packs = { ...editorState.packs, [lensPack.id]: lensPack };
    await persistPacks(packs, lensPack.id);
    renderEditor();
    setNotice("Lens saved. New captures will use these settings.");
  } catch (error) {
    setNotice(error.message || "Lens could not be saved.", "error", 0);
  }
}

async function saveAdvanced() {
  try {
    const lensPack = parseAdvancedLensPack();
    const existing = editorState.packs[lensPack.id];

    if (existing && lensPack.id !== editorState.activeId && !confirm(`Replace the existing “${existing.name}” Lens?`)) {
      return;
    }

    const packs = { ...editorState.packs, [lensPack.id]: lensPack };
    if (lensPack.id !== editorState.activeId) {
      delete packs[editorState.activeId];
    }
    await persistPacks(packs, lensPack.id);
    renderEditor();
    setNotice("Advanced Lens Pack saved.");
  } catch (error) {
    setNotice(error.message || "Lens Pack JSON could not be saved.", "error", 0);
  }
}

function setActiveTab(mode) {
  const isBasic = mode === "basic";
  document.getElementById("basicTab").setAttribute("aria-selected", String(isBasic));
  document.getElementById("advancedTab").setAttribute("aria-selected", String(!isBasic));
  document.getElementById("basicPanel").hidden = !isBasic;
  document.getElementById("advancedPanel").hidden = isBasic;
}

async function activateLens(id) {
  if (!editorState.packs[id]) return;
  await persistPacks(editorState.packs, id);
  renderEditor();
}

async function createLens(name, basis) {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) throw new Error("Enter a name for the new Lens.");

  const template = basis === "current"
    ? editorState.activePack
    : BUNDLED_LENS_PACK;
  const created = createLensFromTemplate(template, trimmedName, editorState.packs);
  const validation = LENS_PACK_RUNTIME.validateLensPack(created);

  if (!validation.valid) {
    throw new Error(LENS_PACK_RUNTIME.formatValidationErrors(validation));
  }

  await persistPacks({ ...editorState.packs, [created.id]: created }, created.id);
  renderEditor();
}

document.getElementById("lensSelect").addEventListener("change", (event) => {
  activateLens(event.target.value);
});

document.getElementById("basicTab").addEventListener("click", () => setActiveTab("basic"));
document.getElementById("advancedTab").addEventListener("click", () => {
  renderAdvancedJson();
  setActiveTab("advanced");
});
document.getElementById("saveBasic").addEventListener("click", saveBasic);

document.getElementById("validateAdvanced").addEventListener("click", () => {
  try {
    parseAdvancedLensPack();
    setNotice("Lens Pack JSON is valid.");
  } catch (error) {
    setNotice(error.message || "Lens Pack JSON is invalid.", "error", 0);
  }
});

document.getElementById("saveAdvanced").addEventListener("click", saveAdvanced);

document.getElementById("exportLens").addEventListener("click", () => {
  download(
    `ark-lens-pack-${slugifyLensId(editorState.activePack.name)}-${editorState.activePack.version}.json`,
    JSON.stringify(editorState.activePack, null, 2),
    "application/json"
  );
});

document.getElementById("restoreBundled").addEventListener("click", async () => {
  if (!confirm("Restore the bundled My Job Search Lens? Its saved settings will be replaced.")) {
    return;
  }

  const restored = LENS_PACK_RUNTIME.clone(BUNDLED_LENS_PACK);
  await persistPacks({ ...editorState.packs, [restored.id]: restored }, restored.id);
  renderEditor();
  setNotice("My Job Search was restored to the bundled settings.");
});

document.getElementById("newLens").addEventListener("click", () => {
  document.getElementById("createLensName").value = "";
  document.getElementById("createLensBasis").value = "bundled";
  document.getElementById("createLensDialog").showModal();
  document.getElementById("createLensName").focus();
});

document.getElementById("cancelCreateLens").addEventListener("click", () => {
  document.getElementById("createLensDialog").close();
});

document.getElementById("createLensForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await createLens(
      document.getElementById("createLensName").value,
      document.getElementById("createLensBasis").value
    );
    document.getElementById("createLensDialog").close();
    setNotice("New Lens created.");
  } catch (error) {
    setNotice(error.message || "Lens could not be created.", "error", 0);
  }
});

document.getElementById("duplicateLens").addEventListener("click", async () => {
  try {
    const created = createLensFromTemplate(
      editorState.activePack,
      `Copy of ${editorState.activePack.name}`,
      editorState.packs
    );
    await persistPacks({ ...editorState.packs, [created.id]: created }, created.id);
    renderEditor();
    setNotice("Lens duplicated. Give the copy a new name, then save your changes.");
  } catch (error) {
    setNotice(error.message || "Lens could not be duplicated.", "error", 0);
  }
});

document.getElementById("deleteLens").addEventListener("click", async () => {
  if (Object.keys(editorState.packs).length < 2) {
    setNotice("Keep at least one Lens.", "error");
    return;
  }
  if (!confirm(`Delete “${editorState.activePack.name}”?`)) return;

  const packs = { ...editorState.packs };
  delete packs[editorState.activeId];
  const nextId = Object.keys(packs)[0];
  await persistPacks(packs, nextId);
  renderEditor();
  setNotice("Lens deleted.");
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (!changes[LENS_PACKS_KEY] && !changes[ACTIVE_LENS_PACK_ID_KEY]) return;

  loadEditorStorage().then(renderEditor).catch((error) => {
    setNotice(error.message || "Lens storage could not be refreshed.", "error", 0);
  });
});

loadEditorStorage().then(renderEditor).catch((error) => {
  setNotice(error.message || "Lens editor could not start.", "error", 0);
});
