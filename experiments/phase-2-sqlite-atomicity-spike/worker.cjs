"use strict";
// Loaded only by an explicitly authorized future runner invocation.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { fail, hash, requireSettled } = require("./checks.cjs");
const sql = require("./db.cjs");

function main() {
  const config = JSON.parse(process.env.APV_ATOMIC_WORKER);
  if (
    !process.send ||
    config.runId !== path.basename(config.root) ||
    !/^[a-z0-9_-]+$/.test(config.unit) ||
    !/^[a-z0-9-]+$/.test(config.workerId) ||
    !fs.existsSync(path.join(config.root, "manifest.json"))
  )
    throw fail("WORKER_BINDING");
  const localRequire = createRequire(
    path.resolve(__dirname, "../phase-2-sqlite-driver-spike/package.json"),
  );
  if (localRequire("better-sqlite3/package.json").version !== "13.0.3")
    throw fail("DRIVER_VERSION");
  const Database = localRequire("better-sqlite3");
  const dir = path.join(config.root, config.unit);
  const fixture = JSON.parse(
    fs.readFileSync(path.join(config.root, "fixture.json"), "utf8"),
  );
  const file = path.join(dir, "project.sqlite");
  let project,
    owner,
    capability,
    active = false,
    seq = 0,
    pinned = false,
    complete = false;
  function emit(commandId, kind, data) {
    const receipt = {
      runId: config.runId,
      workerId: config.workerId,
      nonce: config.nonce,
      pid: process.pid,
      sequence: ++seq,
      commandId,
      kind,
      at: new Date().toISOString(),
      monotonicMs: performance.now(),
      data,
    };
    fs.writeFileSync(
      path.join(config.root, "raw", `${config.workerId}-${seq}.json`),
      JSON.stringify(receipt, null, 2),
      { flag: "wx" },
    );
    process.send(receipt);
  }
  function openProject(readonly = false) {
    project = new Database(file, {
      readonly,
      fileMustExist: true,
      timeout: 250,
    });
    project.pragma("foreign_keys = ON");
  }
  function settle() {
    complete = false;
    const before = Boolean(project?.inTransaction);
    let rollbackConfirmed = false;
    if (before) {
      project.exec("ROLLBACK");
      rollbackConfirmed = !project.inTransaction;
    } else rollbackConfirmed = true;
    const result = {
      beforeInTransaction: before,
      inTransaction: Boolean(project?.inTransaction),
      rollbackConfirmed,
      closeConfirmed: false,
    };
    requireSettled(result);
    return result;
  }
  function ownerGuard() {
    if (!active) throw fail("OWNER_REVOKED");
    heldOwner();
  }
  function heldOwner() {
    if (!owner?.open || !owner.inTransaction) throw fail("OWNER_REVOKED");
  }
  process.on("message", (message) => {
    const { commandId, command, args = {} } = message;
    if (message.runId !== config.runId || message.nonce !== config.nonce)
      throw fail("COMMAND_BINDING");
    let value;
    try {
      if (command === "setup") {
        fs.mkdirSync(dir, { recursive: false });
        const o = new Database(path.join(dir, "owner.sqlite"));
        o.exec(
          "CREATE TABLE binding (generation TEXT NOT NULL); INSERT INTO binding VALUES ('G1')",
        );
        o.close();
        project = new Database(file);
        sql.bootstrap(project, fixture);
        project.close();
        project = undefined;
        value = { syntheticBootstrap: true };
      } else if (command === "acquire") {
        if (project || owner) throw fail("REUSE_WORKER");
        owner = new Database(path.join(dir, "owner.sqlite"), {
          fileMustExist: true,
          timeout: 250,
        });
        owner.exec("BEGIN IMMEDIATE");
        if (
          owner.prepare("SELECT generation FROM binding").get().generation !==
          fixture.generation
        )
          throw fail("OWNER_GENERATION");
        emit(commandId, "owner_held_unfenced", {
          busyTimeoutMs: 250,
          ownerInTransaction: owner.inTransaction,
        });
        openProject();
        emit(commandId, "fence_attempt", {
          statement:
            "BEGIN IMMEDIATE; current control; epoch/token CAS; COMMIT",
        });
        capability = sql.fence(project, fixture, heldOwner);
        active = true;
        emit(commandId, "fence_committed", {
          capability,
          control: sql.control(project),
        });
        value = { state: "ACTIVE", capability };
      } else if (command === "stage") {
        ownerGuard();
        project.exec("BEGIN IMMEDIATE");
        emit(commandId, "project_write_acquired", {
          guard: sql.control(project),
          capability,
        });
        sql.writeBundle(
          project,
          fixture,
          capability,
          args.stop,
          (barrier) => emit(commandId, "barrier", { barrier }),
          args.inject,
        );
        complete = !args.stop;
        value = { state: "WRITING", inTransaction: project.inTransaction };
      } else if (command === "commit") {
        if (!complete) throw fail("INCOMPLETE_BUNDLE");
        ownerGuard();
        sql.guard(project, capability);
        // No asynchronous callback between these guards and COMMIT.
        project.exec("COMMIT");
        emit(commandId, "committed", {
          operation: fixture.operationId,
          capability,
          digest: hash(fixture.after),
        });
        emit(commandId, "published", {
          operation: fixture.operationId,
          fixtureOnly: true,
        });
        emit(commandId, "fixture_ack", {
          operation: fixture.operationId,
          fixtureOnly: true,
        });
        value = { inTransaction: project.inTransaction };
      } else if (command === "rollback") {
        value = settle();
      } else if (command === "observable_owner_loss") {
        if (!project?.inTransaction || !owner?.inTransaction)
          throw fail("LOSS_PRECONDITION");
        active = false;
        owner.exec("ROLLBACK");
        value = {
          state: "REVOKED",
          projectInTransaction: project.inTransaction,
          ownerInTransaction: owner.inTransaction,
          controlledFixture: true,
        };
      } else if (command === "stale_probe") {
        if (active || owner?.inTransaction) throw fail("PROBE_PRECONDITION");
        if (!project) openProject();
        project.exec("BEGIN IMMEDIATE");
        emit(commandId, "stale_probe_write_acquired", {
          persisted: sql.control(project),
          supplied: args.capability,
          noOwnerPermission: true,
        });
        sql.guard(project, args.capability);
        throw fail("STALE_GUARD_ACCEPTED");
      } else if (command === "read") {
        if (!project) openProject(true);
        if (!pinned) project.exec("BEGIN");
        const cut = sql.readCut(project);
        emit(commandId, "sql_oracle", {
          checkpoint: args.checkpoint,
          transaction: "pinned consistent read",
          queries: sql.tables.map(
            (table) => `SELECT * FROM ${table} ORDER BY rowid`,
          ),
          cut,
          digest: hash(cut),
        });
        if (args.pin) pinned = true;
        else if (!pinned) project.exec("ROLLBACK");
        value = cut;
      } else if (command === "close" || command === "release") {
        const settlement = settle();
        project?.close();
        project = undefined;
        active = false;
        if (owner?.inTransaction) owner.exec("ROLLBACK");
        owner?.close();
        owner = undefined;
        value = { ...settlement, closeConfirmed: true, ownerReleased: true };
      } else throw fail("UNKNOWN_COMMAND");
      emit(commandId, "done", { ok: true, value });
      if (command === "close") {
        process.disconnect();
      }
    } catch (error) {
      const duringError = {
        code: error.code || "HARNESS_ERROR",
        message: error.message,
        inTransaction: Boolean(project?.inTransaction),
        ownerInTransaction: Boolean(owner?.inTransaction),
        state: active ? "ACTIVE_NO_SUCCESS" : "BLOCKED",
      };
      emit(commandId, "error_before_settlement", duringError);
      try {
        value = settle();
      } catch (settlementError) {
        emit(commandId, "settlement_failed", {
          code: settlementError.code || "HARNESS_ERROR",
        });
        active = false;
        emit(commandId, "done", {
          ok: false,
          error: duringError,
          settlement: {
            inTransaction: true,
            rollbackConfirmed: false,
            closeConfirmed: false,
          },
        });
        return;
      }
      if (command === "acquire" || command === "commit") active = false;
      emit(commandId, "done", {
        ok: false,
        error: duringError,
        settlement: value,
      });
    }
  });
  const versionDB = new Database(":memory:");
  const sqlite = versionDB
    .prepare("SELECT sqlite_version() AS version")
    .get().version;
  versionDB.close();
  emit("startup", "ready", {
    node: process.version,
    versions: process.versions,
    platform: process.platform,
    arch: process.arch,
    driver: "better-sqlite3@13.0.3",
    sqlite,
  });
}
if (require.main === module) main();
