if (typeof importScripts === "function") {
  if (!globalThis.ARK_BROWSER_CAPABILITIES) importScripts("platform/browser_capabilities.js");
  if (!globalThis.ARK_JOB_CONTRACTS) importScripts("contracts/job_contracts.js");
  if (!globalThis.ARK_JOB_RUNTIME_ORDER) importScripts("runtime/job_runtime_order.js");
  if (!globalThis.ARK_SOURCE_ADAPTERS) {
    importScripts("sources/source_adapter_registry.js");
    importScripts("sources/jobs/job_source_catalogue.js");
  }
}

const BROWSER = globalThis.ARK_BROWSER_CAPABILITIES;
const JOB_CONTRACTS = globalThis.ARK_JOB_CONTRACTS;
const JOB_RUNTIME_ORDER = globalThis.ARK_JOB_RUNTIME_ORDER;
const SESSION_KEY = JOB_CONTRACTS?.STORAGE_KEYS.SESSION;
const MESSAGES = JOB_CONTRACTS?.MESSAGES;
const SOURCE_ADAPTERS_RUNTIME = globalThis.ARK_SOURCE_ADAPTERS;

if (!BROWSER || !JOB_CONTRACTS || !JOB_RUNTIME_ORDER || !SOURCE_ADAPTERS_RUNTIME) {
  throw new Error("ARK browser, Job contract, runtime-order, and source runtimes must load before the background worker.");
}

function getSessionIndicatorState(session) {
  return {
    icon_paths: {
      16: `icons/ark-lens${session?.active ? "-active" : ""}-16.png`,
      32: `icons/ark-lens${session?.active ? "-active" : ""}-32.png`,
      48: `icons/ark-lens${session?.active ? "-active" : ""}-48.png`,
      128: `icons/ark-lens${session?.active ? "-active" : ""}-128.png`
    },
    title: session?.active ? "ARK Lens — Session active" : "ARK Lens"
  };
}

async function applySessionIndicator(session) {
  const state = getSessionIndicatorState(session);

  await BROWSER.action.setIcon({ path: state.icon_paths });
  // Clear the legacy v14 corner badge when users update to the icon-swap release.
  await BROWSER.action.setBadgeText({ text: "" });
  await BROWSER.action.setTitle({ title: state.title });
}

async function syncSessionIndicator(sessionOverride) {
  try {
    const session = sessionOverride || await getSession();
    await applySessionIndicator(session);
  } catch (error) {
    console.warn("[ARK Lens] failed to update the session indicator", error);
  }
}

function isSupportedSourceUrl(url) {
  return Boolean(SOURCE_ADAPTERS_RUNTIME.getSourceForLocation(url));
}

async function getSession() {
  const result = await BROWSER.storage.get(SESSION_KEY);
  return result[SESSION_KEY] || { active: false };
}

async function restartSessionListener(tabId, url) {
  const session = await getSession();

  if (!session.active || session.tab_id !== tabId || !isSupportedSourceUrl(url)) {
    return;
  }

  try {
    await BROWSER.scripting.injectOrdered(tabId, JOB_RUNTIME_ORDER.CONTENT_SCRIPT_FILES);
    await BROWSER.tabs.sendMessage(tabId, { type: MESSAGES.START_LISTENING });
    console.log("[ARK Lens] same-tab listener restarted after navigation", { tabId, url });
  } catch (error) {
    console.warn("[ARK Lens] same-tab listener restart failed", { tabId, url, error });
  }
}

BROWSER.tabs.onUpdated((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab?.url;

  if (!url || !isSupportedSourceUrl(url)) {
    return;
  }

  if (changeInfo.status && changeInfo.status !== "complete") {
    return;
  }

  restartSessionListener(tabId, url);
});

BROWSER.tabs.onRemoved(async (tabId) => {
  try {
    const session = await getSession();

    if (!session.active || session.tab_id !== tabId) {
      return;
    }

    await BROWSER.storage.set({
      [SESSION_KEY]: {
        ...session,
        active: false,
        stopped_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.warn("[ARK Lens] failed to stop session after tab closed", { tabId, error });
  }
});

BROWSER.storage.onChanged((changes, areaName) => {
  if (areaName === "local" && changes[SESSION_KEY]) {
    syncSessionIndicator(changes[SESSION_KEY].newValue || { active: false });
  }
});

BROWSER.runtime.onStartup(async () => {
  const session = await getSession();

  if (session.active && session.tab_id) {
    try {
      const tab = await BROWSER.tabs.get(session.tab_id);
      if (!isSupportedSourceUrl(tab?.url)) throw new Error("Session tab is unavailable");
    } catch (_error) {
      const stopped = {
        ...session,
        active: false,
        stopped_at: new Date().toISOString(),
        stopped_reason: JOB_CONTRACTS.SESSION.STOPPED_REASON_BROWSER_RESTART
      };
      await BROWSER.storage.set({ [SESSION_KEY]: stopped });
      await syncSessionIndicator(stopped);
      return;
    }
  }

  await syncSessionIndicator(session);
});

BROWSER.runtime.onInstalled(async (details) => {
  await syncSessionIndicator();

  if (details?.reason === "install") {
    await BROWSER.openExtensionPage("alpha/guide.html");
  }
});

syncSessionIndicator();
