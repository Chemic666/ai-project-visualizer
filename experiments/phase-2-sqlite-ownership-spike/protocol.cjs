"use strict";

const { createHash, randomUUID } = require("node:crypto");
const EDGES = {
  UNOWNED: ["ACQUIRING"],
  ACQUIRING: ["HELD_UNFENCED", "CONFLICT", "BLOCKED"],
  CONFLICT: ["ACQUIRING", "CLOSED"],
  HELD_UNFENCED: ["FENCING", "LOST", "BLOCKED", "RELEASING"],
  FENCING: ["ACTIVE", "BLOCKED", "LOST"],
  ACTIVE: ["WRITING", "RELEASING", "LOST", "BLOCKED"],
  WRITING: ["ACTIVE", "LOST", "BLOCKED"],
  LOST: ["BLOCKED", "RELEASING"],
  BLOCKED: ["RELEASING"],
  RELEASING: ["CLOSED", "BLOCKED"],
  CLOSED: [],
};
function failure(code) {
  return Object.assign(new Error(code), { code });
}
function canTransition(from, to) {
  return EDGES[from]?.includes(to) ?? false;
}
function canCommit(owner, row) {
  return (
    owner.open === true &&
    owner.inTransaction === true &&
    owner.state === "WRITING" &&
    owner.generation === row.generation &&
    Number.isSafeInteger(owner.epoch) &&
    owner.epoch > 0 &&
    owner.epoch === row.epoch &&
    typeof owner.token === "string" &&
    owner.token.length > 0 &&
    owner.token === row.token
  );
}
function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function intentDigest(intent) {
  return hash({
    operationId: intent.operationId,
    base: intent.base,
    increment: intent.increment,
  });
}
function safeError(error) {
  const allowed = new Set([
    "SQLITE_BUSY",
    "SQLITE_FULL",
    "SQLITE_IOERR",
    "SQLITE_CORRUPT",
    "SQLITE_NOTADB",
    "SQLITE_CONSTRAINT",
    "SQLITE_CONSTRAINT_CHECK",
    "SQLITE_CONSTRAINT_PRIMARYKEY",
    "ENOENT",
    "EACCES",
    "EPERM",
    "EBUSY",
    "EEXIST",
    "ERR_ASSERTION",
  ]);
  const code = typeof error?.code === "string" ? error.code : "";
  return {
    category:
      allowed.has(code) || /^APV_[A-Z_]+$/.test(code) ? code : "HARNESS_ERROR",
  };
}
function rollback(db) {
  if (db?.open && db.inTransaction) db.exec("ROLLBACK");
}

// Disposable only. Database constructor, path checks and scheduling injected by
// worker; importing this module never loads SQLite, opens files or spawns.
class Writer {
  #owner;
  #project;
  #state = "UNOWNED";
  #epoch = 0;
  #token = "";
  #generation;
  #options;
  #pendingRelease = false;
  constructor(options) {
    this.#options = options;
    this.#generation = options.generation;
    if (!["protected", "unsafe_baseline"].includes(options.mode))
      throw failure("APV_MODE");
  }
  #move(next) {
    if (!canTransition(this.#state, next)) throw failure("APV_STATE");
    const from = this.#state;
    this.#state = next;
    this.#options.emit("transition", { from, to: next });
  }
  snapshot() {
    return {
      state: this.#state,
      generation: this.#generation,
      epoch: this.#epoch,
      token: this.#token,
      open: this.#owner?.open === true,
      inTransaction:
        this.#owner?.open === true && this.#owner.inTransaction === true,
    };
  }
  #guard(control = false) {
    const state = this.snapshot();
    const validState = control
      ? state.state === "FENCING"
      : state.state === "WRITING";
    if (!validState || !state.open || !state.inTransaction)
      throw failure("APV_OWNER_LOST");
  }
  #row() {
    return this.#project
      .prepare("SELECT * FROM store_meta WHERE singleton=1")
      .get();
  }
  #binding(row) {
    if (
      !row ||
      row.project_id !== this.#options.projectId ||
      row.generation !== this.#generation ||
      row.lifecycle !== "active"
    )
      throw failure("APV_GENERATION");
    if (
      !Number.isSafeInteger(row.epoch) ||
      row.epoch < 0 ||
      !Number.isSafeInteger(row.head) ||
      row.head < 0
    )
      throw failure("APV_INTEGER");
  }
  #lost(error) {
    if (["WRITING", "FENCING", "ACTIVE", "HELD_UNFENCED"].includes(this.#state))
      this.#move("LOST");
    if (this.#state === "LOST") this.#move("BLOCKED");
    this.#options.emit("disabled", safeError(error));
  }
  acquire({ ownerAlias } = {}) {
    this.#move("ACQUIRING");
    try {
      this.#options.verify(ownerAlias);
      this.#owner = this.#options.openOwner();
      const marker = this.#owner
        .prepare("SELECT * FROM owner_meta WHERE singleton=1")
        .get();
      if (
        marker?.magic !== "APV_OWNER_SPIKE" ||
        marker.store_key !== this.#options.storeKey ||
        marker.schema_version !== 1
      )
        throw failure("APV_MARKER");
      if (this.#owner.pragma("journal_mode", { simple: true }) !== "delete")
        throw failure("APV_JOURNAL");
      this.#owner.pragma("busy_timeout = 250");
      this.#options.emit("owner_begin_attempt");
      this.#owner.exec("BEGIN IMMEDIATE");
      this.#move("HELD_UNFENCED");
      this.#options.barrier("owner_begin_ok");
      this.#project = this.#options.openProject();
      this.#binding(this.#row());
      this.#options.verifyRecovery(this.#project);
      this.#options.verify();
      this.#options.barrier("recovery_verified");
      this.#options.emit("owner_acquired", this.snapshot());
      return this.snapshot();
    } catch (error) {
      if (this.#state === "ACQUIRING")
        this.#move(error.code === "SQLITE_BUSY" ? "CONFLICT" : "BLOCKED");
      else this.#lost(error);
      this.#options.emit("acquire_rejected", safeError(error));
      throw error;
    }
  }
  fence(options = {}) {
    this.#move("FENCING");
    try {
      this.#guard(true);
      this.#project.exec("BEGIN IMMEDIATE");
      const row = this.#row();
      this.#binding(row);
      if (row.epoch === Number.MAX_SAFE_INTEGER) throw failure("APV_INTEGER");
      this.#epoch = row.epoch + 1;
      this.#token = randomUUID();
      const result = this.#project
        .prepare(
          "UPDATE store_meta SET epoch=?,token=? WHERE singleton=1 AND generation=? AND epoch=? AND lifecycle='active'",
        )
        .run(this.#epoch, this.#token, this.#generation, row.epoch);
      if (result.changes !== 1) throw failure("APV_FENCE");
      if (options.failEpoch)
        this.#project.exec(
          "INSERT INTO store_meta SELECT * FROM store_meta WHERE singleton=1",
        );
      if (options.loseOwner) this.loseOwner(options.loseOwner);
      this.#options.barrier("before_epoch_commit");
      this.#guard(true);
      this.#project.exec("COMMIT");
      this.#options.emit("epoch_committed", {
        epoch: this.#epoch,
        token: this.#token,
      });
      this.#options.barrier("after_epoch_commit_before_active");
      if (options.unknownEpoch) throw failure("APV_EPOCH_UNKNOWN");
      this.#options.verify();
      this.#guard(true);
      const confirmed = this.#row();
      if (confirmed.epoch !== this.#epoch || confirmed.token !== this.#token)
        throw failure("APV_FENCE");
      this.#move("ACTIVE");
      return this.snapshot();
    } catch (error) {
      let rollbackError;
      try {
        rollback(this.#project);
      } catch (failure) {
        rollbackError = failure;
      }
      this.#lost(error);
      this.#options.emit("fence_rejected", {
        ...safeError(error),
        rollback: rollbackError
          ? safeError(rollbackError).category
          : "verified or not active",
      });
      if (rollbackError) throw failure("APV_ROLLBACK_UNKNOWN");
      throw error;
    }
  }
  write(intent, options = {}) {
    if (this.#state !== "ACTIVE") throw failure("APV_DISABLED");
    this.#move("WRITING");
    let committed = false;
    let commitAttempted = false;
    try {
      this.#options.verify();
      this.#guard();
      this.#project.exec("BEGIN IMMEDIATE");
      this.#options.barrier("project_begin_ok");
      const row = this.#row();
      this.#binding(row);
      const presented = options.presented ?? {
        generation: this.#generation,
        epoch: this.#epoch,
        token: this.#token,
      };
      if (
        !canCommit(
          {
            ...this.snapshot(),
            generation: presented.generation,
            epoch: presented.epoch,
            token: presented.token,
          },
          { generation: row.generation, epoch: row.epoch, token: row.token },
        )
      )
        throw failure("APV_FENCE");
      const digest = intentDigest(intent);
      const receipt = this.#project
        .prepare("SELECT * FROM writes WHERE operation_id=?")
        .get(intent.operationId);
      if (receipt) {
        if (receipt.intent_digest !== digest) throw failure("APV_IDENTITY");
        this.#guard();
        this.#project.exec("ROLLBACK");
        this.#move("ACTIVE");
        this.#options.emit("duplicate", {
          operationId: intent.operationId,
          committedHead: receipt.new_head,
          currentHead: row.head,
        });
        return { duplicate: true, head: row.head };
      }
      if (
        !Number.isSafeInteger(intent.base) ||
        intent.base !== row.head ||
        intent.increment !== 1 ||
        row.head === Number.MAX_SAFE_INTEGER
      )
        throw failure("APV_BASE");
      const next = row.head + 1;
      const stateDigest = hash({ head: next, value: next });
      this.#project
        .prepare("UPDATE fixture_state SET value=?,digest=? WHERE singleton=1")
        .run(next, stateDigest);
      this.#project
        .prepare("INSERT INTO writes VALUES(?,?,?,?,?,?,?)")
        .run(
          intent.operationId,
          digest,
          row.epoch,
          row.token,
          row.head,
          next,
          stateDigest,
        );
      const update = this.#project
        .prepare(
          "UPDATE store_meta SET head=?,digest=? WHERE singleton=1 AND generation=? AND epoch=? AND token=? AND head=?",
        )
        .run(
          next,
          stateDigest,
          this.#generation,
          presented.epoch,
          presented.token,
          row.head,
        );
      if (update.changes !== 1) throw failure("APV_FENCE");
      if (options.releaseDuringWrite) {
        this.release();
        this.#options.emit("release_deferred", { state: this.#state });
      }
      if (options.loseOwner) this.loseOwner(options.loseOwner);
      this.#options.barrier("after_fixture_write");
      this.#options.barrier("before_final_guard");
      const final = this.#row();
      if (
        final.epoch !== presented.epoch ||
        final.token !== presented.token ||
        final.head !== next
      )
        throw failure("APV_FENCE");
      // No callback, path check or yield after this check. The unsafe mode is
      // available only in the independently configured OP06 negative control.
      if (this.#options.mode === "protected") this.#guard();
      commitAttempted = true;
      this.#project.exec("COMMIT");
      committed = true;
      this.#options.emit("data_committed", {
        operationId: intent.operationId,
        head: next,
        epoch: row.epoch,
        ownerLost: !this.#owner.open || !this.#owner.inTransaction,
        mode: this.#options.mode,
      });
      this.#options.barrier("after_project_commit_before_ack");
      if (this.#options.mode === "unsafe_baseline" && options.loseOwner) {
        this.#lost(failure("APV_OWNER_LOST"));
        return { head: next, unsafe: true };
      }
      this.#guard();
      this.#move("ACTIVE");
      this.#options.emit("published", {
        operationId: intent.operationId,
        head: next,
      });
      this.#options.emit("fixture_ack", {
        operationId: intent.operationId,
        head: next,
      });
      if (this.#pendingRelease) this.release();
      return { head: next };
    } catch (error) {
      let rollbackError;
      try {
        rollback(this.#project);
      } catch (failure) {
        rollbackError = failure;
      }
      if (
        !rollbackError &&
        ["APV_FENCE", "APV_BASE", "APV_IDENTITY"].includes(error.code) &&
        !committed &&
        this.#owner?.open &&
        this.#owner.inTransaction &&
        this.#state === "WRITING"
      )
        this.#move("ACTIVE");
      else this.#lost(error);
      this.#options.emit("write_rejected", {
        ...safeError(error),
        committed,
        commitOutcome: committed
          ? "confirmed"
          : commitAttempted
            ? "unknown"
            : "not attempted",
        rollback: rollbackError
          ? safeError(rollbackError).category
          : "verified or not active",
      });
      if (rollbackError) throw failure("APV_ROLLBACK_UNKNOWN");
      throw error;
    }
  }
  loseOwner(kind = true) {
    rollback(this.#owner);
    if (kind === "close") this.#owner.close();
    if (this.#options.mode !== "unsafe_baseline")
      this.#lost(failure("APV_OWNER_LOST"));
    this.#options.emit("owner_lost", {
      mode: this.#options.mode,
      kind: kind === "close" ? "connection_close" : "transaction_rollback",
    });
  }
  release() {
    if (this.#state === "WRITING") {
      this.#pendingRelease = true;
      return { deferred: true };
    }
    if (this.#state === "CLOSED") return this.snapshot();
    if (this.#state === "CONFLICT") {
      this.#owner?.close();
      this.#move("CLOSED");
      return this.snapshot();
    }
    if (this.#state === "UNOWNED") return this.snapshot();
    this.#move("RELEASING");
    try {
      rollback(this.#project);
      if (this.#project?.open) this.#project.close();
      this.#options.emit("data_closed", {
        pendingRelease: this.#pendingRelease,
      });
      this.#options.barrier("before_owner_release");
      rollback(this.#owner);
      if (this.#owner?.open) this.#owner.close();
      this.#move("CLOSED");
      return this.snapshot();
    } catch (error) {
      this.#move("BLOCKED");
      throw error;
    }
  }
}
module.exports = {
  Writer,
  canTransition,
  canCommit,
  intentDigest,
  safeError,
  hash,
  failure,
};
