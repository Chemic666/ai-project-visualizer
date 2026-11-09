import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import {
  admitSyntheticRoot,
  inspectCapability,
} from "../src/host-admission.mjs";
import { openSyntheticStore } from "../src/development.mjs";
import { seed, input, cursor } from "./fixtures.mjs";

const spec = JSON.parse(
  fs.readFileSync(process.env.APV_STORAGE_TEST_SPEC, "utf8"),
);
const Database = createRequire(path.join(spec.driverRoot, "package.json"))(
  spec.driverRoot,
);
const core = await import(pathToFileURL(spec.corePath).href);
const native = spec.nativePackage !== undefined;
const options = {
  Database,
  applyNormalizedEvent: core.applyNormalizedEvent,
  processorFingerprint: spec.processorFingerprint,
  projectId: "PA",
  generation: "G1",
  bootstrap: seed(),
  ...(native ? { nativePackage: spec.nativePackage } : {}),
};
let roots = 0;
const save = (name, data) =>
  fs.writeFileSync(
    path.join(spec.evidence, name),
    JSON.stringify(data, null, 2),
    { flag: "wx" },
  );
const hash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function fresh() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apv-storage-slice-"));
  save(`synthetic-root-${++roots}.json`, { root, runId: spec.runId });
  const cap = admitSyntheticRoot({ enabled: true, root });
  return { root, cap, privateRoot: inspectCapability(cap).privateRoot };
}
function open(fixture, catalogBytes) {
  return openSyntheticStore(fixture.cap, {
    ...options,
    ...(catalogBytes === undefined ? {} : { limits: { catalogBytes } }),
  });
}
function denied(fixture, limit, code = "quota_exceeded") {
  let opened;
  try {
    assert.throws(
      () => {
        opened = open(fixture, limit);
      },
      { code },
    );
  } finally {
    opened?.close();
  }
}
// Independent read of closed, newly created fixtures. JSON field order does not
// affect byte count; this does not call the implementation's accounting helper.
function catalog(fixture) {
  const db = new Database(path.join(fixture.privateRoot, "catalog.sqlite"), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const bindings = db.prepare("SELECT * FROM bindings").all();
    const nativeTable = !!db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name='native_bindings'",
      )
      .get();
    const nativeRows = nativeTable
      ? db.prepare("SELECT * FROM native_bindings").all()
      : [];
    const bindingBytes = Buffer.byteLength(JSON.stringify(bindings));
    const nativeBytes = native
      ? Buffer.byteLength(JSON.stringify(nativeRows))
      : 0;
    return {
      bindings,
      nativeRows,
      nativeTable,
      bindingBytes,
      nativeBytes,
      bytes: bindingBytes + nativeBytes,
    };
  } finally {
    db.close();
  }
}
function request(store) {
  return {
    operationId: "op:E1",
    operationNonce: "nonce:E1",
    expectedHead: 1,
    writer: store.writer(),
    events: [input()],
    cursor: cursor(["E1"]),
  };
}

test(
  "catalog budget rejects before binding allocation and cannot raise the approved ceiling",
  { skip: native },
  () => {
    const fixture = fresh();
    denied(fixture, 1);
    const observed = catalog(fixture);
    assert.equal(observed.bindings.length, 0);
    assert.equal(
      fs.existsSync(path.join(fixture.privateRoot, "ownership")),
      false,
    );
    const empty = fresh();
    for (const limit of [8 * 1024 * 1024 + 1, 0, -1, 1.5, NaN, Infinity]) {
      denied(empty, limit, "admission_rejected");
      assert.equal(
        fs.existsSync(path.join(empty.privateRoot, "catalog.sqlite")),
        false,
      );
    }
    save("catalog-early-quota.json", {
      status: "quota_exceeded",
      allocatedBindings: 0,
      ownerCreated: false,
      ceilingRaiseRejected: true,
    });
  },
);

test(
  "catalog exact limit permits reopen; below it preserves authority bytes, receipt and cursor",
  { skip: native },
  () => {
    const fixture = fresh(),
      first = open(fixture);
    const committed = first.commit(request(first));
    const before = first.read(),
      paths = first.paths();
    first.close();
    const observed = catalog(fixture);
    const beforeHashes = Object.fromEntries(
      ["catalog", "owner", "project"].map((k) => [k, hash(paths[k])]),
    );
    denied(fixture, observed.bytes - 1);
    for (const key of Object.keys(beforeHashes))
      assert.equal(hash(paths[key]), beforeHashes[key]);
    const reopened = open(fixture, observed.bytes);
    try {
      assert.deepEqual(reopened.read(), before);
      const duplicate = reopened.commit(request(reopened));
      assert.equal(duplicate.status, "already_committed");
      assert.deepEqual(duplicate.receipt, committed.receipt);
      assert.deepEqual(duplicate.cursor, before.cursor);
    } finally {
      reopened.close();
    }
    save("catalog-existing-quota.json", {
      status: "pass",
      measuredBytes: observed.bytes,
      exactBoundaryAccepted: true,
      belowBoundaryRejected: true,
      authorityUnchangedOnRejection: true,
      head: before.head,
    });
  },
);

test(
  "catalog activation quota preserves an unavailable creating binding and its empty-input bootstrap",
  { skip: native },
  () => {
    const baseline = fresh(),
      initial = open(baseline);
    initial.close();
    const row = catalog(baseline).bindings[0];
    const creatingBytes = Buffer.byteLength(
      JSON.stringify([
        {
          ...row,
          lifecycle: "creating",
          owner_identity: null,
          project_identity: null,
        },
      ]),
    );
    const fixture = fresh();
    denied(fixture, creatingBytes + 1);
    const observed = catalog(fixture);
    assert.equal(observed.bindings.length, 1);
    assert.equal(observed.bindings[0].lifecycle, "creating");
    assert.ok(observed.bytes <= creatingBytes + 1);
    const key = observed.bindings[0].store_key;
    const projectFile = path.join(
      fixture.privateRoot,
      "projects",
      key,
      "G1/project.sqlite",
    );
    const db = new Database(projectFile, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      assert.equal(db.prepare("SELECT count(*) n FROM commits").get().n, 1);
      assert.equal(
        db.prepare("SELECT count(*) n FROM normalized_events").get().n,
        0,
      );
      assert.equal(
        db.prepare("SELECT count(*) n FROM source_checkpoint_versions").get().n,
        0,
      );
      assert.equal(
        db.prepare("SELECT writer_epoch FROM store_meta").get().writer_epoch,
        0,
      );
    } finally {
      db.close();
    }
    const owner = new Database(
      path.join(fixture.privateRoot, "ownership", key, "owner.sqlite"),
      { fileMustExist: true },
    );
    try {
      owner.exec("BEGIN IMMEDIATE; ROLLBACK");
    } finally {
      owner.close();
    }
    denied(fixture, undefined, "unavailable");
    save("catalog-activation-quota.json", {
      status: "quota_exceeded",
      lifecycle: "creating",
      bootstrapReceipts: 1,
      normalizedEvents: 0,
      cursorVersions: 0,
      writerEpoch: 0,
      ownerReleased: true,
      automaticRepair: false,
    });
  },
);

test(
  "native catalog rows count toward budget; rejected reopen changes no authority bytes",
  { skip: !native },
  () => {
    const fixture = fresh(),
      first = open(fixture);
    assert.equal(
      first.resourceBinding().actualDriverHandleIdentity,
      "main-confirmed-only",
    );
    const committed = first.commit(request(first));
    const before = first.read(),
      paths = first.paths();
    first.close();
    const observed = catalog(fixture);
    assert.equal(observed.nativeRows.length, 1);
    assert.ok(observed.nativeBytes > 2);
    const beforeHashes = Object.fromEntries(
      ["catalog", "owner", "project"].map((k) => [k, hash(paths[k])]),
    );
    denied(fixture, observed.bytes - 1);
    for (const key of Object.keys(beforeHashes))
      assert.equal(hash(paths[key]), beforeHashes[key]);
    const reopened = open(fixture, observed.bytes);
    try {
      assert.deepEqual(reopened.read(), before);
      assert.deepEqual(
        reopened.commit(request(reopened)).receipt,
        committed.receipt,
      );
    } finally {
      reopened.close();
    }
    save("catalog-native-existing-quota.json", {
      status: "pass",
      bindingBytes: observed.bindingBytes,
      nativeBytes: observed.nativeBytes,
      measuredBytes: observed.bytes,
      exactBoundaryAccepted: true,
      authorityUnchangedOnRejection: true,
    });
  },
);

test(
  "native-binding growth quota rolls back before Owner or Project SQLite initialization",
  { skip: !native },
  () => {
    const baseline = fresh(),
      initial = open(baseline);
    initial.close();
    const base = catalog(baseline),
      row = base.bindings[0];
    const creatingBytes = Buffer.byteLength(
      JSON.stringify([
        {
          ...row,
          lifecycle: "creating",
          owner_identity: null,
          project_identity: null,
        },
      ]),
    );
    const limit = creatingBytes + Math.floor(base.nativeBytes / 2);
    const fixture = fresh();
    denied(fixture, limit);
    const observed = catalog(fixture);
    assert.equal(observed.bindings[0].lifecycle, "creating");
    assert.equal(observed.nativeTable, false);
    assert.ok(observed.bytes <= limit);
    const key = observed.bindings[0].store_key;
    const ownerBytes = fs.statSync(
      path.join(fixture.privateRoot, "ownership", key, "owner.sqlite"),
    ).size;
    const projectBytes = fs.statSync(
      path.join(fixture.privateRoot, "projects", key, "G1/project.sqlite"),
    ).size;
    assert.equal(ownerBytes, 0);
    assert.equal(projectBytes, 0);
    denied(fixture, undefined, "unavailable");
    save("catalog-native-growth-quota.json", {
      status: "quota_exceeded",
      limit,
      retainedBytes: observed.bytes,
      lifecycle: "creating",
      nativeTableRolledBack: true,
      ownerBytes,
      projectBytes,
      automaticRepair: false,
    });
  },
);
