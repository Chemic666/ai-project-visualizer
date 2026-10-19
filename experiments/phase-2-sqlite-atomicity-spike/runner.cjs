"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const { createRequire } = require("node:module");
const { fork } = require("node:child_process");
const { finished } = require("node:stream/promises");
const { verdict, verifyCut, requireSettled, fail } = require("./checks.cjs");
const { barriers } = require("./db.cjs");
const { checkReceipts, checkComplete } = require("./oracle.cjs");
const { runCase } = require("./scenarios.cjs");
const repo = path.resolve(__dirname, "../..");
const fileHash = (filename) =>
  createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
function driverFiles() {
  const localRequire = createRequire(
    path.join(repo, "experiments/phase-2-sqlite-driver-spike/package.json"),
  );
  const metadata = localRequire.resolve("better-sqlite3/package.json");
  const pkg = JSON.parse(fs.readFileSync(metadata, "utf8"));
  if (pkg.version !== "13.0.3") throw fail("DRIVER_VERSION");
  const native = path.join(path.dirname(metadata), "prebuilds/win32-x64.node");
  return {
    metadata,
    native,
    version: pkg.version,
    nativeSha256: fileHash(native),
  };
}
function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(filename) : [filename];
  });
}
async function execute(caseName) {
  if (
    process.platform !== "win32" ||
    process.arch !== "x64" ||
    Number(process.versions.node.split(".")[0]) !== 24
  )
    throw fail("ENVIRONMENT_OUT_OF_SCOPE");
  const driver = driverFiles();
  const parent = path.join(os.tmpdir(), "apv-sqlite-atomicity");
  let ancestor = path.resolve(os.tmpdir());
  while (true) {
    if (fs.existsSync(path.join(ancestor, ".git")))
      throw fail("TEMP_INSIDE_REPOSITORY");
    const next = path.dirname(ancestor);
    if (next === ancestor) break;
    ancestor = next;
  }
  fs.mkdirSync(parent, { recursive: true });
  for (const dir of [os.tmpdir(), parent])
    if (
      fs.lstatSync(dir).isSymbolicLink() ||
      fs.realpathSync.native(dir).toLowerCase() !==
        path.resolve(dir).toLowerCase() ||
      dir.startsWith("\\\\")
    )
      throw fail("UNSAFE_TEMP_ROOT");
  const runId = randomUUID();
  const root = path.join(parent, runId);
  fs.mkdirSync(root);
  fs.mkdirSync(path.join(root, "raw"));
  const write = (relative, data) =>
    fs.writeFileSync(path.join(root, relative), JSON.stringify(data, null, 2), {
      flag: "wx",
    });
  const sourceList = [
    ...sources(__dirname),
    ...sources(path.join(repo, "packages/core/src")),
  ];
  const sourceHashes = Object.fromEntries(
    sourceList.map((filename) => [
      path.relative(repo, filename).replaceAll("\\", "/"),
      fileHash(filename),
    ]),
  );
  write("manifest.json", {
    schema: 1,
    runId,
    caseName,
    createdAt: new Date().toISOString(),
    executionSource:
      "explicit CMD --execute; isolated ordinary Node children; not Extension Host",
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    sourceHashes,
    driver: { version: driver.version, nativeSha256: driver.nativeSha256 },
    limitations: [
      "stable-source synthetic subset only",
      "production S02/S13 NOT TESTED",
      "no hidden-loss/physical binding/COMMIT IO proof",
    ],
  });
  let parentOrder = 0,
    workerNumber = 0;
  const children = [],
    checks = [],
    observations = [];
  let harnessError;
  try {
    await require(path.join(repo, "node_modules/esbuild")).build({
      entryPoints: [path.join(__dirname, "fixtures.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: path.join(root, "fixture-module.cjs"),
    });
    const fixture = require(
      path.join(root, "fixture-module.cjs"),
    ).createFixtures();
    write("fixture.json", fixture);
    async function actor(unit, role) {
      const workerId = `${role}-${++workerNumber}`;
      const nonce = randomUUID();
      const child = fork(path.join(__dirname, "worker.cjs"), [], {
        env: {
          ...process.env,
          APV_ATOMIC_WORKER: JSON.stringify({
            root,
            runId,
            workerId,
            nonce,
            unit,
          }),
        },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        windowsHide: true,
      });
      const identity = { runId, workerId, nonce, pid: child.pid };
      const rows = [];
      let pending,
        closed = false,
        expectedExit = false,
        evidenceError;
      const life = {
        ...identity,
        role,
        unit,
        spawnedAt: new Date().toISOString(),
        childProcessBound: true,
        exit: null,
      };
      children.push({
        child,
        life,
        close: () => api.call("close"),
        isClosed: () => closed,
      });
      const stdoutFile = fs.createWriteStream(
        path.join(root, "raw", `${workerId}-stdout.txt`),
        { flags: "wx" },
      );
      const stderrFile = fs.createWriteStream(
        path.join(root, "raw", `${workerId}-stderr.txt`),
        { flags: "wx" },
      );
      child.stdout.pipe(stdoutFile);
      child.stderr.pipe(stderrFile);
      const drained = Promise.all([finished(stdoutFile), finished(stderrFile)]);
      drained.catch((error) => reject(error));
      function reject(error) {
        evidenceError ??= error;
        if (pending) {
          clearTimeout(pending.timer);
          pending.reject(error);
          pending = undefined;
        }
      }
      child.on("error", (error) => reject(error));
      child.on("exit", (code, signal) => {
        closed = true;
        life.exit = {
          code,
          signal,
          expectedExit,
          parentOrder: ++parentOrder,
          observedAt: new Date().toISOString(),
        };
        if (pending) reject(fail("WORKER_EXIT_DURING_COMMAND"));
      });
      const exited = new Promise((resolve) => child.on("close", resolve));
      child.on("message", (receipt) => {
        try {
          rows.push(receipt);
          checkReceipts(rows, identity);
          const observation = {
            parentOrder: ++parentOrder,
            observedAt: new Date().toISOString(),
            workerId,
            sequence: receipt.sequence,
            commandId: receipt.commandId,
            kind: receipt.kind,
          };
          observations.push(observation);
          fs.writeFileSync(
            path.join(root, "raw", `parent-${observation.parentOrder}.json`),
            JSON.stringify(observation, null, 2),
            { flag: "wx" },
          );
          if (receipt.kind === "ready" || receipt.kind === "done") {
            if (!pending || receipt.commandId !== pending.commandId)
              throw fail("UNMATCHED_RECEIPT");
            clearTimeout(pending.timer);
            const resolve = pending.resolve;
            pending = undefined;
            resolve(receipt.data);
          }
        } catch (error) {
          reject(error);
        }
      });
      const wait = (commandId) =>
        new Promise((resolve, rejectPromise) => {
          if (pending || closed)
            return rejectPromise(fail("COMMAND_LIFECYCLE"));
          if (evidenceError) return rejectPromise(evidenceError);
          pending = {
            commandId,
            resolve,
            reject: rejectPromise,
            timer: setTimeout(
              () => reject(fail("COMMAND_TIMEOUT_NOT_TESTED")),
              5000,
            ),
          };
        });
      await wait("startup");
      const api = {
        identity,
        rows,
        async call(command, args = {}, expectedError) {
          const commandId = randomUUID();
          const promise = wait(commandId);
          write(`raw/command-${commandId}.json`, {
            runId,
            workerId,
            nonce,
            commandId,
            command,
            args,
            parentOrder: ++parentOrder,
            createdAt: new Date().toISOString(),
          });
          if (command === "close") expectedExit = true;
          child.send({ runId, nonce, commandId, command, args });
          const result = await promise;
          if (expectedError) {
            assert.equal(result.ok, false);
            if (result.error.code === "STALE_GUARD_ACCEPTED")
              assert.fail("Actual stale capability was accepted");
            if (result.error.code !== expectedError)
              throw Object.assign(fail("UNEXPECTED_WORKER_ERROR"), {
                detail: result,
              });
            requireSettled(result.settlement);
            assert.equal(
              rows.filter(
                (row) =>
                  row.commandId === commandId &&
                  ["committed", "published", "fixture_ack"].includes(row.kind),
              ).length,
              0,
            );
            return result;
          }
          if (!result.ok)
            throw Object.assign(fail("UNEXPECTED_WORKER_ERROR"), {
              detail: result,
            });
          if (command === "commit") {
            const committed = rows.filter(
              (row) => row.commandId === commandId && row.kind === "committed",
            );
            const ackIntent = rows.filter(
              (row) =>
                row.commandId === commandId && row.kind === "fixture_ack",
            );
            assert.equal(committed.length, 1);
            assert.equal(ackIntent.length, 1);
            assert.equal(
              ackIntent[0].data.operation,
              committed[0].data.operation,
            );
            write(`raw/ack-sink-${commandId}.json`, {
              runId,
              receiver: "independent parent fixture ACK sink",
              workerId,
              nonce,
              writerPid: child.pid,
              unit,
              commandId,
              operationId: committed[0].data.operation,
              committedReceiptSequence: committed[0].sequence,
              ackIntentReceiptSequence: ackIntent[0].sequence,
              parentOrder: ++parentOrder,
              receivedAt: new Date().toISOString(),
              fixtureOnly: true,
            });
          }
          if (command === "close") {
            await Promise.race([
              exited,
              new Promise((_, rejectPromise) => {
                const timer = setTimeout(
                  () => rejectPromise(fail("EXIT_TIMEOUT_NOT_TESTED")),
                  5000,
                );
                timer.unref();
              }),
            ]);
            await drained;
            if (evidenceError) throw evidenceError;
            assert.equal(life.exit.code, 0);
            assert.equal(life.exit.signal, null);
          }
          return result.value;
        },
      };
      return api;
    }
    async function setup(unit) {
      const s = await actor(unit, "setup");
      await s.call("setup");
      await s.call("close");
    }
    async function reader(unit, checkpoint) {
      const r = await actor(unit, "reader");
      const cut = await r.call("read", { checkpoint });
      checkReceipts(r.rows, r.identity, true);
      await r.call("close");
      return cut;
    }
    await runCase(caseName, {
      actor,
      setup,
      reader,
      fixture,
      checks,
      barriers,
      verifyCut,
      checkComplete,
    });
  } catch (error) {
    harnessError = {
      code: error.code || "HARNESS_ERROR",
      message: error.message,
      detail: error.detail,
    };
    checks.push({
      status:
        error.code === "ERR_ASSERTION" || error.code === "CUT_MISMATCH"
          ? "FAIL"
          : "NOT TESTED",
      error: harnessError,
    });
  } finally {
    for (const record of children) {
      if (!record.isClosed()) {
        try {
          await record.close();
        } catch (error) {
          checks.push({
            status: "NOT TESTED",
            error: {
              code: "CLEANUP_INCOMPLETE",
              message: error.message,
              workerId: record.life.workerId,
            },
          });
        }
      }
      if (!record.isClosed()) {
        // No global process-name cleanup. Preserve blockage; no claimed PASS.
        checks.push({
          status: "NOT TESTED",
          error: {
            code: "WORKER_STILL_PRESENT",
            workerId: record.life.workerId,
          },
        });
        record.child.unref();
        record.child.channel?.unref();
      }
    }
    write(
      "lifecycle.json",
      children.map((child) => child.life),
    );
    write("parent-observations.json", observations);
    if (
      sourceList.some(
        (filename) =>
          fileHash(filename) !==
          sourceHashes[path.relative(repo, filename).replaceAll("\\", "/")],
      ) ||
      fileHash(driver.native) !== driver.nativeSha256
    )
      checks.push({
        status: "NOT TESTED",
        error: { code: "SOURCE_OR_NATIVE_CHANGED_DURING_RUN" },
      });
    // Hash retained SQLite/WAL files only after all normal handles close.
    // An incomplete cleanup still records diagnostics, never a clean verdict.
    const inventory = sources(root);
    write(
      "inventory.json",
      inventory.map((filename) => ({
        path: path.relative(root, filename).replaceAll("\\", "/"),
        sha256: fileHash(filename),
        size: fs.statSync(filename).size,
      })),
    );
    const status = verdict(true, checks);
    write("derived-result.json", {
      runId,
      caseName,
      status,
      checks,
      harnessError,
      cliExitCode: "UNVERIFIED; capture %ERRORLEVEL% in CMD independently",
      productionAcceptance: "NOT TESTED",
      limitation:
        "Runner verdict requires independent raw-receipt/SQL/inventory audit; source contract conflict blocks broader cases",
    });
    console.log(JSON.stringify({ runId, evidenceRoot: root, status }, null, 2));
    process.exitCode =
      status === "PASS WITH LIMITATION" ? 0 : status === "FAIL" ? 1 : 2;
  }
}
async function main(args) {
  if (args.length === 1 && args[0] === "--list") {
    console.log(
      JSON.stringify(
        {
          cases: ["A", "B", "C"],
          D: "independent pinned/fresh Reader checkpoints inside A/B/C",
          E: "BUSY/guard/constraint settlement inside A/B/C",
          status: "NOT TESTED",
          barriers,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (args.length === 1 && args[0] === "--preflight") {
    const driver = driverFiles();
    console.log(
      JSON.stringify(
        {
          status: "STATIC METADATA ONLY",
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          driverVersion: driver.version,
          nativeSha256: driver.nativeSha256,
          sqliteLoaded: false,
          workersStarted: false,
          runtime: "NOT TESTED",
        },
        null,
        2,
      ),
    );
    return;
  }
  if (
    args.length !== 3 ||
    args[0] !== "--case" ||
    !["A", "B", "C"].includes(args[1]) ||
    args[2] !== "--execute"
  )
    throw fail(
      "USAGE: --list | --preflight | --case A|B|C --execute (requires separate authorization)",
    );
  await execute(args[1]);
}
if (require.main === module)
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
module.exports = { main };
