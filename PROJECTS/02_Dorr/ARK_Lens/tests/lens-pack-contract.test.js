const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const runtime = require("../lens-packs/lens_pack_runtime");
const root = path.resolve(__dirname, "..");
const readJson = (relativePath) => JSON.parse(
  fs.readFileSync(path.join(root, relativePath), "utf8")
);
const canonical = readJson("lens-packs/bob_job_search.json");
const schema = readJson("schemas/lens-pack.schema.json");

function stripV1Metadata(lensPack) {
  const legacy = runtime.clone(lensPack);
  delete legacy.lens_pack_schema_version;
  delete legacy.scoring_policy;

  Object.values(legacy.signal_groups).flat().forEach((signal) => {
    [
      "display_name",
      "blocker",
      "qualifies_role_fit",
      "role_fit_kind",
      "score_cap",
      "score_floor",
      "score_floor_when",
      "force_score",
      "force_workflow_state",
      "keyword_score_floor",
      "outcome_reason",
      "reason_priority"
    ].forEach((field) => delete signal[field]);
  });

  return legacy;
}

function testCanonicalSchemaContract() {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.lens_pack_schema_version.const, "1.0.0");
  assert.deepEqual(runtime.validateLensPack(canonical), { valid: true, errors: [] });
}

function testStructuredPreferencesAreScoreNeutralByDefault() {
  const preferences = canonical.signal_groups.job_preferences;

  assert.equal(Array.isArray(preferences), true);
  assert.deepEqual(
    preferences.map((signal) => signal.id),
    [
      "preferred_locations",
      "preferred_seniority",
      "preferred_work_arrangements",
      "preferred_employment_types"
    ]
  );
  preferences.forEach((signal) => {
    assert.deepEqual(signal.keywords, []);
    assert.equal(signal.editor_section, "job_preferences");
    assert.equal(signal.qualifies_role_fit, false);
  });
}

function testGeneratedBundleParity() {
  const source = fs.readFileSync(path.join(root, "lens-packs", "bundled_lens_pack.js"), "utf8");
  const context = {};
  vm.runInNewContext(source, context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.ARK_BUNDLED_LENS_PACK)), canonical);
}

function testLegacyMigrationPreservesUserEdits() {
  const legacy = stripV1Metadata(canonical);
  const leadership = legacy.signal_groups.must_have.find(
    (signal) => signal.id === "leadership_title"
  );
  leadership.keywords = ["chief builder", ...leadership.keywords];
  leadership.weight = 41;
  legacy.supported_source_adapters = ["seek_jobs"];
  legacy.active_source_adapter = "seek_jobs";
  legacy.signal_groups.custom_preferences = [{
    id: "community_impact",
    keywords: ["community impact"],
    weight: 4,
    reason: "Community impact"
  }];

  const migrated = runtime.migrateLensPack(legacy, canonical);
  const validation = runtime.validateLensPack(migrated);
  const migratedLeadership = migrated.signal_groups.must_have.find(
    (signal) => signal.id === "leadership_title"
  );
  const custom = migrated.signal_groups.custom_preferences[0];

  assert.equal(validation.valid, true, runtime.formatValidationErrors(validation));
  assert.equal(migrated.lens_pack_schema_version, "1.0.0");
  assert.equal(migratedLeadership.weight, 41);
  assert.equal(migratedLeadership.keywords[0], "chief builder");
  assert.equal(migratedLeadership.score_floor, 82);
  assert.equal(migratedLeadership.role_fit_kind, "target");
  assert.deepEqual(migrated.supported_source_adapters, ["seek_jobs"]);
  assert.equal(migrated.active_source_adapter, "seek_jobs");
  assert.equal(custom.display_name, "Community Impact");
  assert.equal(custom.match_scope, "all");
  assert.equal(custom.blocker, false);
  assert.equal(custom.qualifies_role_fit, false);
  assert.equal(custom.role_fit_kind, "context");
}

function testReadableValidationErrors() {
  const invalid = runtime.clone(canonical);
  invalid.signal_groups.must_have[0].match_scope = "somewhere vague";
  invalid.signal_groups.must_have[0].force_workflow_state = "maybe";
  invalid.signal_groups.nice_to_have[0].id = invalid.signal_groups.must_have[0].id;
  invalid.scoring_policy.thresholds.apply_min = 120;
  invalid.scoring_policy.confidence.blocker = 2;
  delete invalid.scoring_policy.reasons.strong_target;
  const validation = runtime.validateLensPack(invalid);
  const message = runtime.formatValidationErrors(validation, 10);

  assert.equal(validation.valid, false);
  assert.match(message, /match_scope/);
  assert.match(message, /duplicates signal id/);
  assert.match(message, /apply_min/);
  assert.match(message, /force_workflow_state/);
  assert.match(message, /confidence\.blocker/);
  assert.match(message, /reasons\.strong_target/);
  assert.match(message, /must be a number from 0 to 100/);
}

function testInvalidRootDoesNotSurviveMigration() {
  const migrated = runtime.migrateLensPack({ id: "broken" }, canonical);
  assert.deepEqual(migrated, canonical);
}

function testStorageMigrationPreservesPacksAndRepairsActiveId() {
  const legacy = stripV1Metadata(canonical);
  legacy.name = "My edited Lens";
  legacy.signal_groups.must_have[0].keywords = [];
  delete legacy.signal_groups.job_preferences;
  const custom = runtime.clone(legacy);
  custom.id = "custom_lens";
  custom.lens_pack_id = "custom_lens";
  custom.name = "Custom Lens";
  const migrated = runtime.migrateLensPackStorage(
    { bob_job_search: legacy, custom_lens: custom },
    "missing_lens",
    canonical
  );

  assert.equal(migrated.activeId, "bob_job_search");
  assert.equal(migrated.packs.bob_job_search.name, "My edited Lens");
  assert.deepEqual(migrated.packs.bob_job_search.signal_groups.must_have[0].keywords, []);
  assert.equal(migrated.packs.bob_job_search.signal_groups.job_preferences.length, 4);
  assert.deepEqual(migrated.packs.bob_job_search.signal_groups.job_preferences[0].keywords, []);
  assert.equal(migrated.packs.custom_lens.name, "Custom Lens");
  assert.equal(runtime.validateLensPack(migrated.packs.bob_job_search).valid, true);
  assert.equal(migrated.changed, true);
}

function testIndependentCustomPackDoesNotInheritBundledRules() {
  const custom = runtime.clone(canonical);
  custom.id = "independent_custom";
  custom.lens_pack_id = "independent_custom";
  custom.name = "Independent Custom";
  custom.signal_groups = {
    custom_rules: [{
      id: "custom_rule",
      display_name: "Custom rule",
      keywords: ["special phrase"],
      match_scope: "all",
      weight: 5,
      blocker: false,
      qualifies_role_fit: false,
      role_fit_kind: "context",
      reason: "Custom preference"
    }]
  };

  const migrated = runtime.migrateLensPack(custom, canonical);
  assert.deepEqual(Object.keys(migrated.signal_groups), ["custom_rules"]);
  assert.equal(runtime.validateLensPack(migrated).valid, true);
}

function testLegacyBundledNameMigratesToPublicDefault() {
  const legacy = runtime.clone(canonical);
  legacy.name = "Bob Job Search";
  legacy.description = "Scores jobs against Bob's job-search preferences.";
  const migrated = runtime.migrateLensPack(legacy, canonical);

  assert.equal(canonical.name, "My Job Search");
  assert.equal(migrated.name, "My Job Search");
  assert.equal(migrated.description, "Scores jobs against your job-search preferences.");
}

testCanonicalSchemaContract();
testStructuredPreferencesAreScoreNeutralByDefault();
testGeneratedBundleParity();
testLegacyMigrationPreservesUserEdits();
testReadableValidationErrors();
testInvalidRootDoesNotSurviveMigration();
testStorageMigrationPreservesPacksAndRepairsActiveId();
testIndependentCustomPackDoesNotInheritBundledRules();
testLegacyBundledNameMigratesToPublicDefault();

console.log("ARK Lens Pack schema, bundle, validation, and migration tests passed");
