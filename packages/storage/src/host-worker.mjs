import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import {
  admitSyntheticRoot,
  admitLocalValidationRoot,
} from "./host-admission.mjs";
import { openSyntheticStore } from "./development.mjs";
import { WriterLifecycle } from "./lifecycle.mjs";
import { plain, closed } from "./codec.mjs";
import { demand, safeFailure } from "./errors.mjs";

const nonce = process.argv[2],
  life = new WriterLifecycle();
let seq = 0,
  requestSeq = 0,
  spec,
  core,
  Database,
  loadRequire,
  cap,
  store,
  initializing = false,
  opening = false,
  closing = false,
  finishing = false,
  fatal = false;
function send(type, fields = {}, callback) {
  if (process.connected)
    process.send(
      { nonce, pid: process.pid, seq: ++seq, type, ...fields },
      (error) => {
        if (error) {
          closing = true;
          fatal = true;
          shutdown();
        }
        callback?.();
      },
    );
  else callback?.();
}
function stage(next) {
  life.advance(next);
  send("stage", { phase: next });
}
function revoke() {
  closing = true;
  if (!["REVOKING", "DRAINED", "CLOSED"].includes(life.phase()))
    stage("REVOKING");
}
function shutdown() {
  revoke();
  if (initializing || opening || finishing) return;
  finishing = true;
  // All SQLite work is synchronous on this thread: earlier message operations
  // have returned before this callback. Drain is not a durability assertion.
  if (life.phase() === "REVOKING") stage("DRAINED");
  let connectionsClosed = false;
  try {
    if (store) store.close();
    connectionsClosed = true;
  } catch {
    fatal = true;
  }
  const result = {
    status: connectionsClosed && !fatal ? "closed" : "unavailable",
    connectionsClosed,
    storeEvidence: store?.evidence() ?? [],
    replay: false,
    publish: false,
    ack: false,
    durability: "not_inferred",
  };
  process.exitCode = fatal ? 1 : 0;
  send("settled", { result }, () => {
    if (process.connected) process.disconnect();
  });
}
function failure(error, id = "startup", force = true) {
  const code = safeFailure(error).code;
  send("error", { id, code, fatal: force });
  if (force) {
    fatal = true;
    shutdown();
  }
}
function open() {
  if (closing) {
    shutdown();
    return;
  }
  opening = true;
  try {
    store = openSyntheticStore(cap, {
      Database,
      applyNormalizedEvent: core.applyNormalizedEvent,
      processorFingerprint: spec.processorFingerprint,
      projectId: spec.projectId,
      generation: spec.generation,
      ...(spec.nativePackage ? { nativePackage: spec.nativePackage } : {}),
      ...(spec.bootstrap !== undefined ? { bootstrap: spec.bootstrap } : {}),
    });
    const binaries = Object.keys(loadRequire.cache).filter((file) =>
      file.endsWith(".node"),
    );
    demand(
      binaries.length === 1 &&
        binaries[0] ===
          path.join(spec.driverRoot, "prebuilds/win32-x64.node") &&
        createHash("sha256")
          .update(fs.readFileSync(binaries[0]))
          .digest("hex") === spec.driverBinarySha256,
      "unavailable",
    );
    const phases = store
      .evidence()
      .filter((e) =>
        ["owner-acquired", "recovered", "fenced"].includes(e.phase),
      )
      .map(
        (e) =>
          ({
            "owner-acquired": "OWNER_HELD_UNFENCED",
            recovered: "RECOVERED",
            fenced: "FENCED",
          })[e.phase],
      );
    demand(
      JSON.stringify(phases) ===
        JSON.stringify(["OWNER_HELD_UNFENCED", "RECOVERED", "FENCED"]),
      "unavailable",
    );
    for (const phase of phases) stage(phase);
    const cut = store.read(),
      resourceBinding = store.resourceBinding();
    stage("ACTIVE");
    send("ready", {
      result: {
        status: "active",
        pid: process.pid,
        writer: store.writer(),
        head: cut.head,
        paths: store.paths(),
        resourceBinding,
        productionWriteEnabled: false,
      },
    });
  } catch (error) {
    opening = false;
    failure(error);
    return;
  }
  opening = false;
  if (closing) shutdown();
}
async function init(value) {
  initializing = true;
  try {
    demand(!spec, "unavailable");
    spec = value;
    const require = createRequire(path.join(spec.driverRoot, "package.json"));
    loadRequire = require;
    const hash = (file) =>
      createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    const pkg = JSON.parse(
      fs.readFileSync(path.join(spec.driverRoot, "package.json"), "utf8"),
    );
    demand(
      pkg.version === "13.0.3" && pkg.name === "better-sqlite3",
      "unavailable",
    );
    demand(
      hash(spec.corePath) === spec.processorFingerprint &&
        hash(path.join(spec.driverRoot, "prebuilds/win32-x64.node")) ===
          spec.driverBinarySha256,
      "unavailable",
    );
    Database = require(spec.driverRoot);
    core = await import(pathToFileURL(spec.corePath).href);
    if (closing) {
      initializing = false;
      shutdown();
      return;
    }
    cap = spec.localAdmission
      ? admitLocalValidationRoot({
          enabled: true,
          root: spec.root,
          ...spec.localAdmission,
          reopen: true,
          expectedNonce: spec.rootNonce,
        })
      : admitSyntheticRoot({
          enabled: true,
          root: spec.root,
          reopen: true,
          expectedNonce: spec.rootNonce,
        });
    send("parked");
    initializing = false;
    if (!spec.holdAtAdmission) open();
  } catch (error) {
    initializing = false;
    failure(error);
  }
}
process.on("message", (message) => {
  try {
    plain(message);
    closed(
      message,
      ["nonce", "parentPid", "seq", "action"],
      ["spec", "id", "request"],
    );
    demand(
      message.nonce === nonce &&
        message.parentPid === process.ppid &&
        message.seq === ++requestSeq,
      "unavailable",
    );
    if (message.action === "close") {
      shutdown();
      return;
    }
    demand(!closing, "unavailable");
    if (message.action === "init") {
      init(message.spec);
      return;
    }
    if (message.action === "activate") {
      demand(spec?.holdAtAdmission && cap && !store && !opening, "unavailable");
      open();
      return;
    }
    life.assertActive();
    demand(typeof message.id === "string", "unavailable");
    const start = store.evidence().length;
    try {
      let result;
      if (message.action === "read") result = store.read();
      else {
        demand(message.action === "commit", "unavailable");
        result = store.commit(message.request);
      }
      send("result", { id: message.id, result });
    } catch (error) {
      const retired = store
        .evidence()
        .slice(start)
        .some(
          (e) =>
            e.phase === "capability-revoked" ||
            e.phase === "outcome" ||
            (e.phase === "rollback" && e.status === "unknown"),
        );
      failure(
        error,
        message.id,
        message.action === "read" || retired || error?.code === "unavailable",
      );
    }
  } catch (error) {
    failure(error);
  }
});
process.on("disconnect", () => {
  if (!finishing) {
    fatal = true;
    shutdown();
  }
});
send("hello");
