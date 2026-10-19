"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { Writer, safeError, failure } = require("./protocol.cjs");
const { verifySQL } = require("./oracle.cjs");
const {
  readJSON,
  writeExclusive,
  validateBinding,
  loadDriver,
  settings,
  UUID,
  inside,
} = require("./support.cjs");

function main(configFile) {
  if (!process.send) throw failure("APV_WORKER_PARENT");
  const relative = path.relative(
    path.join(os.tmpdir(), "apv-sqlite-ownership"),
    path.resolve(configFile),
  );
  const components = relative.split(path.sep);
  if (
    components.length !== 4 ||
    !UUID.test(components[0]) ||
    !/^OP(?:0[1-9]|10)-[a-z_]+$/.test(components[1]) ||
    components[2] !== "control" ||
    !/^[ABC][0-9]+\.config\.json$/.test(components[3])
  )
    throw failure("APV_WORKER_CONFIG_PATH");
  const config = readJSON(configFile);
  const { binding, workerId, nonce } = config;
  const manifest = validateBinding(
    binding,
    undefined,
    config.role === "reader",
  );
  if (
    !process.send ||
    process.ppid !== manifest.parentPid ||
    !UUID.test(nonce) ||
    !/^[A-Z][0-9]*$/.test(workerId) ||
    !inside(binding.root, configFile)
  )
    throw failure("APV_WORKER_PARENT");
  if (
    config.mode === "unsafe_baseline" &&
    (binding.caseId !== "OP06" || binding.variant !== "unsafe")
  )
    throw failure("APV_UNSAFE_SCOPE");
  const busyProbe =
    binding.caseId === "OP10" && binding.variant === "project_busy_watchdog";
  if (config.role === "project_blocker" && !busyProbe)
    throw failure("APV_UNSAFE_SCOPE");
  let sequence = 0;
  let barrierIndex = 0;
  let currentCommand;
  let currentOptions = {};
  const emit = (kind, data = {}) => {
    const receipt = {
      runId: binding.runId,
      caseId: binding.caseId,
      workerId,
      nonce,
      sequence: ++sequence,
      createdAt: new Date().toISOString(),
      kind,
      data,
    };
    writeExclusive(
      path.join(
        binding.root,
        "evidence",
        `${workerId}-${String(sequence).padStart(5, "0")}.json`,
      ),
      receipt,
    );
    process.send(receipt);
    return receipt;
  };
  function barrier(name) {
    if (currentOptions.barrier !== name) return;
    const id = `${workerId}-${currentCommand}-${++barrierIndex}`;
    const entered = {
      runId: binding.runId,
      caseId: binding.caseId,
      workerId,
      nonce,
      commandId: currentCommand,
      barrier: name,
      id,
    };
    writeExclusive(
      path.join(binding.root, "control", `${id}.entered.json`),
      entered,
    );
    const release = path.join(binding.root, "control", `${id}.release.json`);
    // This new probe has a separate 5 s parent blocked-phase watchdog.
    // 10 s is only the sacrificial barrier failsafe, never an acquisition lease.
    const deadline = performance.now() + (busyProbe ? 10000 : 5000);
    const wait = new Int32Array(new SharedArrayBuffer(4));
    while (!fs.existsSync(release)) {
      if (performance.now() > deadline) throw failure("APV_BARRIER_TIMEOUT");
      Atomics.wait(wait, 0, 0, 10);
    }
    const value = readJSON(release);
    if (Object.keys(entered).some((key) => entered[key] !== value[key]))
      throw failure("APV_BARRIER_BINDING");
    emit("barrier_released", { barrier: name, id });
    if (value.cancel === true) throw failure("APV_CANCELLED");
  }
  const Database = loadDriver();
  const open = (file, mode) => {
    const db = new Database(file, { fileMustExist: true, timeout: 250 });
    try {
      settings(db, mode);
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  };
  let writer;
  if (config.role === "writer")
    writer = new Writer({
      generation: config.generation ?? binding.generation,
      projectId: binding.projectId,
      storeKey: binding.storeKey,
      mode: config.mode,
      emit,
      barrier,
      verify: (alias) => validateBinding(binding, alias),
      openOwner: () => open(binding.ownerPath, "DELETE"),
      openProject: () => open(binding.projectPath, "WAL"),
      verifyRecovery: (db) => {
        db.exec("BEGIN");
        try {
          const cut = {
            meta: db.prepare("SELECT * FROM store_meta").get(),
            state: db.prepare("SELECT * FROM fixture_state").get(),
            writes: db.prepare("SELECT * FROM writes ORDER BY new_head").all(),
          };
          verifySQL(cut, binding);
          emit("recovery_oracle", {
            sqliteVersion: db
              .prepare("SELECT sqlite_version() AS version")
              .get().version,
            head: cut.meta.head,
            digest: cut.meta.digest,
            epoch: cut.meta.epoch,
          });
        } finally {
          db.exec("ROLLBACK");
        }
      },
    });
  emit("hello", {
    pid: process.pid,
    parentPid: process.ppid,
    createdAtEstimate: new Date(
      Date.now() - process.uptime() * 1000,
    ).toISOString(),
    creationTimeKind: "process_uptime_estimate_not_kernel_identity",
    role: config.role,
    mode: config.mode,
    node: process.version,
    modules: process.versions.modules,
    napi: process.versions.napi,
  });
  process.on("message", (command) => {
    try {
      if (
        !command ||
        !UUID.test(command.id) ||
        command.nonce !== nonce ||
        command.runId !== binding.runId ||
        command.caseId !== binding.caseId
      )
        throw failure("APV_COMMAND_BINDING");
      currentCommand = command.id;
      currentOptions = command.options ?? {};
      emit("command_started", {
        commandId: command.id,
        action: command.action,
      });
      let result;
      if (command.action === "read" && config.role === "reader") {
        validateBinding(binding, undefined, true);
        const db = new Database(binding.projectPath, {
          readonly: true,
          fileMustExist: true,
          timeout: 250,
        });
        try {
          db.exec("BEGIN");
          result = {
            meta: db.prepare("SELECT * FROM store_meta").get(),
            state: db.prepare("SELECT * FROM fixture_state").get(),
            writes: db.prepare("SELECT * FROM writes ORDER BY new_head").all(),
            sqliteVersion: db
              .prepare("SELECT sqlite_version() AS version")
              .get().version,
          };
          db.exec("COMMIT");
        } finally {
          db.close();
        }
        emit("sql_oracle", result);
      } else if (
        command.action === "hold_project" &&
        config.role === "project_blocker" &&
        busyProbe
      ) {
        if (currentOptions.barrier !== "project_lock_held")
          throw failure("APV_BARRIER_BINDING");
        validateBinding(binding);
        const db = open(binding.projectPath, "WAL");
        try {
          db.exec("BEGIN IMMEDIATE");
          const row = db.prepare("SELECT * FROM store_meta").get();
          if (
            row.project_id !== binding.projectId ||
            row.generation !== binding.generation
          )
            throw failure("APV_GENERATION");
          emit("project_lock_held", {
            generation: row.generation,
            epoch: row.epoch,
            head: row.head,
            inTransaction: db.inTransaction,
            dml: false,
          });
          barrier("project_lock_held");
          db.exec("ROLLBACK");
          emit("project_lock_released", {
            inTransaction: db.inTransaction,
            dml: false,
          });
          result = { released: true };
        } finally {
          if (db.inTransaction) db.exec("ROLLBACK");
          db.close();
        }
      } else if (command.action === "blocked_wait" && writer && busyProbe) {
        const state = writer.snapshot();
        if (
          state.state !== "BLOCKED" ||
          !state.open ||
          !state.inTransaction ||
          currentOptions.barrier !== "blocked_until_watchdog"
        )
          throw failure("APV_STATE");
        emit("blocked_wait", state);
        barrier("blocked_until_watchdog");
        result = writer.snapshot();
      } else if (command.action === "acquire" && writer)
        result = writer.acquire(currentOptions);
      else if (command.action === "fence" && writer) {
        if (busyProbe)
          emit("fence_attempt", {
            owner: writer.snapshot(),
            busyTimeoutMs: 250,
            sql: "BEGIN IMMEDIATE",
          });
        result = writer.fence(currentOptions);
      } else if (command.action === "write" && writer)
        result = writer.write(command.intent, currentOptions);
      else if (command.action === "release" && writer)
        result = writer.release();
      else if (command.action === "snapshot" && writer)
        result = writer.snapshot();
      else if (command.action === "lose_owner" && writer) {
        writer.loseOwner();
        result = writer.snapshot();
      } else if (command.action === "quit") {
        if (writer) writer.release();
        emit("command_result", {
          commandId: command.id,
          ok: true,
          result: { closed: true },
        });
        process.disconnect();
        return;
      } else throw failure("APV_COMMAND");
      emit("command_result", { commandId: command.id, ok: true, result });
    } catch (error) {
      emit("command_result", {
        commandId: currentCommand,
        ok: false,
        ...safeError(error),
        state: writer?.snapshot(),
      });
    }
  });
  process.on("disconnect", () => {
    try {
      if (writer) writer.release();
    } catch {
      process.exitCode = 2;
    }
  });
}
if (require.main === module) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== "--config")
      throw failure("APV_ARGUMENT");
    main(process.argv[3]);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(safeError(error))}\n`);
    process.exitCode = 2;
  }
}
module.exports = { main };
