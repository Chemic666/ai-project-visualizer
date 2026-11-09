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
// Only fixed labels from the helper's JSON may cross the diagnostic boundary.
// Context is observation, never a root, identity proof or admission capability.
export function projectLocalRootDiagnostic(value) {
  const d = value?.diagnostic;
  if (!d || !stages.has(d.stage) || !categories.has(d.category))
    return {
      ok: false,
      reason: "unavailable",
      diagnostic: { stage: "helper", category: "helper_failed" },
    };
  const diagnostic = { stage: d.stage, category: d.category };
  const c = d.context;
  if (
    c &&
    ["present", "absent", "unknown"].includes(c.packageIdentity) &&
    ["case_only", "different", "unavailable"].includes(c.finalPathRelation) &&
    ["present", "absent", "unknown"].includes(c.packageCacheSegments)
  )
    diagnostic.context = {
      source: "helper-process",
      packageIdentity: c.packageIdentity,
      finalPathRelation: c.finalPathRelation,
      packageCacheSegments: c.packageCacheSegments,
    };
  return { ok: false, reason: "unavailable", diagnostic };
}
