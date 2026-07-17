const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { evaluate, extractFunction, plain } = require("./helpers/source-contracts");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const editorSource = read("lens-editor/editor.js");
const editorHtml = read("lens-editor/editor.html");
const popupSource = read("popup/popup.js");
const popupHtml = read("popup/popup.html");

function idsFromHtml(html) {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
}

function loadPureEditorApi() {
  const names = [
    "slugifyLensId",
    "makeUniqueLensId",
    "textToKeywords",
    "getBasicEditorSection",
    "createLensFromTemplate"
  ];

  return evaluate(names.map((name) => extractFunction(editorSource, name)).join("\n"), names);
}

function testConfigDrivenBasicSections() {
  const { getBasicEditorSection } = loadPureEditorApi();

  assert.equal(getBasicEditorSection({ id: "anything", editor_section: "job_preferences" }), "job_preferences");
  assert.equal(getBasicEditorSection({ id: "a", blocker: true }), "deal_breakers");
  assert.equal(getBasicEditorSection({ id: "b", penalty: 10 }), "prefer_to_avoid");
  assert.equal(getBasicEditorSection({ id: "c", role_fit_kind: "target" }), "target_roles");
  assert.equal(getBasicEditorSection({ id: "d", role_fit_kind: "adjacent" }), "related_roles");
  assert.equal(getBasicEditorSection({ id: "e", qualifies_role_fit: true }), "role_evidence");
  assert.equal(getBasicEditorSection({ id: "f", weight: 3 }), "strong_preferences");
}

function testLensCreationAndKeywordNormalization() {
  const {
    makeUniqueLensId,
    textToKeywords,
    createLensFromTemplate
  } = loadPureEditorApi();
  const template = {
    id: "default_lens",
    lens_pack_id: "default_lens",
    name: "Default Lens",
    version: "v2026.06.019",
    lens_pack_version: "v2026.06.019",
    signal_groups: { custom: [{ id: "rule", keywords: ["original"] }] }
  };
  const packs = { my_search: {}, "my_search-2": {} };

  assert.equal(makeUniqueLensId("My Search", packs), "my_search-3");
  assert.deepEqual(
    plain(textToKeywords(" Engineering Manager \nengineering manager\nHead of Product\n")),
    ["Engineering Manager", "Head of Product"]
  );

  const created = plain(createLensFromTemplate(template, "My Search", packs));
  assert.equal(created.id, "my_search-3");
  assert.equal(created.lens_pack_id, "my_search-3");
  assert.equal(created.name, "My Search");
  assert.equal(created.version, "v1.0.0");
  assert.equal(created.lens_pack_version, "v1.0.0");
  assert.deepEqual(created.signal_groups.custom[0].keywords, ["original"]);
  assert.equal(template.name, "Default Lens", "Template was mutated");
}

function testEditorSurfaceContracts() {
  const ids = idsFromHtml(editorHtml);
  [
    "lensSelect",
    "lensName",
    "newLens",
    "duplicateLens",
    "deleteLens",
    "basicTab",
    "advancedTab",
    "sourceOptions",
    "basicSections",
    "saveBasic",
    "advancedJson",
    "validateAdvanced",
    "saveAdvanced",
    "exportLens",
    "restoreBundled",
    "createLensDialog",
    "createLensName",
    "createLensBasis",
    "confirmCreateLens",
    "editorNotice"
  ].forEach((id) => assert.equal(ids.has(id), true, `Missing editor control ${id}`));

  assert.match(editorHtml, /Basic/);
  assert.match(editorHtml, /Advanced/);
  assert.match(editorHtml, /One phrase per line/);
  assert.doesNotMatch(editorSource, /\.innerHTML\s*=/);
  [...editorSource.matchAll(/getElementById\("([^"]+)"\)/g)].forEach((match) => {
    assert.equal(ids.has(match[1]), true, `Editor script references missing control ${match[1]}`);
  });
  assert.ok(
    editorHtml.indexOf("bundled_lens_pack.js") < editorHtml.indexOf("lens_pack_runtime.js") &&
      editorHtml.indexOf("lens_pack_runtime.js") < editorHtml.indexOf("editor.js"),
    "Editor scripts are not loaded in dependency order"
  );
}

function testPopupUsesDedicatedEditor() {
  const popupIds = idsFromHtml(popupHtml);

  assert.equal(popupIds.has("editLens"), true);
  assert.equal(popupIds.has("dynamicKeywordEditor"), false);
  assert.equal(popupIds.has("importLensJson"), false);
  assert.match(popupSource, /lens-editor\/editor\.html/);
  assert.doesNotMatch(popupSource, /getElementById\("saveKeywords"\)/);
  assert.doesNotMatch(popupSource, /getElementById\("importLens"\)/);
}

testConfigDrivenBasicSections();
testLensCreationAndKeywordNormalization();
testEditorSurfaceContracts();
testPopupUsesDedicatedEditor();

console.log("ARK Lens full-page editor contracts passed");
