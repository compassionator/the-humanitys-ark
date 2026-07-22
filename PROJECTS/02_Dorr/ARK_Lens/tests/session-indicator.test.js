const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");
const sourceAdaptersRuntime = require("../sources/source_adapter_registry.js");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

(async () => {
  const store = { ark_lens_session: { active: false } };
  const calls = {
    icons: [],
    badgeText: [],
    title: [],
    createdTabs: []
  };
  const listeners = {};
  let failTabLookup = false;
  const chrome = {
    action: {
      async setIcon(value) { calls.icons.push(value); },
      async setBadgeText(value) { calls.badgeText.push(value); },
      async setTitle(value) { calls.title.push(value); }
    },
    storage: {
      local: {
        async get(key) { return { [key]: store[key] }; },
        async set(values) {
          Object.entries(values).forEach(([key, value]) => {
            const oldValue = store[key];
            store[key] = value;
            listeners.storage?.({ [key]: { oldValue, newValue: value } }, "local");
          });
        }
      },
      onChanged: {
        addListener(listener) { listeners.storage = listener; }
      }
    },
    tabs: {
      onUpdated: { addListener(listener) { listeners.updated = listener; } },
      onRemoved: { addListener(listener) { listeners.removed = listener; } },
      async get(tabId) {
        if (failTabLookup) throw new Error("Missing tab");
        return { id: tabId, url: "https://www.linkedin.com/jobs/view/123/" };
      },
      async create(options) { calls.createdTabs.push(options); },
      async sendMessage() {},
    },
    scripting: { async executeScript() {} },
    runtime: {
      getURL(relativePath) { return `chrome-extension://ark-lens/${relativePath}`; },
      onStartup: { addListener(listener) { listeners.startup = listener; } },
      onInstalled: { addListener(listener) { listeners.installed = listener; } }
    }
  };
  const context = vm.createContext({
    chrome,
    URL,
    console,
    ARK_SOURCE_ADAPTERS: sourceAdaptersRuntime
  });
  vm.runInContext(backgroundSource, context);
  await flush();

  assert.deepEqual(plain(calls.badgeText.at(-1)), { text: "" });
  assert.equal(calls.icons.at(-1).path[16], "icons/ark-lens-16.png");
  assert.deepEqual(plain(calls.title.at(-1)), { title: "ARK Lens" });

  const activeSession = {
    active: true,
    tab_id: 12,
    captured_count: 2,
    session_id: "test-session"
  };
  store.ark_lens_session = activeSession;
  listeners.storage({
    ark_lens_session: {
      oldValue: { active: false },
      newValue: activeSession
    }
  }, "local");
  await flush();

  assert.deepEqual(plain(calls.badgeText.at(-1)), { text: "" });
  assert.equal(calls.icons.at(-1).path[16], "icons/ark-lens-active-16.png");
  assert.deepEqual(plain(calls.title.at(-1)), { title: "ARK Lens — Session active" });

  await listeners.installed({ reason: "install" });
  assert.deepEqual(plain(calls.createdTabs.at(-1)), {
    url: "chrome-extension://ark-lens/alpha/guide.html"
  });

  failTabLookup = true;
  store.ark_lens_session = activeSession;
  await listeners.startup();
  await flush();

  assert.equal(store.ark_lens_session.active, false);
  assert.equal(store.ark_lens_session.stopped_reason, "browser_restart");
  assert.deepEqual(plain(calls.badgeText.at(-1)), { text: "" });
  assert.equal(calls.icons.at(-1).path[16], "icons/ark-lens-16.png");
  assert.deepEqual(plain(calls.title.at(-1)), { title: "ARK Lens" });

  console.log("ARK Lens active-session icon indicator tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
