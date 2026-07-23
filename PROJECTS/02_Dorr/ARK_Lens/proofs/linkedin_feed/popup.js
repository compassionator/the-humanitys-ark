const EXTENSION_API = globalThis.browser || globalThis.chrome;
if (!EXTENSION_API?.tabs?.query || !EXTENSION_API?.tabs?.sendMessage || !EXTENSION_API?.scripting?.executeScript) {
  throw new Error("ARK Lens Feed proof requires the WebExtension tabs and scripting APIs.");
}

const RUNTIME_FILES = [
  "core/lens_item.js",
  "core/extraction_result.js",
  "sources/source_adapter_registry.js",
  "sources/dom_read_utils.js",
  "sources/adapter_diagnostics.js",
  "sources/feed/feed_source_catalogue.js",
  "domains/feed/feed_item_mapper.js",
  "domains/feed/feed_capture_policy.js",
  "sources/feed/linkedin_feed_adapter.js",
  "orchestration/feed/linkedin_feed_probe.js",
  "proofs/linkedin_feed/proof_content_bootstrap.js"
];

let currentSnapshot = null;

async function activeTab() {
  const [tab] = await EXTENSION_API.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/([a-z0-9-]+\.)?linkedin\.com\/feed(?:\/|$)/i.test(tab.url || "")) {
    throw new Error("Open the LinkedIn home feed before running this proof.");
  }
  return tab;
}

async function ensureRuntime(tabId) {
  await EXTENSION_API.scripting.executeScript({ target: { tabId }, files: RUNTIME_FILES });
}

function render(snapshot) {
  currentSnapshot = snapshot;
  const counts = document.getElementById("counts");
  counts.replaceChildren(...Object.entries(snapshot?.counts || {}).flatMap(([label, value]) => {
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = String(value);
    return [term, detail];
  }));
  document.getElementById("snapshot").textContent = JSON.stringify(snapshot, null, 2);
  document.getElementById("status").textContent = snapshot?.observation_active
    ? "Observation active. Scroll manually to render more posts."
    : "Observation stopped.";
}

async function operation(type) {
  const tab = await activeTab();
  await ensureRuntime(tab.id);
  const response = await EXTENSION_API.tabs.sendMessage(tab.id, { type });
  if (!response?.ok) throw new Error(response?.message || "Proof operation failed.");
  render(response.snapshot);
}

function bind(id, type) {
  document.getElementById(id).addEventListener("click", () => {
    operation(type).catch((error) => { document.getElementById("status").textContent = error.message; });
  });
}

bind("scan", "ARK_FEED_PROOF_SCAN");
bind("start", "ARK_FEED_PROOF_START");
bind("stop", "ARK_FEED_PROOF_STOP");
bind("refresh", "ARK_FEED_PROOF_SNAPSHOT");
bind("clear", "ARK_FEED_PROOF_CLEAR");

document.getElementById("export").addEventListener("click", () => {
  if (!currentSnapshot) {
    document.getElementById("status").textContent = "Scan or refresh before exporting.";
    return;
  }
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(currentSnapshot, null, 2)}\n`], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `ark-linkedin-feed-proof-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
});
