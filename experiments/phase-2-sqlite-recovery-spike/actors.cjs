"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { fork } = require("node:child_process"),
  { randomUUID } = require("node:crypto"),
  { finished } = require("node:stream/promises");
const { checkReceipts } = require("./reference-oracle.cjs"),
  { fail } = require("./checks.cjs"),
  { confined, errorRecord } = require("./safety.cjs");
const { quiescent } = require("./lifecycle.cjs");
function createActors(context) {
  const { root, runId, repo, write } = context;
  const children = [];
  let counter = 0,
    order = 0;
  async function actor(unit, role) {
    const workerId = `${role}-${++counter}`,
      nonce = randomUUID();
    write(`raw/spawn-${workerId}.json`, {
      runId,
      unit,
      role,
      workerId,
      nonce,
      parentOrder: ++order,
      at: new Date().toISOString(),
    });
    const child = fork(path.join(__dirname, "worker.cjs"), [], {
      env: {
        ...process.env,
        APV_RECOVERY_WORKER: JSON.stringify({
          root,
          runId,
          repo,
          unit,
          role,
          workerId,
          nonce,
        }),
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
    });
    const identity = { runId, workerId, nonce, pid: child.pid };
    const life = {
      ...identity,
      unit,
      role,
      spawnedAt: new Date().toISOString(),
      childProcessBound: true,
      exit: null,
      kill: null,
    };
    const stdout = fs.createWriteStream(
        confined(root, "raw", `${workerId}-stdout.txt`),
        { flags: "wx" },
      ),
      stderr = fs.createWriteStream(
        confined(root, "raw", `${workerId}-stderr.txt`),
        { flags: "wx" },
      );
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    const drained = Promise.all([finished(stdout), finished(stderr)]);
    let pending,
      closed = false,
      failure;
    const rows = [];
    function reject(error) {
      failure ??= error;
      if (pending) {
        clearTimeout(pending.timer);
        pending.reject(error);
        pending = undefined;
      }
    }
    drained.catch(reject);
    child.on("error", reject);
    const exited = new Promise((resolve) => child.on("close", resolve));
    child.on("exit", (code, signal) => {
      closed = true;
      life.exit = {
        code,
        signal,
        at: new Date().toISOString(),
        parentOrder: ++order,
      };
      if (pending) reject(fail("EXIT_DURING_COMMAND"));
    });
    child.on("message", (row) => {
      try {
        rows.push(row);
        checkReceipts(rows, identity);
        if (row.unit !== unit || row.role !== role) throw fail("RECEIPT_SCOPE");
        write(`raw/parent-${++order}.json`, {
          parentOrder: order,
          workerId,
          sequence: row.sequence,
          commandId: row.commandId,
          kind: row.kind,
          at: new Date().toISOString(),
        });
        if (["ready", "done"].includes(row.kind)) {
          if (!pending || row.commandId !== pending.commandId)
            throw fail("UNMATCHED_RECEIPT");
          const resolve = pending.resolve;
          clearTimeout(pending.timer);
          pending = undefined;
          resolve(row.data);
        }
      } catch (error) {
        reject(error);
      }
    });
    function wait(commandId) {
      return new Promise((resolve, rejectPromise) => {
        if (pending || closed || failure)
          return rejectPromise(failure || fail("COMMAND_LIFECYCLE"));
        const timer = setTimeout(
          () => reject(fail("COMMAND_TIMEOUT_NOT_TESTED")),
          10000,
        );
        pending = { commandId, resolve, reject: rejectPromise, timer };
      });
    }
    async function waitExit() {
      await quiescent(exited, drained);
    }
    const api = {
      identity,
      life,
      rows,
      isClosed: () => closed,
      async call(command, args = {}, expectedError) {
        const commandId = randomUUID(),
          promise = wait(commandId);
        write(`raw/command-${commandId}.json`, {
          runId,
          workerId,
          nonce,
          commandId,
          command,
          args,
          parentOrder: ++order,
        });
        child.send({ runId, nonce, commandId, command, args });
        const result = await promise;
        if (expectedError) {
          if (
            result.ok ||
            (expectedError !== true && result.error.code !== expectedError)
          )
            throw Object.assign(fail("UNEXPECTED_WORKER_RESULT"), {
              cause: new Error(JSON.stringify(result)),
            });
          return result;
        }
        if (!result.ok)
          throw Object.assign(fail("WORKER_OPERATION_FAILED"), {
            cause: new Error(JSON.stringify(result)),
          });
        if (command === "close") {
          await waitExit();
          if (life.exit.code !== 0 || life.exit.signal)
            throw fail("UNCLEAN_NORMAL_EXIT");
        }
        return result.value;
      },
      async crash(barrier) {
        const row = rows.at(-2); // done is the last row of the parked command
        const last = rows.at(-1);
        if (
          !last ||
          last.kind !== "done" ||
          !last.data.ok ||
          !last.data.value.parked ||
          last.data.value.barrier !== barrier ||
          row?.kind !== "barrier" ||
          row.data.barrier !== barrier ||
          closed ||
          pending ||
          failure
        )
          throw fail("CRASH_BARRIER_UNPROVEN");
        life.kill = {
          barrier,
          receiptSequence: row.sequence,
          throughOwnedChildProcess: true,
          requestedAt: new Date().toISOString(),
          parentOrder: ++order,
        };
        if (!child.kill("SIGKILL")) throw fail("OWNED_KILL_FAILED");
        await waitExit();
        if (!life.exit || (life.exit.code === 0 && !life.exit.signal))
          throw fail("REAL_TERMINATION_UNPROVEN");
        return {
          confirmed: true,
          kind: "owned_process_exit",
          exitObserved: true,
          throughOwnedChildProcess: true,
          pid: identity.pid,
          workerNonce: nonce,
          evidenceRef: `lifecycle:${workerId}`,
          exit: life.exit,
          barrier,
        };
      },
    };
    const detach = () => {
      life.captureIncomplete = true;
      child.stdout.unpipe(stdout);
      child.stderr.unpipe(stderr);
      stdout.end();
      stderr.end();
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      child.channel?.unref();
    };
    children.push({ child, api, waitExit, detach });
    await wait("startup");
    return api;
  }
  async function finish() {
    const incomplete = [];
    for (const { api, waitExit, detach } of children) {
      if (!api.isClosed()) {
        try {
          await api.call("close");
        } catch (error) {
          incomplete.push({
            workerId: api.identity.workerId,
            error: errorRecord(error),
          });
        }
      }
      let captureComplete = false;
      try {
        await waitExit();
        captureComplete = true;
      } catch (error) {
        incomplete.push({
          workerId: api.identity.workerId,
          error: errorRecord(error),
          code: "INCOMPLETE_STREAM_CAPTURE",
        });
      }
      if (!api.isClosed() || !captureComplete) {
        incomplete.push({
          workerId: api.identity.workerId,
          code: "WORKER_STILL_PRESENT_OWNER_NOT_PROVEN_RELEASED",
        });
        detach();
      }
    }
    write(
      "lifecycle.json",
      children.map((r) => r.api.life),
    );
    return incomplete;
  }
  return { actor, finish, children, nextOrder: () => ++order };
}
module.exports = { createActors };
