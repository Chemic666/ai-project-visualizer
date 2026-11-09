import test from "node:test";
import assert from "node:assert/strict";

const api = await import("../src/local-root-diagnostics.mjs").catch(() => ({}));
const project = (value) => {
  assert.equal(typeof api.projectLocalRootDiagnostic, "function");
  return api.projectLocalRootDiagnostic(value);
};
const base = {
  ok: false,
  reason: "unavailable",
  diagnostic: { stage: "validation_root", category: "final_path_mismatch" },
};
const context = {
  packageIdentity: "present",
  finalPathRelation: "different",
  packageCacheSegments: "present",
};

test("root rejection preserves only bounded same-helper context and never exposes paths or identity", () => {
  const sentinel = "PRIVATE-ROOT-PACKAGE-SENTINEL";
  const result = project({
    ...base,
    requestedPath: sentinel,
    diagnostic: {
      ...base.diagnostic,
      message: sentinel,
      context: { ...context, packageFullName: sentinel, actualPath: sentinel },
    },
  });
  assert.deepEqual(result, {
    ...base,
    diagnostic: {
      ...base.diagnostic,
      context: { ...context, source: "helper-process" },
    },
  });
  assert.equal(JSON.stringify(result).includes(sentinel), false);
  assert.equal(result.ok, false);
});

test("legacy fixed-label failure keeps its exact public shape", () => {
  assert.deepEqual(project(base), base);
});

test("untrusted or missing base labels yield generic rejection without retaining context", () => {
  for (const value of [
    null,
    {},
    {
      diagnostic: {
        stage: "PRIVATE-SENTINEL",
        category: "final_path_mismatch",
        context,
      },
    },
    {
      diagnostic: {
        stage: "validation_root",
        category: "PRIVATE-SENTINEL",
        context,
      },
    },
  ])
    assert.deepEqual(project(value), {
      ok: false,
      reason: "unavailable",
      diagnostic: { stage: "helper", category: "helper_failed" },
    });
});

test("partial or unrecognized context cannot leak free text or guessed conclusions", () => {
  for (const invalid of [
    null,
    {},
    { ...context, packageIdentity: "PRIVATE-SENTINEL" },
    { ...context, finalPathRelation: "redirected-and-approved" },
    { ...context, packageCacheSegments: "PRIVATE-SENTINEL" },
  ])
    assert.deepEqual(
      project({
        ...base,
        diagnostic: { ...base.diagnostic, context: invalid },
      }),
      base,
    );
});

test("absence and unknown observations are retained without inventing package redirection", () => {
  const observed = {
    packageIdentity: "absent",
    finalPathRelation: "unavailable",
    packageCacheSegments: "unknown",
  };
  assert.deepEqual(
    project({ ...base, diagnostic: { ...base.diagnostic, context: observed } }),
    {
      ...base,
      diagnostic: {
        ...base.diagnostic,
        context: { ...observed, source: "helper-process" },
      },
    },
  );
});

test("case-only mismatch remains a refusal and never becomes a capability or success", () => {
  const result = project({
    ok: true,
    reason: "approved",
    root: "PRIVATE-SENTINEL",
    diagnostic: {
      ...base.diagnostic,
      context: {
        packageIdentity: "unknown",
        finalPathRelation: "case_only",
        packageCacheSegments: "absent",
      },
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "unavailable");
  assert.equal(result.root, undefined);
  assert.equal(result.diagnostic.context.finalPathRelation, "case_only");
});
