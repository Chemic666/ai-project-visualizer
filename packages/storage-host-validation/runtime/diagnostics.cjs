const failureCodes = new Set([
  "admission_rejected",
  "arguments_rejected",
  "binding_conflict",
  "development_disabled",
  "revision_conflict",
  "quota_exceeded",
  "VSIX_CONTENT_MISMATCH",
  "INSTALLED_IDENTITY",
  "INSTALLED_HASH",
  "CODE_TARGET_UNVERIFIED",
  "CODE_CLI_MISSING",
  "restart_local_root_unavailable",
  "restart_surface_unavailable",
  "package_FAILED",
  "install_FAILED",
  "archive_FAILED",
  "extension-host_FAILED",
  "write-extension-host_FAILED",
  "recover-extension-host_FAILED",
  "restart-sql-reader_FAILED",
  "coverage_conflict",
  "identity_conflict",
  "ownership_busy",
  "physical_binding_unverified",
  "stale_writer",
  "unavailable",
  "EACCES",
  "ENOENT",
  "ENOBUFS",
  "EPERM",
  "ERR_ASSERTION",
  "ETIMEDOUT",
]);
const signals = new Set(["SIGINT", "SIGTERM", "SIGKILL", "SIGBREAK", "SIGHUP"]);

function diagnostic(error) {
  const code =
    error !== null && typeof error === "object"
      ? Object.getOwnPropertyDescriptor(error, "code")?.value
      : undefined;
  const label =
    error !== null && typeof error === "object"
      ? Object.getOwnPropertyDescriptor(error, "message")?.value
      : undefined;
  return {
    status: "unavailable",
    code: failureCodes.has(code)
      ? code
      : failureCodes.has(label)
        ? label
        : "unavailable",
  };
}

function safeValidationError(code) {
  const error = new Error(
    "storage_host_validation_" +
      (failureCodes.has(code) ? code : "unavailable"),
  );
  error.code = failureCodes.has(code) ? code : "unavailable";
  error.stack = error.name + ": " + error.message;
  return error;
}

function processOutcome(result) {
  return {
    pid: result.pid ?? null,
    status: result.status,
    signal:
      result.signal === null
        ? null
        : signals.has(result.signal)
          ? result.signal
          : "other",
    error: result.error ? diagnostic(result.error).code : null,
    stdoutPresent: !!result.stdout?.length,
    stderrPresent: !!result.stderr?.length,
  };
}

module.exports = { diagnostic, safeValidationError, processOutcome };
