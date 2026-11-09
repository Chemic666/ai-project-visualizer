import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { admitSyntheticRoot } from "../src/host-admission.mjs";
import { openSyntheticStore } from "../src/development.mjs";
import { seed, input, cursor } from "./fixtures.mjs";

const spec = JSON.parse(
  fs.readFileSync(process.env.APV_STORAGE_TEST_SPEC, "utf8"),
);
const Database = createRequire(path.join(spec.driverRoot, "package.json"))(
  spec.driverRoot,
);
const core = await import(pathToFileURL(spec.corePath).href);
const options = {
  Database,
  applyNormalizedEvent: core.applyNormalizedEvent,
  processorFingerprint: spec.processorFingerprint,
  projectId: "PA",
  generation: "G1",
  bootstrap: seed(),
  ...(spec.nativePackage ? { nativePackage: spec.nativePackage } : {}),
};
let roots = 0;
const save = (name, value) =>
  fs.writeFileSync(
    path.join(spec.evidence, name),
    JSON.stringify(value, null, 2),
    { flag: "wx" },
  );
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, canonical(v[k])]),
    );
  return v;
}
const encode = (v) => JSON.stringify(canonical(v));
const digest = (v) => createHash("sha256").update(encode(v)).digest("hex");
function sql(f, fn, readonly = false) {
  const db = new Database(f.paths.project, { fileMustExist: true, readonly });
  try {
    if (!readonly) db.pragma("foreign_keys=OFF");
    return fn(db);
  } finally {
    db.close();
  }
}
function authority(f) {
  return sql(
    f,
    (db) => {
      const tables = {};
      for (const name of [
        "store_meta",
        "commits",
        "normalized_events",
        "entity_versions",
        "assertions",
        "correction_versions",
        "conclusion_versions",
        "source_checkpoint_versions",
      ]) {
        const rows = db
          .prepare(`SELECT * FROM ${name}`)
          .all()
          .map((row) => ({ ...row }));
        if (name === "store_meta")
          for (const row of rows)
            for (const key of ["writer_epoch", "owner_token", "control_nonce"])
              delete row[key];
        tables[name] = rows.sort((a, b) => encode(a).localeCompare(encode(b)));
      }
      return digest(tables);
    },
    true,
  );
}
function cacheHash(f) {
  return sql(
    f,
    (db) =>
      digest(db.prepare("SELECT * FROM snapshots ORDER BY watermark").all()),
    true,
  );
}
function request(store, id = "E1", createSnapshot = true) {
  return {
    operationId: "op:" + id,
    operationNonce: "nonce:" + id,
    expectedHead: id === "E1" ? 1 : 2,
    writer: store.writer(),
    events: [input(id)],
    cursor: id === "E1" ? cursor([id]) : cursor([id], "batch:2", "batch:1"),
    createSnapshot,
  };
}
function fixture(tail = false, tailSnapshot = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apv-storage-slice-"));
  save(`synthetic-root-${++roots}.json`, { root, runId: spec.runId });
  const cap = admitSyntheticRoot({ enabled: true, root });
  const store = openSyntheticStore(cap, options);
  const f = { root, cap, paths: store.paths() };
  f.seedSnapshot = sql(
    f,
    (db) => db.prepare("SELECT * FROM snapshots WHERE watermark=1").get(),
    true,
  );
  f.receipt = store.commit(request(store)).receipt;
  if (tail) store.commit(request(store, "E2", tailSnapshot));
  f.cut = store.read();
  store.close();
  f.authorityBefore = authority(f);
  return f;
}
function recover(f, label, reason) {
  const beforeCache = cacheHash(f),
    beforeAuthority = authority(f);
  assert.equal(beforeAuthority, f.authorityBefore);
  const store = openSyntheticStore(f.cap, options);
  try {
    assert.deepEqual(store.read(), f.cut);
    if (reason) {
      const health = store
        .evidence()
        .find((row) => row.phase === "snapshot-cache");
      assert.ok(health, "cache bypass must be recorded without raw contents");
      assert.equal(health.status, "bypassed");
      assert.ok(health.reasons.includes(reason));
    }
    const retry = store.commit(request(store));
    assert.equal(retry.status, "already_committed");
    assert.deepEqual(retry.receipt, f.receipt);
    assert.deepEqual(retry.cursor, f.cut.cursor);
  } finally {
    store.close();
  }
  const afterAuthority = authority(f),
    afterCache = cacheHash(f);
  assert.equal(afterAuthority, beforeAuthority);
  assert.equal(afterCache, beforeCache);
  save(`cache-${label}.json`, {
    status: "recovered_from_authority",
    head: f.cut.head,
    beforeAuthority,
    afterAuthority,
    beforeCache,
    afterCache,
    cacheRewritten: false,
    originalReceiptPreserved: true,
  });
}
const scenarios = [
  [
    "malformed-json",
    "body_invalid",
    (f, db) =>
      db
        .prepare("UPDATE snapshots SET body=? WHERE watermark=2")
        .run("{invalid-cache"),
  ],
  [
    "digest-mismatch",
    "body_invalid",
    (f, db) =>
      db
        .prepare("UPDATE snapshots SET body_digest=? WHERE watermark=2")
        .run("0".repeat(64)),
  ],
  [
    "consistent-digest-false-claim",
    "body_mismatch",
    (f, db) => {
      const body = JSON.parse(
        db.prepare("SELECT body FROM snapshots WHERE watermark=2").get().body,
      );
      body.sourceVector[0].position = "cache-only-false-position";
      body.domain.assertions.find(
        (a) => a.provenance === "agent_reported",
      ).provenance = "observed";
      db.prepare(
        "UPDATE snapshots SET body=?,body_digest=? WHERE watermark=2",
      ).run(encode(body), digest(body));
    },
  ],
  [
    "invalid-watermark",
    "watermark_invalid",
    (f, db) =>
      db.prepare("UPDATE snapshots SET watermark=999 WHERE watermark=2").run(),
  ],
  [
    "oversized-utf8",
    "size_limit",
    (f, db) => {
      const value = "界".repeat(Math.floor((8 * 1024 * 1024) / 3) + 1),
        body = JSON.stringify(value);
      assert.ok(
        body.length < 8 * 1024 * 1024 &&
          Buffer.byteLength(body) > 8 * 1024 * 1024,
      );
      db.prepare(
        "UPDATE snapshots SET body=?,body_digest=? WHERE watermark=2",
      ).run(body, digest(value));
    },
  ],
  [
    "excess-entries",
    "entry_limit",
    (f, db) => {
      const s = f.seedSnapshot;
      db.prepare("INSERT INTO snapshots VALUES(?,?,?)").run(
        s.watermark,
        s.body,
        s.body_digest,
      );
    },
  ],
];
for (const [label, reason, mutate] of scenarios)
  test(
    "S11: optional cache " +
      label +
      " cannot override or block complete authority",
    () => {
      const f = fixture(label === "excess-entries");
      sql(f, (db) => mutate(f, db));
      recover(f, label, reason);
    },
  );

test("S11: missing caches retain the authoritative current cut without creating replacements", () => {
  const f = fixture();
  sql(f, (db) => db.prepare("DELETE FROM snapshots").run());
  recover(f, "missing", null);
});
test("S10: valid older cache does not preload future assertions or rewind the tail Cursor", () => {
  const f = fixture(true, false);
  assert.equal(f.cut.head, 3);
  assert.deepEqual(
    f.cut.state.acceptedEvents.map((e) => e.id),
    ["E1", "E2"],
  );
  recover(f, "valid-tail", null);
});
test("S12: invalid cache cannot rescue missing authoritative assertions", () => {
  const f = fixture();
  sql(f, (db) => {
    db.prepare("UPDATE snapshots SET body=? WHERE watermark=2").run(
      "{invalid-cache",
    );
    db.prepare("DELETE FROM assertions WHERE id='WA'").run();
  });
  const before = authority(f);
  let store;
  try {
    assert.throws(
      () => {
        store = openSyntheticStore(f.cap, options);
      },
      { code: "unavailable" },
    );
  } finally {
    store?.close();
  }
  assert.equal(authority(f), before);
  save("cache-missing-authority.json", {
    status: "unavailable",
    authorityPreserved: true,
    cacheUsedAsAuthority: false,
  });
});
test("S11/S02: a new commit replaces known-bad caches only transactionally", () => {
  const f = fixture();
  sql(f, (db) =>
    db
      .prepare("UPDATE snapshots SET body=? WHERE watermark=2")
      .run("{invalid-cache"),
  );
  const beforeCache = cacheHash(f),
    beforeAuthority = authority(f);
  let reject = true;
  const store = openSyntheticStore(f.cap, {
    ...options,
    testHooks: {
      afterRecords: () => {
        if (reject) throw Error("controlled-cache-rollback");
      },
    },
  });
  try {
    assert.throws(() => store.commit(request(store, "E2")), {
      code: "unavailable",
    });
    assert.deepEqual(store.read(), f.cut);
    assert.equal(cacheHash(f), beforeCache);
    assert.equal(authority(f), beforeAuthority);
    reject = false;
    const committed = store.commit(request(store, "E2"));
    assert.equal(committed.status, "committed");
    assert.equal(committed.head, 3);
  } finally {
    store.close();
  }
  sql(
    f,
    (db) => {
      const rows = db.prepare("SELECT * FROM snapshots").all();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].watermark, 3);
      assert.equal(JSON.parse(rows[0].body).watermark, 3);
      assert.deepEqual(db.pragma("foreign_key_check"), []);
    },
    true,
  );
  save("cache-transactional-replacement.json", {
    status: "pass",
    rollbackPreservedCache: true,
    rollbackPreservedAuthority: true,
    newHead: 3,
    snapshotCount: 1,
    cacheDeletedOnlyWithNewCommit: true,
  });
});

// This row is outside every validated committed cut: only the strict authority
// FK check can reject it. A valid cache must not hide future orphan authority.
test("S12: an orphan authority version beyond head is refused despite valid caches", () => {
  const f = fixture();
  sql(f, (db) => {
    db.prepare(
      "INSERT INTO conclusion_versions(id,seq,ordinal,body,body_digest) SELECT id,999,ordinal,body,body_digest FROM conclusion_versions ORDER BY seq DESC LIMIT 1",
    ).run();
    const violations = db.pragma("foreign_key_check(conclusion_versions)");
    assert.equal(violations.length, 1);
    assert.equal(violations[0].parent, "commits");
  });
  const before = authority(f);
  let store;
  try {
    assert.throws(
      () => {
        store = openSyntheticStore(f.cap, options);
      },
      { code: "unavailable" },
    );
  } finally {
    store?.close();
  }
  assert.equal(authority(f), before);
  save("cache-orphan-authority.json", {
    status: "unavailable",
    outsideHead: 999,
    authorityPreserved: true,
    validCacheNotUsedAsAuthority: true,
  });
});
