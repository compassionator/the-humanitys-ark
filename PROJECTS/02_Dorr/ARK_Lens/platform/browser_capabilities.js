(function initArkBrowserCapabilities(root, factory) {
  const exported = { createBrowserCapabilities: factory };

  if (root && (root.browser || root.chrome)) {
    root.ARK_BROWSER_CAPABILITIES = factory(root);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createBrowserCapabilities(root) {
  const namespace = root.browser ? "browser" : root.chrome ? "chrome" : null;
  const api = namespace ? root[namespace] : null;

  if (!api) {
    throw new Error("ARK Lens requires a WebExtension browser namespace.");
  }

  function resolveCapability(path) {
    const parts = path.split(".");
    let receiver = api;

    for (let index = 0; index < parts.length - 1; index += 1) {
      receiver = receiver?.[parts[index]];
    }

    const methodName = parts.at(-1);
    const method = receiver?.[methodName];
    if (typeof method !== "function") {
      throw new Error(`ARK browser capability unavailable: ${path}`);
    }

    return { method, receiver };
  }

  function invoke(path, args = []) {
    const { method, receiver } = resolveCapability(path);

    if (namespace === "browser") {
      try {
        return Promise.resolve(method.apply(receiver, args));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (action, value) => {
        if (settled) return;
        settled = true;
        action(value);
      };
      const callback = (...values) => {
        const runtimeError = api.runtime?.lastError;
        if (runtimeError) {
          settle(reject, new Error(runtimeError.message || String(runtimeError)));
          return;
        }
        settle(resolve, values.length > 1 ? values : values[0]);
      };

      try {
        const returned = method.apply(receiver, [...args, callback]);
        if (returned && typeof returned.then === "function") {
          returned.then(
            (value) => settle(resolve, value),
            (error) => settle(reject, error)
          );
        } else if (returned !== undefined) {
          settle(resolve, returned);
        }
      } catch (error) {
        settle(reject, error);
      }
    });
  }

  function readValue(path) {
    const parts = path.split(".");
    let value = api;
    for (const part of parts) value = value?.[part];
    return value;
  }

  function callSync(path, args = []) {
    const { method, receiver } = resolveCapability(path);
    return method.apply(receiver, args);
  }

  function subscribe(path, listener) {
    const event = readValue(path);
    if (!event || typeof event.addListener !== "function") {
      throw new Error(`ARK browser capability unavailable: ${path}.addListener`);
    }
    event.addListener(listener);
    return () => {
      if (typeof event.removeListener === "function") event.removeListener(listener);
    };
  }

  const capabilities = {
    namespace,
    tabs: Object.freeze({
      getActive: async () => (await invoke("tabs.query", [{ active: true, currentWindow: true }]))?.[0],
      get: (tabId) => invoke("tabs.get", [tabId]),
      query: (queryInfo) => invoke("tabs.query", [queryInfo]),
      create: (createProperties) => invoke("tabs.create", [createProperties]),
      sendMessage: (tabId, message) => invoke("tabs.sendMessage", [tabId, message]),
      onUpdated: (listener) => subscribe("tabs.onUpdated", listener),
      onRemoved: (listener) => subscribe("tabs.onRemoved", listener)
    }),
    scripting: Object.freeze({
      injectOrdered: (tabId, files) => invoke("scripting.executeScript", [{
        target: { tabId },
        files: [...files]
      }])
    }),
    storage: Object.freeze({
      get: (keys) => invoke("storage.local.get", [keys]),
      set: (values) => invoke("storage.local.set", [values]),
      remove: (keys) => invoke("storage.local.remove", [keys]),
      onChanged: (listener) => subscribe("storage.onChanged", listener)
    }),
    runtime: Object.freeze({
      sendMessage: (message) => invoke("runtime.sendMessage", [message]),
      onMessage: (listener) => subscribe("runtime.onMessage", listener),
      onStartup: (listener) => subscribe("runtime.onStartup", listener),
      onInstalled: (listener) => subscribe("runtime.onInstalled", listener),
      getUrl: (relativePath) => callSync("runtime.getURL", [relativePath]),
      getManifest: () => callSync("runtime.getManifest"),
      isAvailable: () => Boolean(readValue("runtime.id"))
    }),
    action: Object.freeze({
      setIcon: (details) => invoke("action.setIcon", [details]),
      setBadgeText: (details) => invoke("action.setBadgeText", [details]),
      setTitle: (details) => invoke("action.setTitle", [details])
    })
  };

  capabilities.openExtensionPage = (relativePath) =>
    capabilities.tabs.create({ url: capabilities.runtime.getUrl(relativePath) });

  return Object.freeze(capabilities);
});
