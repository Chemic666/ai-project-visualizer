"use strict";
// Targeted memory-only checks. No Runner, fault DLL or on-disk SQLite opens.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const worker = require("./worker.cjs");
const checks = require("./checks.cjs");
// A staged review copy may use the installed project's unchanged Driver paths.
// This test-only setting never changes Worker/preflight admission.
const driver = (
  process.env.APV_ARM_DRIVER_CHECKS
    ? require(process.env.APV_ARM_DRIVER_CHECKS)
    : checks
).driverPaths();
assert.equal(JSON.parse(fs.readFileSync(driver.package)).version, "13.0.3");
const Database = require(driver.base);
const options = { nativeBinding: driver.native };
const memory = () => new Database(":memory:", options);
const args = (epoch) => [
  "G2-W",
  "run",
  "worker",
  "operation",
  "target",
  "PA",
  "GEN-1",
  epoch,
  "intent",
  "digest",
];
function boundary() {
  assert.equal(
    typeof worker.armCandidate,
    "function",
    "Worker must expose its actual ARM call boundary",
  );
  return worker.armCandidate;
}
test("Driver binds Number as REAL and BigInt as INTEGER on SQLite 3.53.4", () => {
  const db = memory();
  try {
    assert.equal(db.prepare("SELECT sqlite_version() AS v").get().v, "3.53.4");
    const q = db.prepare("SELECT typeof(?) AS storageClass");
    const evidence = {
      number: q.get(1).storageClass,
      bigint: q.get(1n).storageClass,
    };
    assert.deepEqual(evidence, { number: "real", bigint: "integer" });
    console.log("BINDING_EVIDENCE " + JSON.stringify(evidence));
  } finally {
    db.close();
  }
});
for (const value of [1, 1n])
  test(`Worker converts ${typeof value} epoch to the strict INTEGER/1 predicate`, () => {
    const arm = boundary(),
      db = memory();
    try {
      // Intercept only the SQL name; run the real Driver binding and equivalent
      // type/value predicate. This does not emulate full native ARM admission.
      const target = {
        prepare(sql) {
          assert.equal(sql, "SELECT apv_g2_arm(?,?,?,?,?,?,?,?,?,?) AS x");
          return {
            get(...bound) {
              assert.equal(bound[7], 1n);
              return db
                .prepare("SELECT (typeof(?)='integer' AND ?=1) AS x")
                .get(bound[7], bound[7]);
            },
          };
        },
      };
      assert.equal(arm(target, args(value), {}), 1);
    } finally {
      db.close();
    }
  });
for (const value of [
  Number.MAX_SAFE_INTEGER + 1,
  NaN,
  Infinity,
  1.5,
  -1,
  0,
  2,
  Number.MAX_SAFE_INTEGER,
  -1n,
  0n,
  2n,
  9223372036854775808n,
  "1",
  null,
  undefined,
  true,
])
  test(`invalid epoch rejected before preparing native SQL: ${typeof value}/${String(value)}`, () => {
    const arm = boundary();
    let prepared = false;
    assert.throws(
      () =>
        arm(
          {
            prepare() {
              prepared = true;
              throw new Error("native SQL must not be prepared");
            },
          },
          args(value),
          {},
        ),
      /EPOCH_/,
    );
    assert.equal(prepared, false);
  });
function failingArm({
  rollbackFails = false,
  closeFails = false,
  probeFails = false,
  receiptFails = false,
  settled = false,
  failInGet = false,
  stateFails = false,
} = {}) {
  const arm = boundary(),
    db = memory(),
    monitor = memory(),
    rows = [],
    calls = [];
  db.exec("CREATE TABLE bundle(id); BEGIN; INSERT INTO bundle VALUES(1)");
  if (settled) db.exec("ROLLBACK");
  let original, observedBeforeClose;
  const target = {
    get open() {
      return db.open;
    },
    get inTransaction() {
      if (stateFails) throw new Error("transaction observation unavailable");
      return db.inTransaction;
    },
    prepare(sql) {
      calls.push("arm");
      const fail = () => {
        try {
          return db.prepare(sql);
        } catch (e) {
          original = e;
          throw e;
        }
      };
      return failInGet ? { get: fail } : fail();
    },
    exec(sql) {
      calls.push(sql);
      if (rollbackFails) throw new Error("rollback unavailable");
      return db.exec(sql);
    },
    close() {
      calls.push("close");
      observedBeforeClose = {
        active: db.inTransaction,
        count: db.prepare("SELECT count(*) AS n FROM bundle").get().n,
      };
      if (closeFails) throw new Error("close unavailable");
      db.close();
    },
  };
  let thrown;
  try {
    arm(target, args(1), {
      monitor,
      receipt(type, data) {
        if (receiptFails) throw new Error("receipt unavailable");
        rows.push(JSON.parse(JSON.stringify({ type, ...data })));
      },
      info() {
        if (probeFails) throw new Error("native info unavailable");
        return { autocommit: db.inTransaction ? 0 : 1 };
      },
      status() {
        throw new Error("no fault DLL loaded in this test");
      },
      extract() {
        throw new Error("no native event source in this test");
      },
    });
  } catch (e) {
    thrown = e;
  } finally {
    if (db.open) db.close();
    if (monitor.open) monitor.close();
  }
  assert(original, "real SQLite missing-function error must be observed");
  assert.equal(
    thrown,
    original,
    "cleanup must preserve original exception identity",
  );
  assert.equal(thrown.code, "SQLITE_ERROR");
  return { rows, calls, original, observedBeforeClose };
}
test("ARM exception is recorded first, real transaction rolled back/closed, outcome stays unavailable", () => {
  const { rows, calls, original, observedBeforeClose } = failingArm();
  assert.equal(rows[0].type, "arm-error-before-cleanup");
  assert.equal(rows[0].error.message, original.message);
  assert.equal(rows[0].error.stack, original.stack);
  assert.deepEqual(calls, ["arm", "ROLLBACK", "close"]);
  assert.deepEqual(observedBeforeClose, { active: false, count: 0 });
  assert.equal(
    rows.find((r) => r.type === "arm-transaction-state-after-error-return")
      .value.transactionActive,
    true,
  );
  assert.equal(
    rows.find((r) => r.type === "arm-rollback-return").value.transactionActive,
    false,
  );
  assert.equal(
    rows.find((r) => r.type === "arm-close-return").value.open,
    false,
  );
  const end = rows.at(-1);
  assert.equal(end.type, "arm-failure-unavailable");
  assert.equal(end.outcome, "unavailable");
  for (const name of ["ack", "publish", "replay"])
    assert.equal(end[name], false);
  assert(
    !rows.some((r) =>
      ["native-armed", "commit-call-enter", "worker-complete"].includes(r.type),
    ),
  );
});
for (const config of [
  { rollbackFails: true },
  { closeFails: true },
  { rollbackFails: true, closeFails: true },
  { probeFails: true },
  { receiptFails: true },
])
  test(`ARM original error survives secondary failures: ${JSON.stringify(config)}`, () => {
    const { rows, calls } = failingArm(config);
    assert(calls.includes("close"), "cleanup must still attempt target close");
    if (config.rollbackFails)
      assert(
        rows.some(
          (r) =>
            r.type === "arm-rollback-error" &&
            r.error.message === "rollback unavailable",
        ),
      );
    if (config.closeFails)
      assert(
        rows.some(
          (r) =>
            r.type === "arm-close-error" &&
            r.error.message === "close unavailable",
        ),
      );
    if (!config.receiptFails) assert.equal(rows.at(-1).outcome, "unavailable");
  });
test("ARM failure after transaction already ended skips rollback and still closes", () => {
  const { calls } = failingArm({ settled: true });
  assert.deepEqual(calls, ["arm", "close"]);
});
test("ARM get-time SQL error retains original exception and completes rollback/close attempts", () => {
  const { rows, calls } = failingArm({ failInGet: true });
  assert.deepEqual(calls, ["arm", "ROLLBACK", "close"]);
  assert.equal(rows[0].type, "arm-error-before-cleanup");
  assert.equal(rows.at(-1).outcome, "unavailable");
});
test("unknown transaction state still attempts rollback and close without replacing ARM error", () => {
  const { rows, calls } = failingArm({ stateFails: true });
  assert.deepEqual(calls, ["arm", "ROLLBACK", "close"]);
  assert(
    rows.some((r) => r.type === "arm-transaction-state-after-error-error"),
  );
  assert.equal(rows.at(-1).outcome, "unavailable");
});
function packageFixture(change, action) {
  assert.equal(
    typeof checks.executionPackage,
    "function",
    "preflight must bind revised JS independently from Native build",
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apv-arm-package-unit-"));
  const sourceHashes = {};
  const sourceNames = [
    "worker.cjs",
    "checks.cjs",
    "runner.cjs",
    "audit.cjs",
    "policy.cjs",
    "oracle.cjs",
    "fixture.cjs",
    "physical-path.ps1",
  ];
  for (const name of sourceNames) {
    fs.writeFileSync(path.join(dir, name), "unit fixture\n", { flag: "wx" });
    sourceHashes[name] = checks.hash(path.join(dir, name));
  }
  const packageData = {
    scope: "G2-js-arm-boundary-v2",
    revision: "00000000-0000-4000-8000-000000000002",
    nativeBuildId: "5e2b0f20-b2b6-4d45-afba-0de72a954587",
    nativeDllSha256:
      "c9fc51e4863043f1d6313be78a6c719bc1411d275870edca5a7e6d579a25ea5d",
    workerSha256: sourceHashes["worker.cjs"],
    sourceHashes,
  };
  const manifest = path.join(dir, "execution-package.json");
  try {
    change?.(packageData);
    fs.writeFileSync(manifest, JSON.stringify(packageData), { flag: "wx" });
    action(dir, packageData);
  } finally {
    // Only these freshly created unit-test files; never experiment evidence.
    for (const name of [...sourceNames, "execution-package.json"])
      fs.unlinkSync(path.join(dir, name));
    fs.rmdirSync(dir);
  }
}
test("JS execution revision binds Worker and all eight runtime sources without opening a DB", () => {
  packageFixture(null, (dir, p) => {
    const result = checks.executionPackage(
      p.nativeBuildId,
      p.nativeDllSha256,
      dir,
    );
    assert.equal(result.revision, p.revision);
    assert.equal(result.workerSha256, p.workerSha256);
    assert.equal(
      result.manifestSha256,
      checks.hash(path.join(dir, "execution-package.json")),
    );
  });
});
test("execution package rejects changed Worker source", () => {
  packageFixture(null, (dir, p) => {
    fs.appendFileSync(path.join(dir, "worker.cjs"), "changed\n");
    assert.throws(
      () => checks.executionPackage(p.nativeBuildId, p.nativeDllSha256, dir),
      /EXECUTION_SOURCE_CHANGED/,
    );
  });
});
for (const field of ["nativeBuildId", "nativeDllSha256", "workerSha256"])
  test(`execution package refuses identity mismatch: ${field}`, () => {
    packageFixture(
      (p) => {
        p[field] = "mismatch";
      },
      (dir) => {
        assert.throws(
          () =>
            checks.executionPackage(
              "5e2b0f20-b2b6-4d45-afba-0de72a954587",
              "c9fc51e4863043f1d6313be78a6c719bc1411d275870edca5a7e6d579a25ea5d",
              dir,
            ),
          /EXECUTION_PACKAGE_/,
        );
      },
    );
  });
