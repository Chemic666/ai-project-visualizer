// Independent synthetic read participant. Never imports Host/Store restoration.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

let db,
  closing = false;
const send = (message, done) => {
  if (process.connected) process.send({ ...message, pid: process.pid }, done);
  else done?.();
};
function close(id) {
  if (closing) return;
  closing = true;
  if (db?.open) {
    if (db.inTransaction) db.exec("ROLLBACK");
    db.close();
  }
  send({ id, closed: true }, () => {
    if (process.connected) process.disconnect();
  });
}
function failure(id, error) {
  process.exitCode = 1;
  send(
    {
      id,
      error: {
        code: error.code ?? null,
        message: error.message,
        stack: error.stack,
      },
    },
    () => close(id),
  );
}
function snapshot(id) {
  send({
    id,
    head: db.prepare("SELECT head FROM store_meta").get().head,
    normalizedEvents: db
      .prepare("SELECT count(*) AS n FROM normalized_events")
      .get().n,
    inTransaction: db.inTransaction,
  });
}
try {
  const spec = JSON.parse(
    fs.readFileSync(process.env.APV_STORAGE_TEST_SPEC, "utf8"),
  );
  const filename = process.env.APV_STORAGE_SHM_DATABASE;
  const relative = path.relative(fs.realpathSync.native(os.tmpdir()), filename);
  assert.match(relative, /^apv-storage-slice-[A-Za-z0-9_-]+\\private\\/);
  assert.equal(fs.realpathSync.native(filename), filename);
  const Database = createRequire(path.join(spec.driverRoot, "package.json"))(
    spec.driverRoot,
  );
  db = new Database(filename, { readonly: true, fileMustExist: true });
  db.pragma("busy_timeout=0");
  assert.equal(db.pragma("journal_mode", { simple: true }), "wal");
  db.exec("BEGIN");
  snapshot(0);
} catch (error) {
  failure(0, error);
}
process.on("message", (message) => {
  if (closing) return;
  try {
    assert(Number.isSafeInteger(message.id) && message.id > 0);
    if (message.action === "close") close(message.id);
    else if (message.action === "read-held") {
      assert.equal(db.inTransaction, true);
      snapshot(message.id);
    } else {
      assert.equal(message.action, "refresh");
      assert.equal(db.inTransaction, true);
      db.exec("COMMIT");
      snapshot(message.id);
    }
  } catch (error) {
    failure(message.id, error);
  }
});
process.on("disconnect", () => {
  if (db?.open) {
    if (db.inTransaction) db.exec("ROLLBACK");
    db.close();
  }
});
