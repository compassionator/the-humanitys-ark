(function initArkJobContracts(root, factory) {
  const api = factory();

  if (root) root.ARK_JOB_CONTRACTS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArkJobContracts() {
  const STORAGE_KEYS = Object.freeze({
    ACTIVE_LENS_PACK_ID: "ark_lens_active_lens_pack_id",
    ADAPTER_PROFILE_LAST_KNOWN_GOOD: "ark_lens_adapter_profile_last_known_good",
    ADAPTER_PROFILE_OVERRIDES: "ark_lens_adapter_profile_overrides",
    ADAPTER_PROFILE_ROLLBACKS: "ark_lens_adapter_profile_rollbacks",
    LENS_PACKS: "ark_lens_packs",
    RECORDS: "ark_lens_records",
    SESSION: "ark_lens_session"
  });
  const MESSAGES = Object.freeze({
    ADAPTER_DIAGNOSTICS: "ARK_ADAPTER_DIAGNOSTICS",
    ADAPTER_DOCTOR_EXPORT_DEBUG: "ARK_ADAPTER_DOCTOR_EXPORT_DEBUG",
    ADAPTER_DOCTOR_EXPORT_PROFILE: "ARK_ADAPTER_DOCTOR_EXPORT_PROFILE",
    ADAPTER_DOCTOR_HEALTH_CHECK: "ARK_ADAPTER_DOCTOR_HEALTH_CHECK",
    ADAPTER_DOCTOR_STATUS: "ARK_ADAPTER_DOCTOR_STATUS",
    ADAPTER_DOCTOR_TEST_EXTRACTION: "ARK_ADAPTER_DOCTOR_TEST_EXTRACTION",
    ADAPTER_DOCTOR_TEST_REPAIR: "ARK_ADAPTER_DOCTOR_TEST_REPAIR",
    ADAPTER_DOCTOR_VALIDATE_REPAIR: "ARK_ADAPTER_DOCTOR_VALIDATE_REPAIR",
    CAPTURE_NOW: "ARK_CAPTURE_NOW",
    START_LISTENING: "ARK_START_LISTENING",
    STOP_LISTENING: "ARK_STOP_LISTENING"
  });
  const VERSIONS = Object.freeze({
    ADAPTER: "v2026.06.003",
    CONTENT_BUNDLE: "v2026.06.019-fixed-fit-columns",
    RECORD_SCHEMA: "v2026.06.001"
  });
  const SESSION = Object.freeze({
    ID_PREFIX: "session_",
    STOPPED_REASON_BROWSER_RESTART: "browser_restart"
  });

  return Object.freeze({ MESSAGES, SESSION, STORAGE_KEYS, VERSIONS });
});
