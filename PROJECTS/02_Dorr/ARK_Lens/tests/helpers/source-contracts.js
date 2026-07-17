const assert = require("node:assert/strict");
const vm = require("node:vm");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);

  const braceStart = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }

    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`Unterminated function ${name}`);
}

function extractObjectDeclaration(source, name) {
  const start = source.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `Missing declaration ${name}`);

  const braceStart = source.indexOf("{", start);
  assert.notEqual(braceStart, -1, `Missing object body for ${name}`);
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }

    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const semicolon = source.indexOf(";", index);
        return source.slice(start, semicolon + 1);
      }
    }
  }

  throw new Error(`Unterminated declaration ${name}`);
}

function evaluate(source, exports, globals = {}) {
  const context = { ...globals };
  vm.runInNewContext(
    `${source}\nthis.__arkExports = { ${exports.join(", ")} };`,
    context
  );
  return context.__arkExports;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  evaluate,
  extractFunction,
  extractObjectDeclaration,
  plain
};
