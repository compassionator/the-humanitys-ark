const fs = require("node:fs");
const path = require("node:path");

const runtime = require("../../lens-packs/lens_pack_runtime");
const root = path.resolve(__dirname, "..", "..");
const inputPath = path.join(root, "lens-packs", "bob_job_search.json");
const outputPath = path.join(root, "lens-packs", "bundled_lens_pack.js");
const lensPack = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const validation = runtime.validateLensPack(lensPack);

if (!validation.valid) {
  throw new Error(runtime.formatValidationErrors(validation, validation.errors.length));
}

const output = `// Generated from lens-packs/bob_job_search.json. Do not edit directly.\n` +
  `(function loadArkBundledLensPack(root) {\n` +
  `  root.ARK_BUNDLED_LENS_PACK = ${JSON.stringify(lensPack, null, 2)};\n` +
  `})(typeof globalThis !== "undefined" ? globalThis : this);\n`;

fs.writeFileSync(outputPath, output);
console.log("Built lens-packs/bundled_lens_pack.js");
