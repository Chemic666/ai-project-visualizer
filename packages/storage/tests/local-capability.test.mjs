import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import * as roots from "../src/local-storage-root.mjs";
import * as admission from "../src/host-admission.mjs";
import { openProductionStore } from "../src/index.mjs";

test("P03/O02: diagnostic failures expose fixed categories, never caller data", () => {
  assert.equal(typeof roots.diagnoseLocalValidationRoot, "function");
  const input = "PRIVATE-RAW-PATH-OR-ERROR";
  const result = roots.diagnoseLocalValidationRoot({ runId: input });
  assert.deepEqual(result, {
    ok: false,
    reason: "unavailable",
    diagnostic: { stage: "request", category: "invalid_request" },
  });
  assert(!JSON.stringify(result).includes(input));
});
test("P03/O01-a: local validation capability requires explicit admission and complete scope", () => {
  assert.equal(typeof admission.admitLocalValidationRoot, "function");
  assert.throws(() => admission.admitLocalValidationRoot(), {
    code: "development_disabled",
  });
  for (const options of [
    {},
    { runId: "../escape" },
    { runId: randomUUID(), root: process.cwd() },
    {
      runId: randomUUID(),
      root: process.cwd(),
      projectId: "PA",
      generation: "G1",
      storeKey: randomUUID(),
    },
    {
      runId: randomUUID(),
      root: process.cwd(),
      projectId: "PA",
      generation: "G1",
      storeKey: "invalid",
    },
  ])
    assert.throws(
      () => admission.admitLocalValidationRoot({ enabled: true, ...options }),
      (error) => {
        assert(
          ["admission_rejected", "binding_conflict", "unavailable"].includes(
            error.code,
          ),
        );
        assert(!error.message.includes(process.cwd()));
        return true;
      },
    );
  assert.throws(
    () => admission.inspectCapability({ mode: "local-validation-development" }),
    { code: "admission_rejected" },
  );
});
test("P03/O02: production stays unavailable after local capability integration", () => {
  assert.deepEqual(openProductionStore({ enabled: true }), {
    status: "unavailable",
    reason: "physical_binding_unverified",
  });
});
