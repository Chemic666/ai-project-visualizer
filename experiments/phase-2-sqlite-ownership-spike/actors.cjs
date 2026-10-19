"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { failure, hash } = require("./protocol.cjs");
const { validateReceipt } = require("./oracle.cjs");
const { writeExclusive, readJSON, sleep } = require("./support.cjs");
let parentOrder = 0;

// No child is started at import time. Each actor is bound to its live Node
// ChildProcess object + authenticated hello, never a process-name/PID search.
class Actor {
  constructor(binding, workerId, options = {}) {
    this.binding = binding;
    this.workerId = workerId;
    this.nonce = randomUUID();
    this.receipts = [];
    this.sequence = 0;
    this.pending = new Map();
    this.barriers = [];
    this.closed = false;
    this.deadlineAt = options.deadlineAt ?? performance.now() + 5000;
    const config = {
      binding,
      workerId,
      nonce: this.nonce,
      role: options.role ?? "writer",
      mode: options.mode ?? "protected",
      generation: options.generation ?? binding.generation,
    };
    const file = path.join(binding.root, "control", `${workerId}.config.json`);
    writeExclusive(file, config);
    const env = Object.fromEntries(
      ["SystemRoot", "WINDIR", "TEMP", "TMP"]
        .filter((key) => process.env[key] !== undefined)
        .map((key) => [key, process.env[key]]),
    );
    this.child = spawn(
      process.execPath,
      [path.join(__dirname, "worker.cjs"), "--config", file],
      {
        env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    this.hello = new Promise((resolve, reject) => {
      this.resolveHello = resolve;
      this.rejectHello = reject;
    });
    this.hello.catch(() => {});
    this.exit = new Promise((resolve) => {
      this.resolveExit = resolve;
    });
    // Unexpected output is not echoed: a raw native stack may contain paths.
    for (const stream of [this.child.stdout, this.child.stderr])
      stream.on("data", () => this.abort(failure("APV_WORKER_OUTPUT")));
    this.child.on("error", () => this.abort(failure("APV_SPAWN")));
    this.child.on("message", (receipt) => {
      try {
        validateReceipt(
          receipt,
          {
            runId: binding.runId,
            caseId: binding.caseId,
            workerId,
            nonce: this.nonce,
          },
          this.sequence,
        );
        const saved = readJSON(
          path.join(
            binding.root,
            "evidence",
            `${workerId}-${String(receipt.sequence).padStart(5, "0")}.json`,
          ),
        );
        if (hash(saved) !== hash(receipt)) throw failure("APV_RECEIPT_CONTENT");
        this.sequence = receipt.sequence;
        this.receipts.push(receipt);
        writeExclusive(
          path.join(
            binding.root,
            "evidence",
            `parent-observed-${++parentOrder}.json`,
          ),
          {
            parentOrder,
            runId: binding.runId,
            workerId,
            receiptSequence: receipt.sequence,
            kind: receipt.kind,
            observedAt: new Date().toISOString(),
          },
        );
        if (receipt.kind === "fixture_ack") {
          const commit = this.receipts.find(
            (r) =>
              r.kind === "data_committed" &&
              r.data.operationId === receipt.data.operationId,
          );
          if (
            !commit ||
            commit.sequence >= receipt.sequence ||
            commit.data.ownerLost
          )
            throw failure("APV_ACK_UNCOMMITTED");
          writeExclusive(
            path.join(
              binding.root,
              "evidence",
              `${workerId}-${receipt.sequence}.parent-ack.json`,
            ),
            {
              runId: binding.runId,
              caseId: binding.caseId,
              workerId,
              nonce: this.nonce,
              source: "independent_parent_fixture_ack_sink",
              operationId: receipt.data.operationId,
              commitReceiptSequence: commit.sequence,
              ackRequestSequence: receipt.sequence,
              recordedAt: new Date().toISOString(),
            },
          );
        }
        if (receipt.kind === "hello") {
          if (
            this.bound ||
            receipt.data.pid !== this.child.pid ||
            receipt.data.parentPid !== process.pid
          )
            throw failure("APV_CHILD_BINDING");
          this.bound = {
            pid: this.child.pid,
            nonce: this.nonce,
            spawnObservedAt: new Date().toISOString(),
            kernelCreationTime: "NOT READ; live ChildProcess handle used",
          };
          this.resolveHello(receipt);
        }
        if (receipt.kind === "command_result") {
          const task = this.pending.get(receipt.data.commandId);
          if (!task) throw failure("APV_COMMAND_RECEIPT");
          this.pending.delete(receipt.data.commandId);
          task.resolve(receipt.data);
        }
      } catch (error) {
        this.abort(error);
      }
    });
    this.child.on("exit", (code, signal) => {
      this.closed = true;
      try {
        writeExclusive(
          path.join(binding.root, "evidence", `${workerId}.exit.json`),
          {
            runId: binding.runId,
            caseId: binding.caseId,
            workerId,
            nonce: this.nonce,
            bound: this.bound ?? null,
            code,
            signal,
            observedAt: new Date().toISOString(),
          },
        );
      } catch {
        this.abort(failure("APV_EXIT_EVIDENCE"));
      }
      if (!this.bound) this.rejectHello(failure("APV_NO_HELLO"));
      for (const task of this.pending.values())
        task.resolve({ ok: false, category: "APV_CHILD_EXIT" });
      this.pending.clear();
      this.resolveExit({ code, signal });
    });
  }
  abort(error) {
    this.fatal = error;
    this.rejectHello(error);
    for (const task of this.pending.values()) task.reject(error);
    this.pending.clear();
  }
  async ready() {
    await this.deadline(this.hello);
    if (this.fatal) throw this.fatal;
    return this;
  }
  async deadline(promise, strictBoundary = false) {
    let timeout;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          const remaining = Math.max(
            0,
            Math.min(5000, this.deadlineAt - performance.now()),
          );
          timeout = setTimeout(
            () => reject(failure("APV_WATCHDOG")),
            strictBoundary ? Math.ceil(remaining) : remaining,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
  start(action, options = {}, intent) {
    if (this.fatal) throw this.fatal;
    if (!this.bound || this.closed || this.pending.size)
      throw failure("APV_CHILD_STATE");
    const id = randomUUID();
    let resolve;
    let reject;
    const promise = new Promise((done, failed) => {
      resolve = done;
      reject = failed;
    });
    this.pending.set(id, { resolve, reject, promise });
    promise.catch(() => {});
    const command = {
      parentOrder: ++parentOrder,
      createdAt: new Date().toISOString(),
      id,
      action,
      options,
      intent,
      nonce: this.nonce,
      runId: this.binding.runId,
      caseId: this.binding.caseId,
    };
    writeExclusive(
      path.join(
        this.binding.root,
        "evidence",
        `${this.workerId}-${id}.command.json`,
      ),
      command,
    );
    this.child.send(command);
    return { id, promise };
  }
  async command(action, options = {}, intent) {
    const task = this.start(action, options, intent);
    return this.deadline(task.promise);
  }
  async observeBlockedWatchdog(task, entry, phaseStarted) {
    if (
      this.binding.caseId !== "OP10" ||
      this.binding.variant !== "project_busy_watchdog" ||
      entry.runId !== this.binding.runId ||
      entry.caseId !== this.binding.caseId ||
      entry.workerId !== this.workerId ||
      entry.nonce !== this.nonce ||
      entry.commandId !== task.id ||
      entry.barrier !== "blocked_until_watchdog"
    )
      throw failure("APV_BARRIER_BINDING");
    try {
      await this.deadline(task.promise, true);
    } catch (error) {
      const observed = performance.now();
      if (
        error.code !== "APV_WATCHDOG" ||
        this.fatal ||
        this.closed ||
        observed < this.deadlineAt
      )
        throw error;
      const evidence = {
        runId: this.binding.runId,
        caseId: this.binding.caseId,
        workerId: this.workerId,
        nonce: this.nonce,
        commandId: task.id,
        barrierId: entry.id,
        category: error.code,
        phaseStarted,
        deadline: this.deadlineAt,
        observed,
        budgetMs: 5000,
        parentOrder: ++parentOrder,
        createdAt: new Date().toISOString(),
        source: "parent_Actor.deadline_timer",
      };
      writeExclusive(
        path.join(this.binding.root, "evidence", "watchdog-observed.json"),
        evidence,
      );
      return evidence;
    }
    throw Object.assign(failure("APV_INVARIANT"), {
      label: "blocked command completed before watchdog",
    });
  }
  async waitBarrier(task, name) {
    const deadline = Math.min(performance.now() + 4500, this.deadlineAt);
    while (performance.now() < deadline) {
      if (this.fatal) throw this.fatal;
      if (this.closed) throw failure("APV_BARRIER_CHILD_EXIT");
      const dir = path.join(this.binding.root, "control");
      for (const file of fs
        .readdirSync(dir)
        .filter(
          (value) =>
            value.startsWith(`${this.workerId}-${task.id}-`) &&
            value.endsWith(".entered.json"),
        )) {
        const entry = readJSON(path.join(dir, file));
        if (
          entry.runId !== this.binding.runId ||
          entry.caseId !== this.binding.caseId ||
          entry.workerId !== this.workerId ||
          entry.nonce !== this.nonce ||
          entry.commandId !== task.id ||
          entry.barrier !== name
        )
          throw failure("APV_BARRIER_BINDING");
        this.barriers.push(entry);
        return entry;
      }
      await sleep(10);
    }
    throw failure("APV_WATCHDOG");
  }
  resume(entry, cancel = false) {
    writeExclusive(
      path.join(this.binding.root, "control", `${entry.id}.release.json`),
      { ...entry, cancel },
    );
  }
  async killOwned(reason) {
    if (
      !this.bound ||
      this.closed ||
      this.child.exitCode !== null ||
      this.child.signalCode !== null ||
      this.bound.pid !== this.child.pid
    )
      throw failure("APV_KILL_BINDING");
    writeExclusive(
      path.join(
        this.binding.root,
        "evidence",
        `${this.workerId}.termination.json`,
      ),
      {
        runId: this.binding.runId,
        workerId: this.workerId,
        nonce: this.nonce,
        reason,
        bound: this.bound,
        target: "held ChildProcess object",
        requestedAt: new Date().toISOString(),
      },
    );
    if (!this.child.kill("SIGKILL")) throw failure("APV_KILL_FAILED");
    await this.deadline(this.exit);
    if (this.fatal) throw this.fatal;
  }
  async close() {
    if (this.closed) {
      if (this.fatal) throw this.fatal;
      return;
    }
    // Unblock only our authenticated entered barriers during harness cleanup.
    for (const entry of this.barriers) {
      const release = path.join(
        this.binding.root,
        "control",
        `${entry.id}.release.json`,
      );
      if (!fs.existsSync(release)) this.resume(entry, true);
    }
    if (this.pending.size) {
      for (const task of this.pending.values())
        await this.deadline(task.promise);
    }
    const result = await this.command("quit");
    if (!result.ok) throw failure("APV_CLOSE");
    const exited = await this.deadline(this.exit);
    if (exited.code !== 0) throw failure("APV_CLOSE_EXIT");
  }
}
module.exports = { Actor };
