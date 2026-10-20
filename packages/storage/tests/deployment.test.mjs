import assert from "node:assert/strict";
import test from "node:test";
import * as resources from "../src/installed-resources.mjs";
test("O02/P03: checkout without installed sealed Native resources is unavailable", () => {
  assert.throws(() => resources.inspectInstalledResources(), {
    code: "unavailable",
  });
});
