const assert = require("node:assert/strict");
const { createBrowserCapabilities } = require("../platform/browser_capabilities.js");

function eventHarness() {
  const listeners = new Set();
  return {
    addListener(listener) { listeners.add(listener); },
    removeListener(listener) { listeners.delete(listener); },
    emit(...args) { listeners.forEach((listener) => listener(...args)); },
    size() { return listeners.size; }
  };
}

function makeNamespace(style) {
  const calls = [];
  const store = { seeded: "value" };
  const storageChanged = eventHarness();
  const runtimeMessage = eventHarness();
  const startup = eventHarness();
  const installed = eventHarness();
  const tabUpdated = eventHarness();
  const tabRemoved = eventHarness();
  const complete = (value, callback) => {
    if (style === "callback") {
      queueMicrotask(() => callback(value));
      return undefined;
    }
    return Promise.resolve(value);
  };
  const api = {
    action: {
      setIcon(value, callback) { calls.push(["setIcon", value]); return complete(undefined, callback); },
      setBadgeText(value, callback) { calls.push(["setBadgeText", value]); return complete(undefined, callback); },
      setTitle(value, callback) { calls.push(["setTitle", value]); return complete(undefined, callback); }
    },
    runtime: {
      id: "ark-test",
      getURL(value) { calls.push(["getURL", value]); return `extension://ark/${value}`; },
      getManifest() { return { version: "test" }; },
      sendMessage(value, callback) { calls.push(["runtime.sendMessage", value]); return complete({ ok: true }, callback); },
      onMessage: runtimeMessage,
      onStartup: startup,
      onInstalled: installed
    },
    scripting: {
      executeScript(value, callback) { calls.push(["executeScript", value]); return complete([{ result: true }], callback); }
    },
    storage: {
      local: {
        get(keys, callback) {
          calls.push(["storage.get", keys]);
          const selected = Array.isArray(keys)
            ? Object.fromEntries(keys.map((key) => [key, store[key]]))
            : { [keys]: store[keys] };
          return complete(selected, callback);
        },
        set(values, callback) {
          calls.push(["storage.set", values]);
          Object.assign(store, values);
          return complete(undefined, callback);
        },
        remove(keys, callback) {
          calls.push(["storage.remove", keys]);
          for (const key of [].concat(keys)) delete store[key];
          return complete(undefined, callback);
        }
      },
      onChanged: storageChanged
    },
    tabs: {
      query(value, callback) { calls.push(["tabs.query", value]); return complete([{ id: 7 }], callback); },
      get(value, callback) { calls.push(["tabs.get", value]); return complete({ id: value }, callback); },
      create(value, callback) { calls.push(["tabs.create", value]); return complete({ id: 8 }, callback); },
      sendMessage(tabId, message, callback) {
        calls.push(["tabs.sendMessage", tabId, message]);
        return complete({ received: message.type }, callback);
      },
      onUpdated: tabUpdated,
      onRemoved: tabRemoved
    }
  };
  return { api, calls, events: { installed, runtimeMessage, startup, storageChanged, tabRemoved, tabUpdated }, store };
}

async function exercise(style, namespace) {
  const harness = makeNamespace(style);
  const root = namespace === "browser"
    ? { browser: harness.api, chrome: { tabs: { query() { throw new Error("wrong namespace"); } } } }
    : { chrome: harness.api };
  const capabilities = createBrowserCapabilities(root);

  assert.equal(capabilities.namespace, namespace);
  assert.deepEqual(await capabilities.tabs.getActive(), { id: 7 });
  assert.deepEqual(await capabilities.tabs.query({ active: false }), [{ id: 7 }]);
  assert.deepEqual(await capabilities.tabs.get(9), { id: 9 });
  assert.deepEqual(await capabilities.tabs.sendMessage(9, { type: "TEST" }), { received: "TEST" });
  assert.deepEqual(await capabilities.scripting.injectOrdered(9, ["one.js", "two.js"]), [{ result: true }]);
  assert.deepEqual(await capabilities.storage.get("seeded"), { seeded: "value" });
  await capabilities.storage.set({ extra: 2 });
  assert.equal(harness.store.extra, 2);
  await capabilities.storage.remove("extra");
  assert.equal("extra" in harness.store, false);
  assert.equal(capabilities.runtime.getUrl("report/report.html"), "extension://ark/report/report.html");
  assert.deepEqual(capabilities.runtime.getManifest(), { version: "test" });
  assert.equal(capabilities.runtime.isAvailable(), true);
  assert.deepEqual(await capabilities.runtime.sendMessage({ type: "PING" }), { ok: true });
  assert.deepEqual(await capabilities.openExtensionPage("alpha/guide.html"), { id: 8 });
  await capabilities.action.setIcon({ path: "icon.png" });
  await capabilities.action.setBadgeText({ text: "" });
  await capabilities.action.setTitle({ title: "ARK Lens" });

  for (const [method, event] of [
    [capabilities.storage.onChanged, harness.events.storageChanged],
    [capabilities.runtime.onMessage, harness.events.runtimeMessage],
    [capabilities.runtime.onStartup, harness.events.startup],
    [capabilities.runtime.onInstalled, harness.events.installed],
    [capabilities.tabs.onUpdated, harness.events.tabUpdated],
    [capabilities.tabs.onRemoved, harness.events.tabRemoved]
  ]) {
    const listener = () => {};
    const unsubscribe = method(listener);
    assert.equal(event.size(), 1);
    unsubscribe();
    assert.equal(event.size(), 0);
  }

  assert.deepEqual(
    harness.calls.find(([name]) => name === "executeScript")[1],
    { target: { tabId: 9 }, files: ["one.js", "two.js"] }
  );
}

(async () => {
  await exercise("promise", "browser");
  await exercise("callback", "chrome");

  assert.throws(
    () => createBrowserCapabilities({}),
    /requires a WebExtension browser namespace/
  );
  const incomplete = createBrowserCapabilities({ browser: { runtime: { id: "test" } } });
  assert.throws(() => incomplete.tabs.query({}), /capability unavailable: tabs\.query/);
  assert.throws(() => incomplete.runtime.getUrl("page.html"), /capability unavailable: runtime\.getURL/);

  console.log("ARK Lens browser capability namespace, messaging, storage, tabs, and action contracts passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
