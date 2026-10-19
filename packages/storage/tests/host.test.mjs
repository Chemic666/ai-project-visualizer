import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openProductionStore } from "../src/index.mjs";
import {
  admitSyntheticRoot,
  inspectCapability,
} from "../src/host-admission.mjs";

test("P03/O02: production stays disabled even when caller requests enablement", () => {
  assert.deepEqual(
    openProductionStore({ enabled: true, root: process.cwd() }),
    { status: "unavailable", reason: "physical_binding_unverified" },
  );
  assert.throws(
    () => admitSyntheticRoot({ enabled: false, root: process.cwd() }),
    { code: "development_disabled" },
  );
  assert.throws(
    () => admitSyntheticRoot({ enabled: true, root: process.cwd() }),
    { code: "admission_rejected" },
  );
  assert.throws(() => inspectCapability({}), { code: "admission_rejected" });
});
test("P03: real local NTFS check, exclusive synthetic root and reopen identity", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apv-storage-slice-"));
  const cap = admitSyntheticRoot({ enabled: true, root });
  const info = inspectCapability(cap);
  assert.equal(info.bindingAssurance, "synthetic-path-metadata-only");
  assert.equal(info.productionWriteEnabled, false);
  assert.equal(info.fileSystem, "NTFS");
  assert.throws(() => admitSyntheticRoot({ enabled: true, root }), {
    code: "admission_rejected",
  });
  const reopened = admitSyntheticRoot({
    enabled: true,
    root,
    reopen: true,
    expectedNonce: info.nonce,
  });
  assert.equal(inspectCapability(reopened).nonce, info.nonce);
  assert.throws(
    () =>
      admitSyntheticRoot({
        enabled: true,
        root,
        reopen: true,
        expectedNonce: "wrong",
      }),
    { code: "binding_conflict" },
  );
  fs.renameSync(info.observedRoot, info.observedRoot + "-moved");
  assert.throws(() => inspectCapability(cap), { code: "binding_conflict" });
});
