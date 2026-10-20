import fs from "node:fs";
import { inspectInstalledResources } from "./installed-resources.mjs";
import { validateNativePackage } from "./native-attestor.mjs";
import path from "node:path";
import os from "node:os";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { StorageError, demand, safeFailure } from "./errors.mjs";
import { inspectCapability } from "./host-admission.mjs";
import {
  plain,
  closed,
  id,
  validateEvent,
  validateCursor,
  validateState,
} from "./codec.mjs";
import { WriterLifecycle } from "./lifecycle.mjs";

const requestFrameLimit = 8 * 1024 * 1024;
// Complete CoreState contains the retained Event Ledger, excluded from the
// 8 MiB snapshot cache. Cover the 128 MiB authority plus domain/envelope space.
const responseFrameLimit = 256 * 1024 * 1024;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  promise.catch(() => {});
  return { promise, resolve, reject };
}
const hash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
export function launchSyntheticHost(capability, options) {
  const admission = inspectCapability(capability);
  try {
    plain(options);
    demand(
      Buffer.byteLength(JSON.stringify(options)) <= responseFrameLimit - 4096,
    );
    closed(
      options,
      [
        "driverRoot",
        "driverBinarySha256",
        "corePath",
        "processorFingerprint",
        "projectId",
        "generation",
      ],
      ["bootstrap", "holdAtAdmission", "nativePackage"],
    );
    demand(
      process.platform === "win32" &&
        process.arch === "x64" &&
        process.version === "v24.21.0",
    );
    if (admission.local)
      demand(
        options.nativePackage &&
          options.projectId === admission.local.projectId &&
          options.generation === admission.local.generation,
        "binding_conflict",
      );
    if (options.nativePackage) validateNativePackage(options.nativePackage);
    id(options.projectId);
    id(options.generation);
    demand(
      options.holdAtAdmission === undefined ||
        typeof options.holdAtAdmission === "boolean",
    );
    for (const key of ["driverRoot", "corePath"])
      demand(
        path.isAbsolute(options[key]) &&
          fs.realpathSync.native(options[key]) === options[key],
      );
    const pkg = JSON.parse(
      fs.readFileSync(path.join(options.driverRoot, "package.json"), "utf8"),
    );
    demand(pkg.name === "better-sqlite3" && pkg.version === "13.0.3");
    if (
      options.corePath ===
      fileURLToPath(new URL("../../core.mjs", import.meta.url))
    ) {
      const deployed = inspectInstalledResources();
      demand(
        options.driverRoot === deployed.driverRoot &&
          options.corePath === deployed.corePath &&
          options.processorFingerprint === deployed.processorFingerprint &&
          options.nativePackage?.manifestPath ===
            deployed.nativePackage.manifestPath,
        "unavailable",
      );
      demand(
        process.versions.electron === "43.7.3" &&
          process.versions.modules === "148",
        "unavailable",
      );
    } else {
      const coreParent = path.dirname(options.corePath);
      demand(
        path.basename(options.corePath) === "core.mjs" &&
          path.dirname(coreParent) === fs.realpathSync.native(os.tmpdir()) &&
          /^apv-storage-evidence-/.test(path.basename(coreParent)),
      );
    }
    demand(
      hash(options.corePath) === options.processorFingerprint &&
        hash(path.join(options.driverRoot, "prebuilds/win32-x64.node")) ===
          options.driverBinarySha256,
    );
    if (options.bootstrap !== undefined)
      validateState(options.bootstrap, options.projectId, {
        allowedLocations: [admission.observedRoot],
      });
  } catch (error) {
    throw safeFailure(error);
  }
  const life = new WriterLifecycle(),
    ready = deferred(),
    admitted = deferred(),
    done = deferred();
  const nonce = randomUUID(),
    events = [];
  let child,
    pending,
    workerSeq = 0,
    requestSeq = 0,
    closing = false,
    failed = false,
    lastError,
    settled,
    finalized = false,
    parked = false,
    activated = false,
    exitObserved,
    streamsClosed = false,
    disconnected = false;
  const note = (kind, data = {}) =>
    events.push({ seq: events.length + 1, kind, data });
  const revoke = () => {
    closing = true;
    if (!["REVOKING", "DRAINED", "CLOSED"].includes(life.phase()))
      life.advance("REVOKING");
  };
  function send(action, fields = {}) {
    if (!child?.connected) return false;
    const envelope = {
      nonce,
      parentPid: process.pid,
      seq: ++requestSeq,
      action,
      ...fields,
    };
    note("request-envelope", {
      parentSeq: envelope.seq,
      action,
      id: fields.id ?? null,
      operationId: fields.request?.operationId ?? null,
    });
    child.send(envelope, (error) => {
      if (error) {
        failed = true;
        lastError = "unavailable";
        revoke();
      }
    });
    return true;
  }
  function stop(error) {
    failed = true;
    lastError = safeFailure(error).code;
    revoke();
    ready.reject(new StorageError(lastError));
    admitted.reject(new StorageError(lastError));
    if (pending) {
      pending.reject(new StorageError(lastError));
      pending = undefined;
    }
    send("close");
  }
  function finish(code, signal, observedExit) {
    if (finalized) return;
    finalized = true;
    revoke();
    if (observedExit) {
      if (life.phase() === "REVOKING") life.advance("DRAINED");
      if (life.phase() === "DRAINED") life.advance("CLOSED");
    }
    const result = {
      status:
        observedExit && code === 0 && settled?.status === "closed" && !failed
          ? "closed"
          : "unavailable",
      pid: child.pid,
      exitCode: code,
      signal,
      processExited: observedExit,
      durability: "not_inferred",
      replay: false,
      publish: false,
      ack: false,
    };
    note("process-exit", result);
    ready.reject(new StorageError(lastError));
    admitted.reject(new StorageError(lastError));
    if (pending) {
      pending.reject(new StorageError());
      pending = undefined;
    }
    done.resolve(result);
  }
  child = fork(
    fileURLToPath(new URL("./host-worker.mjs", import.meta.url)),
    [nonce],
    {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      serialization: "json",
      windowsHide: true,
      execArgv: [],
      env: {
        ...process.env,
        ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
      },
    },
  );
  note("spawn", { pid: child.pid, nonce, node: process.version });
  child.stdout.on("data", () => stop(new StorageError()));
  child.stderr.on("data", () => stop(new StorageError()));
  child.on("error", () => stop(new StorageError()));
  function finishWhenClosed() {
    if (streamsClosed && (disconnected || !child.connected))
      setImmediate(() => {
        if (!finalized)
          finish(
            exitObserved?.code ?? null,
            exitObserved?.signal ?? null,
            !!exitObserved,
          );
      });
  }
  child.on("exit", (code, signal) => {
    exitObserved = { code, signal };
    revoke();
    note("os-exit-observed", { pid: child.pid, code, signal });
    finishWhenClosed();
  });
  child.on("disconnect", () => {
    disconnected = true;
    finishWhenClosed();
  });
  child.on("close", () => {
    streamsClosed = true;
    finishWhenClosed();
  });
  child.on("message", (message) => {
    try {
      plain(message);
      closed(
        message,
        ["nonce", "pid", "seq", "type"],
        ["phase", "result", "id", "code", "fatal"],
      );
      demand(
        message.nonce === nonce &&
          message.pid === child.pid &&
          message.seq === ++workerSeq &&
          Buffer.byteLength(JSON.stringify(message)) <= responseFrameLimit,
        "unavailable",
      );
      note("worker-envelope", {
        workerSeq: message.seq,
        workerPid: message.pid,
        nonce: message.nonce,
        type: message.type,
        id: message.id ?? null,
        phase: message.phase ?? null,
      });
      if (message.type === "hello") {
        note("hello", { pid: message.pid, nonce });
        if (closing) send("close");
        else
          send("init", {
            spec: {
              ...options,
              root: admission.root,
              rootNonce: admission.nonce,
              ...(admission.local ? { localAdmission: admission.local } : {}),
            },
          });
      } else if (message.type === "parked") {
        parked = true;
        note("admission-barrier", { pid: message.pid, nonce });
        admitted.resolve({ pid: message.pid, nonce });
      } else if (message.type === "stage") {
        note("worker-stage", { phase: message.phase, pid: message.pid });
        if (message.phase === "REVOKING") revoke();
        else if (message.phase === "DRAINED") {
          revoke();
          if (life.phase() === "REVOKING") life.advance("DRAINED");
        } else if (!closing) life.advance(message.phase);
      } else if (message.type === "ready") {
        note("ready", message.result);
        if (!closing) ready.resolve(message.result);
        else send("close");
      } else if (message.type === "result") {
        demand(pending && pending.id === message.id, "unavailable");
        const current = pending;
        pending = undefined;
        current.resolve(message.result);
      } else if (message.type === "error") {
        const error = new StorageError(message.code);
        note("operation-error", {
          id: message.id,
          code: error.code,
          fatal: message.fatal,
        });
        if (message.id === "startup") {
          ready.reject(error);
          admitted.reject(error);
        } else {
          demand(pending?.id === message.id, "unavailable");
          pending.reject(error);
          pending = undefined;
        }
        if (message.fatal) {
          failed = true;
          lastError = error.code;
          revoke();
        }
      } else if (message.type === "settled") {
        settled = message.result;
        note("settled", settled);
      } else demand(false, "unavailable");
    } catch (error) {
      stop(error);
    }
  });
  function operation(action, request) {
    try {
      demand(!closing && !finalized && !pending, "unavailable");
      life.assertActive();
      if (action === "commit") {
        plain(request);
        closed(
          request,
          ["operationId", "operationNonce", "expectedHead", "writer", "events"],
          ["cursor", "createSnapshot"],
        );
        id(request.operationId);
        id(request.operationNonce);
        closed(request.writer, ["generation", "epoch", "token"]);
        id(request.writer.generation);
        id(request.writer.token);
        demand(
          Number.isSafeInteger(request.writer.epoch) &&
            request.writer.epoch >= 0 &&
            Number.isSafeInteger(request.expectedHead) &&
            request.expectedHead >= 1,
        );
        demand(Array.isArray(request.events) && request.events.length > 0);
        request.events.forEach((e) => validateEvent(e, options.projectId));
        if (request.cursor !== undefined) validateCursor(request.cursor);
        demand(
          request.createSnapshot === undefined ||
            typeof request.createSnapshot === "boolean",
        );
        demand(
          Buffer.byteLength(JSON.stringify(request)) <=
            requestFrameLimit - 4096,
        );
      }
      const d = deferred();
      pending = { ...d, id: randomUUID() };
      if (
        !send(action, {
          id: pending.id,
          ...(action === "commit" ? { request } : {}),
        })
      ) {
        pending = undefined;
        throw new StorageError();
      }
      return d.promise;
    } catch (error) {
      return Promise.reject(safeFailure(error));
    }
  }
  return Object.freeze({
    admitted: admitted.promise,
    ready: ready.promise,
    closed: done.promise,
    activate: () => {
      demand(
        parked && options.holdAtAdmission === true && !activated && !closing,
        "unavailable",
      );
      activated = true;
      send("activate");
    },
    read: () => operation("read"),
    commit: (request) => operation("commit", request),
    close: () => {
      if (!finalized && !closing) {
        revoke();
        note("intake-disabled");
        send("close");
      }
      return done.promise;
    },
    status: () => ({
      phase: life.phase(),
      pid: child.pid,
      nonce,
      intakeEnabled: !closing && life.phase() === "ACTIVE",
      pendingOperations: pending ? 1 : 0,
      productionWriteEnabled: false,
      history: life.history(),
    }),
    evidence: () => structuredClone(events),
  });
}
