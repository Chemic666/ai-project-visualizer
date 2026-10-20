import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const unavailable = () => ({ ok: false, reason: "unavailable" });
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function invoke(mode, runId, root, reopen = false, diagnostics = false) {
  if (process.platform !== "win32" || process.arch !== "x64")
    return unavailable();
  try {
    const args = [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      fileURLToPath(new URL("./windows-private-root.ps1", import.meta.url)),
      "-Mode",
      mode,
    ];
    if (runId !== undefined) args.push("-RunId", runId);
    if (root !== undefined) args.push("-Target", root);
    if (reopen) args.push("-Reopen");
    if (diagnostics) args.push("-Diagnostics");
    const result = spawnSync(
      path.win32.join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      ),
      args,
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 20000,
        maxBuffer: 1024 * 1024,
      },
    );
    if (result.status !== 0 || result.error) {
      if (diagnostics) {
        try {
          return safeDiagnostic(
            JSON.parse(result.stdout.replace(/^\uFEFF/, "")),
          );
        } catch {}
        return diagnosticFailure("helper", "helper_failed");
      }
      return unavailable();
    }
    const proof = JSON.parse(result.stdout.replace(/^\uFEFF/, ""));
    if (proof.ok !== true) return unavailable();
    return proof;
  } catch {
    return unavailable();
  }
}

// This resolver describes the production location; it never creates or opens it.
export function deriveStorageLocation() {
  return invoke("Resolve");
}

// Only the separate per-run validation namespace is eligible for creation here.
export function prepareLocalValidationRoot(options = {}) {
  if (options === null || typeof options !== "object") return unavailable();
  const { runId, reopen = false } = options;
  if (
    typeof runId !== "string" ||
    !uuid.test(runId) ||
    typeof reopen !== "boolean"
  )
    return unavailable();
  return invoke("Prepare", runId, undefined, reopen);
}

export function inspectLocalValidationRoot(root, runId) {
  if (
    typeof runId !== "string" ||
    !uuid.test(runId) ||
    typeof root !== "string" ||
    root.includes("\0") ||
    !/^[A-Z]:\\/.test(root) ||
    root.includes("/") ||
    path.win32.resolve(root) !== root
  )
    return unavailable();
  return invoke("Inspect", runId, root);
}

const stages = new Set([
  "request",
  "known_folder",
  "native_probe",
  "volume",
  "ancestors",
  "anchor_acl",
  "application",
  "validation_parent",
  "validation_root",
  "private_root",
  "observed_root",
  "tree",
  "helper",
]);
const categories = new Set([
  "invalid_request",
  "helper_failed",
  "operation_failed",
  "access_denied",
  "final_path_mismatch",
  "reparse_point",
  "hard_link",
  "metadata_unavailable",
  "unsupported_volume",
  "path_not_canonical",
  "volume_or_type_mismatch",
  "acl_owner_or_protection",
  "acl_descriptor_invalid",
  "acl_untrusted_ace",
  "acl_missing_user_control",
  "already_exists",
]);
const diagnosticFailure = (stage, category) => ({
  ok: false,
  reason: "unavailable",
  diagnostic: { stage, category },
});
function safeDiagnostic(value) {
  const d = value?.diagnostic;
  return d && stages.has(d.stage) && categories.has(d.category)
    ? diagnosticFailure(d.stage, d.category)
    : diagnosticFailure("helper", "helper_failed");
}
// Explicit diagnostic surface for synthetic admission only. Never emits raw errors.
export function diagnoseLocalValidationRoot(options = {}) {
  if (
    !options ||
    typeof options !== "object" ||
    typeof options.runId !== "string" ||
    !uuid.test(options.runId) ||
    (options.reopen !== undefined && typeof options.reopen !== "boolean")
  )
    return diagnosticFailure("request", "invalid_request");
  return invoke(
    "Prepare",
    options.runId,
    undefined,
    options.reopen ?? false,
    true,
  );
}
