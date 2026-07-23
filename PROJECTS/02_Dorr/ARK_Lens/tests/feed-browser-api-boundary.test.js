const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const popupSource = fs.readFileSync(path.join(root, "proofs", "linkedin_feed", "popup.js"), "utf8");
const bootstrapSource = fs.readFileSync(
  path.join(root, "proofs", "linkedin_feed", "proof_content_bootstrap.js"),
  "utf8"
);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const EXPECTED_RUNTIME_FILES = Object.freeze([
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
]);

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createElement() {
  return {
    listeners: Object.create(null),
    textContent: "",
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    replaceChildren(...children) {
      this.children = children;
    },
    click() {}
  };
}

function createPopupHarness(namespace) {
  const calls = [];
  const elements = Object.fromEntries(
    ["counts", "snapshot", "status", "scan", "start", "stop", "refresh", "clear", "export"]
      .map((id) => [id, createElement()])
  );
  const document = {
    createElement,
    getElementById(id) {
      return elements[id];
    }
  };
  const api = {
    scripting: {
      async executeScript(options) {
        calls.push({ method: "executeScript", options });
      }
    },
    tabs: {
      async query(options) {
        calls.push({ method: "query", options });
        return [{ id: 42, url: "https://www.linkedin.com/feed/" }];
      },
      async sendMessage(tabId, message) {
        calls.push({ message, method: "sendMessage", tabId });
        return {
          ok: true,
          snapshot: {
            counts: { captured: 1 },
            observation_active: false
          }
        };
      }
    }
  };
  const unusedApi = {
    scripting: {
      async executeScript() {
        throw new Error("Unselected scripting namespace was called.");
      }
    },
    tabs: {
      async query() {
        throw new Error("Unselected tabs namespace was called.");
      },
      async sendMessage() {
        throw new Error("Unselected tabs namespace was called.");
      }
    }
  };
  const context = {
    Blob,
    Date,
    URL: {
      createObjectURL() {
        return "blob:feed-proof";
      },
      revokeObjectURL() {}
    },
    document
  };
  if (namespace === "browser") {
    context.browser = api;
    context.chrome = unusedApi;
  } else {
    context.chrome = api;
  }
  vm.runInNewContext(popupSource, context, { filename: "popup.js" });
  return { calls, elements };
}

async function testPopupNamespace(namespace) {
  const { calls, elements } = createPopupHarness(namespace);
  elements.scan.listeners.click();
  await tick();
  await tick();

  assert.deepEqual(calls.map((call) => call.method), ["query", "executeScript", "sendMessage"]);
  assert.deepEqual(plain(calls[0].options), { active: true, currentWindow: true });
  assert.deepEqual(
    Array.from(calls[1].options.files),
    EXPECTED_RUNTIME_FILES,
    `${namespace} ordered runtime injection`
  );
  assert.deepEqual(plain(calls[1].options.target), { tabId: 42 });
  assert.equal(calls[2].tabId, 42);
  assert.deepEqual(plain(calls[2].message), { type: "ARK_FEED_PROOF_SCAN" });
  assert.equal(elements.status.textContent, "Observation stopped.");
}

function createBootstrapHarness(namespace) {
  let addListenerCount = 0;
  let listener = null;
  const api = {
    runtime: {
      onMessage: {
        addListener(candidate) {
          addListenerCount += 1;
          listener = candidate;
        }
      }
    }
  };
  const unusedApi = {
    runtime: {
      onMessage: {
        addListener() {
          throw new Error("Unselected runtime namespace was called.");
        }
      }
    }
  };
  const context = {
    __arkLinkedInFeedProofRuntime: {
      async handleMessage(message) {
        return { handled_type: message.type };
      }
    }
  };
  if (namespace === "browser") {
    context.browser = api;
    context.chrome = unusedApi;
  } else {
    context.chrome = api;
  }
  vm.runInNewContext(bootstrapSource, context, { filename: "proof_content_bootstrap.js" });
  vm.runInNewContext(bootstrapSource, context, { filename: "proof_content_bootstrap.js" });
  return {
    addListenerCount: () => addListenerCount,
    listener: () => listener
  };
}

async function testBootstrapNamespace(namespace) {
  const harness = createBootstrapHarness(namespace);
  assert.equal(harness.addListenerCount(), 1, `${namespace} listener guard`);
  assert.equal(typeof harness.listener(), "function");

  let response = null;
  const retained = harness.listener()(
    { type: "ARK_FEED_PROOF_SCAN" },
    {},
    (value) => {
      response = value;
    }
  );
  assert.equal(retained, true, `${namespace} asynchronous response channel`);
  assert.equal(response, null, "response must remain asynchronous");
  await tick();
  assert.deepEqual(plain(response), {
    ok: true,
    snapshot: { handled_type: "ARK_FEED_PROOF_SCAN" }
  });
  assert.equal(harness.listener()({ type: "IGNORED" }, {}, () => {}), undefined);
}

async function main() {
  assert.match(popupSource, /const EXTENSION_API = globalThis\.browser \|\| globalThis\.chrome;/);
  assert.match(bootstrapSource, /const EXTENSION_API = globalThis\.browser \|\| globalThis\.chrome;/);
  assert.doesNotMatch(popupSource, /\bchrome\.(?:tabs|scripting|runtime)\b/);
  assert.doesNotMatch(bootstrapSource, /\bchrome\.(?:tabs|scripting|runtime)\b/);
  assert.match(bootstrapSource, /if \(!globalThis\.__arkLinkedInFeedProofListener\)/);
  assert.match(bootstrapSource, /return true;/);

  await testPopupNamespace("browser");
  await testPopupNamespace("chrome");
  await testBootstrapNamespace("browser");
  await testBootstrapNamespace("chrome");

  assert.throws(
    () => vm.runInNewContext(popupSource, { document: {} }, { filename: "popup.js" }),
    /requires the WebExtension tabs and scripting APIs/
  );
  assert.throws(
    () => vm.runInNewContext(bootstrapSource, {}, { filename: "proof_content_bootstrap.js" }),
    /requires the WebExtension runtime messaging API/
  );

  assert.equal(packageJson.dependencies?.["webextension-polyfill"], undefined);
  assert.equal(packageJson.devDependencies?.["webextension-polyfill"], undefined);
  assert.equal(packageLock.packages?.["node_modules/webextension-polyfill"], undefined);

  console.log("ARK Lens Firefox/Chrome Feed browser API boundary tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
