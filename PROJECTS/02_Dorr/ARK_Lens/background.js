const SESSION_KEY = "ark_lens_session";

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

  await chrome.action.setIcon({ path: state.icon_paths });
  // Clear the legacy v14 corner badge when users update to the icon-swap release.
  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setTitle({ title: state.title });
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
  try {
    const parsed = new URL(url);
    const isLinkedInJobs =
      /(^|\.)linkedin\.com$/i.test(parsed.hostname) &&
      parsed.pathname.includes("/jobs");
    const isSeekJobs =
      /(^|\.)seek\.com(\.au)?$/i.test(parsed.hostname) &&
      (
        /^\/job\/\d+/.test(parsed.pathname) ||
        /^\/jobs(?:-|\/|$)/.test(parsed.pathname) ||
        Boolean(parsed.searchParams.get("jobId"))
      );

    return isLinkedInJobs || isSeekJobs;
  } catch (_error) {
    return false;
  }
}

async function getSession() {
  const result = await chrome.storage.local.get(SESSION_KEY);
  return result[SESSION_KEY] || { active: false };
}

async function restartSessionListener(tabId, url) {
  const session = await getSession();

  if (!session.active || session.tab_id !== tabId || !isSupportedSourceUrl(url)) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        "lens-packs/bundled_lens_pack.js",
        "lens-packs/lens_pack_runtime.js",
        "content_bundle.js"
      ]
    });
    await chrome.tabs.sendMessage(tabId, { type: "ARK_START_LISTENING" });
    console.log("[ARK Lens] same-tab listener restarted after navigation", { tabId, url });
  } catch (error) {
    console.warn("[ARK Lens] same-tab listener restart failed", { tabId, url, error });
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab?.url;

  if (!url || !isSupportedSourceUrl(url)) {
    return;
  }

  if (changeInfo.status && changeInfo.status !== "complete") {
    return;
  }

  restartSessionListener(tabId, url);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const session = await getSession();

    if (!session.active || session.tab_id !== tabId) {
      return;
    }

    await chrome.storage.local.set({
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

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[SESSION_KEY]) {
    syncSessionIndicator(changes[SESSION_KEY].newValue || { active: false });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const session = await getSession();

  if (session.active && session.tab_id) {
    try {
      const tab = await chrome.tabs.get(session.tab_id);
      if (!isSupportedSourceUrl(tab?.url)) throw new Error("Session tab is unavailable");
    } catch (_error) {
      const stopped = {
        ...session,
        active: false,
        stopped_at: new Date().toISOString(),
        stopped_reason: "browser_restart"
      };
      await chrome.storage.local.set({ [SESSION_KEY]: stopped });
      await syncSessionIndicator(stopped);
      return;
    }
  }

  await syncSessionIndicator(session);
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await syncSessionIndicator();

  if (details?.reason === "install") {
    await chrome.tabs.create({ url: chrome.runtime.getURL("alpha/guide.html") });
  }
});

syncSessionIndicator();
