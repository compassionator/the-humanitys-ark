const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  evaluate,
  extractFunction,
  extractObjectDeclaration,
  plain
} = require("./helpers/source-contracts");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const contentSource = read("content_bundle.js");
const popupSource = read("popup/popup.js");
const popupHtml = read("popup/popup.html");
const repairSchema = JSON.parse(read("schemas/adapter-profile.schema.json"));
const linkedInJobsAdapterRuntime = require("../sources/jobs/linkedin_jobs_adapter.js");
const seekJobsAdapterRuntime = require("../sources/jobs/seek_jobs_adapter.js");

function idsFromHtml(html) {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
}

function loadDoctorContractApi() {
  const names = [
    "isPlainObject",
    "validateAdapterStringArray",
    "validateAdapterSelector",
    "validateAdapterRepairProfile",
    "formatAdapterRepairValidationErrors",
    "redactUrlForHelpFile",
    "redactPersonalText"
  ];
  const source = [
    extractObjectDeclaration(contentSource, "DEFAULT_ADAPTER_PROFILES"),
    ...names.map((name) => extractFunction(contentSource, name))
  ].join("\n");
  const document = {
    querySelector(selector) {
      if (selector.includes("[broken")) throw new Error("Invalid selector");
      return null;
    }
  };

  return evaluate(source, [...names, "DEFAULT_ADAPTER_PROFILES"], {
    document,
    URL,
    LINKEDIN_JOBS_ADAPTER_RUNTIME: linkedInJobsAdapterRuntime,
    SEEK_JOBS_ADAPTER_RUNTIME: seekJobsAdapterRuntime
  });
}

function loadRepairLifecycleApi() {
  const names = [
    "createRepairActivationState",
    "createRepairRollbackState",
    "summarizeRepairChanges"
  ];
  return evaluate(names.map((name) => extractFunction(popupSource, name)).join("\n"), names);
}

function testStrictRepairProfileContract() {
  const api = loadDoctorContractApi();
  const linkedIn = plain(api.DEFAULT_ADAPTER_PROFILES.linkedin_jobs);
  const seek = plain(api.DEFAULT_ADAPTER_PROFILES.seek_jobs);

  assert.deepEqual(plain(api.validateAdapterRepairProfile(linkedIn, "linkedin_jobs")), {
    valid: true,
    errors: []
  });
  assert.equal(api.validateAdapterRepairProfile(seek, "seek_jobs").valid, true);

  const wrongAdapter = structuredClone(linkedIn);
  wrongAdapter.adapter_id = "seek_jobs";
  assert.equal(api.validateAdapterRepairProfile(wrongAdapter, "linkedin_jobs").valid, false);

  const partial = { adapter_id: "linkedin_jobs", fields: {} };
  const partialResult = plain(api.validateAdapterRepairProfile(partial, "linkedin_jobs"));
  assert.equal(partialResult.valid, false);
  assert.match(api.formatAdapterRepairValidationErrors(partialResult, 20), /\$\.id/);
  assert.match(api.formatAdapterRepairValidationErrors(partialResult, 20), /fields\.title/);

  const unknownField = structuredClone(linkedIn);
  unknownField.notes = "silently accepted data is unsafe";
  assert.match(
    api.formatAdapterRepairValidationErrors(
      api.validateAdapterRepairProfile(unknownField, "linkedin_jobs"),
      20
    ),
    /\$\.notes: is not allowed/
  );

  const hashedSelector = structuredClone(linkedIn);
  hashedSelector.fields.title = ["._662f01e9"];
  assert.match(
    api.formatAdapterRepairValidationErrors(
      api.validateAdapterRepairProfile(hashedSelector, "linkedin_jobs"),
      20
    ),
    /hashed class name/
  );

  const malformedSelector = structuredClone(linkedIn);
  malformedSelector.fields.title = ["[broken"];
  assert.match(
    api.formatAdapterRepairValidationErrors(
      api.validateAdapterRepairProfile(malformedSelector, "linkedin_jobs"),
      20
    ),
    /valid CSS selector/
  );

  const invalidQueryParam = structuredClone(linkedIn);
  invalidQueryParam.job_id.query_params = ["currentJobId&token=secret"];
  assert.match(
    api.formatAdapterRepairValidationErrors(
      api.validateAdapterRepairProfile(invalidQueryParam, "linkedin_jobs"),
      20
    ),
    /query parameter name/
  );
}

function testMachineReadableRepairSchema() {
  assert.equal(repairSchema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(repairSchema.additionalProperties, false);
  assert.deepEqual(
    repairSchema.required,
    ["id", "adapter_id", "version", "display_name", "item_type", "fields", "job_id", "readiness"]
  );
  assert.equal(repairSchema.properties.fields.additionalProperties, false);
  assert.equal(repairSchema.properties.job_id.additionalProperties, false);
}

function testHelpFileRedaction() {
  const { redactUrlForHelpFile, redactPersonalText } = loadDoctorContractApi();

  assert.equal(
    redactUrlForHelpFile("https://www.linkedin.com/jobs/view/123/?trackingId=secret&token=abc#private"),
    "https://www.linkedin.com/jobs/view/123/"
  );
  assert.equal(
    redactPersonalText("Email jane@example.com or call +61 412 345 678 for the role"),
    "Email [redacted email] or call [redacted phone] for the role"
  );
  assert.match(contentSource, /ark_adapter_help_file_schema_version:\s*"1\.0\.0"/);
  assert.match(contentSource, /query parameters/);
  assert.doesNotMatch(contentSource, /page_url:\s*location\.href/);
}

function testTestBeforeActivationAndRollbackState() {
  const {
    createRepairActivationState,
    createRepairRollbackState,
    summarizeRepairChanges
  } = loadRepairLifecycleApi();
  const overrides = { linkedin_jobs: { id: "old" } };
  const rollbacks = {};
  const lastKnownGood = {
    linkedin_jobs: {
      adapter_id: "linkedin_jobs",
      profile: { id: "known_good" },
      profile_source: "override",
      verified_at: "2026-07-15T00:00:00.000Z"
    }
  };
  const activation = plain(createRepairActivationState(
    overrides,
    rollbacks,
    lastKnownGood,
    "linkedin_jobs",
    { id: "candidate" },
    { id: "current" },
    "override"
  ));

  assert.deepEqual(activation.overrides.linkedin_jobs, { id: "candidate" });
  assert.deepEqual(activation.rollbacks.linkedin_jobs.profile, { id: "known_good" });
  assert.equal(activation.rollbacks.linkedin_jobs.profile_source, "override");
  assert.deepEqual(overrides.linkedin_jobs, { id: "old" }, "Activation mutated existing storage");

  const rolledBack = plain(createRepairRollbackState(
    activation.overrides,
    activation.rollbacks,
    "linkedin_jobs"
  ));
  assert.deepEqual(rolledBack.overrides.linkedin_jobs, { id: "known_good" });
  assert.equal(rolledBack.rollbacks.linkedin_jobs, undefined);

  const defaultRollback = plain(createRepairRollbackState(
    { seek_jobs: { id: "candidate" } },
    { seek_jobs: { profile: { id: "seek_default" }, profile_source: "default" } },
    "seek_jobs"
  ));
  assert.equal(defaultRollback.overrides.seek_jobs, undefined);

  assert.deepEqual(plain(summarizeRepairChanges(
    {
      fields: { title: ["h1"], company: [".company"] },
      job_id: { query_params: ["jobId"] },
      readiness: { min_description_length: 50 }
    },
    {
      fields: { title: ["[data-job-title]"], company: [".company"] },
      job_id: { query_params: ["jobId"] },
      readiness: { min_description_length: 80 }
    }
  )), {
    changed_fields: ["title"],
    job_identity_changed: false,
    readiness_changed: true
  });
}

function testNonTechnicalDoctorSurface() {
  const ids = idsFromHtml(popupHtml);
  [
    "doctorExportDebug",
    "doctorHelpPreview",
    "doctorHelpSummary",
    "doctorDownloadHelp",
    "doctorCancelHelp",
    "doctorRepairJson",
    "doctorPreviewRepair",
    "doctorRepairPreview",
    "doctorRepairValidation",
    "doctorTestRepair",
    "doctorActivateRepair",
    "doctorCancelRepair",
    "doctorRollback"
  ].forEach((id) => assert.equal(ids.has(id), true, `Missing Doctor safety control ${id}`));

  assert.match(popupHtml, /Fix Capture/);
  assert.match(popupHtml, /Repair File/);
  assert.match(popupHtml, /Preview Help File/);
  assert.doesNotMatch(popupHtml, /id="doctorImportProfile"/);
  assert.match(popupSource, /ARK_ADAPTER_DOCTOR_VALIDATE_REPAIR/);
  assert.match(popupSource, /ARK_ADAPTER_DOCTOR_TEST_REPAIR/);
  assert.match(popupSource, /can_activate/);
  assert.match(contentSource, /health === "pass"/);
}

testStrictRepairProfileContract();
testMachineReadableRepairSchema();
testHelpFileRedaction();
testTestBeforeActivationAndRollbackState();
testNonTechnicalDoctorSurface();

console.log("ARK Lens Adapter Doctor safety contracts passed");
