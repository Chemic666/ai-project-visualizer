"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { randomUUID } = require("node:crypto"),
  { createRequire } = require("node:module");
const {
    gate,
    cases,
    confined,
    physicalDirectory,
    errorRecord,
  } = require("./safety.cjs"),
  { hash, fail, verdict } = require("./checks.cjs"),
  { fileHash, files, inventory } = require("./evidence.cjs");
const repo = path.resolve(__dirname, "../..");
function driverInfo() {
  const local = createRequire(
    path.join(repo, "experiments/phase-2-sqlite-driver-spike/package.json"),
  );
  const metadata = local.resolve("better-sqlite3/package.json"),
    version = JSON.parse(fs.readFileSync(metadata, "utf8")).version;
  if (version !== "13.0.3") throw fail("DRIVER_VERSION");
  return {
    version,
    nativeSha256: fileHash(
      path.join(path.dirname(metadata), "prebuilds/win32-x64.node"),
    ),
  };
}
function runRoot(runId) {
  return confined(path.join(os.tmpdir(), "apv-sqlite-recovery"), runId);
}
function writeAt(root, relative, value) {
  const filename = confined(root, ...relative.split("/"));
  fs.writeFileSync(filename, JSON.stringify(value, null, 2), { flag: "wx" });
}
function reserve(caseName, runId) {
  if (
    process.platform !== "win32" ||
    process.arch !== "x64" ||
    process.version !== "v24.21.0"
  )
    throw fail("ENVIRONMENT_OUT_OF_SCOPE");
  const driver = driverInfo(),
    parent = physicalDirectory(
      path.join(os.tmpdir(), "apv-sqlite-recovery"),
      repo,
    );
  fs.mkdirSync(parent, { recursive: true });
  physicalDirectory(parent, repo);
  const root = runRoot(runId);
  fs.mkdirSync(root);
  physicalDirectory(root, repo);
  fs.mkdirSync(confined(root, "raw"));
  fs.mkdirSync(confined(root, "unit-identities"));
  const sourceHashes = Object.fromEntries(
    [...files(__dirname), ...files(path.join(repo, "packages/core/src"))].map(
      (f) => [path.relative(repo, f).replaceAll("\\", "/"), fileHash(f)],
    ),
  );
  writeAt(root, "manifest.json", {
    schema: 1,
    runId,
    caseName,
    root,
    repo,
    createdAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    driver,
    sourceHashes,
    fingerprint: hash(sourceHashes),
    execution: "NOT STARTED",
    productionAcceptance: "NOT TESTED",
    scope:
      "stable source event; disposable cooperative Windows processes; U2 controlled result loss; U3 NOT TESTED",
  });
  return root;
}
async function execute(caseName, runId) {
  const root = runRoot(runId);
  physicalDirectory(root, repo);
  const manifest = JSON.parse(
    fs.readFileSync(confined(root, "manifest.json"), "utf8"),
  );
  if (
    manifest.runId !== runId ||
    manifest.caseName !== caseName ||
    manifest.root !== root ||
    manifest.repo !== repo ||
    process.version !== manifest.node ||
    JSON.stringify(driverInfo()) !== JSON.stringify(manifest.driver)
  )
    throw fail("RESERVATION_BINDING");
  for (const [relative, digest] of Object.entries(manifest.sourceHashes))
    if (fileHash(confined(repo, ...relative.split("/"))) !== digest)
      throw fail("SOURCE_CHANGED_BEFORE_EXECUTION");
  const write = (relative, value) => writeAt(root, relative, value);
  write("execution-start.json", {
    runId,
    caseName,
    startedAt: new Date().toISOString(),
    noAutomaticRetry: true,
  });
  const { createActors } = require("./actors.cjs"),
    { runCase } = require("./scenarios.cjs");
  const actors = createActors({ root, runId, repo, write }),
    checks = [];
  let harnessError,
    quiescent = false;
  try {
    const local = createRequire(path.join(repo, "package.json"));
    const result = await local("esbuild").build({
      entryPoints: [path.join(__dirname, "fixtures.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      write: false,
    });
    fs.writeFileSync(
      confined(root, "fixture-module.cjs"),
      result.outputFiles[0].text,
      { flag: "wx" },
    );
    const fixture = require(
      confined(root, "fixture-module.cjs"),
    ).createFixtures();
    write("fixture.json", fixture);
    await runCase(caseName, { ...actors, root, runId, fixture, write, checks });
  } catch (error) {
    harnessError = errorRecord(error);
    checks.push({
      status: ["ERR_ASSERTION", "CUT_MISMATCH"].includes(error.code)
        ? "FAIL"
        : "NOT TESTED",
      error: harnessError,
    });
  } finally {
    const incomplete = await actors.finish();
    quiescent = incomplete.length === 0;
    if (!quiescent) checks.push({ status: "NOT TESTED", incomplete });
    for (const [relative, digest] of Object.entries(manifest.sourceHashes))
      if (fileHash(confined(repo, ...relative.split("/"))) !== digest)
        checks.push({
          status: "NOT TESTED",
          code: "SOURCE_CHANGED_DURING_EXECUTION",
          relative,
        });
    if (JSON.stringify(driverInfo()) !== JSON.stringify(manifest.driver))
      checks.push({
        status: "NOT TESTED",
        code: "NATIVE_CHANGED_DURING_EXECUTION",
      });
    const status = verdict(true, checks);
    write("derived-result.json", {
      runId,
      caseName,
      status,
      quiescent,
      checks,
      harnessError,
      productionAcceptance: "NOT TESTED",
      U3: "NOT TESTED",
      cliExitCode: "UNVERIFIED until independent CMD capture",
      independentAuditRequired: true,
    });
    write("inventory.json", inventory(root));
    write("seal.json", {
      runId,
      inventorySha256: fileHash(confined(root, "inventory.json")),
      quiescent,
      exclusions:
        "inventory/seal and independently sealed CMD output/exit files",
    });
    console.log(
      JSON.stringify(
        { runId, evidenceRoot: root, status, independentAuditRequired: true },
        null,
        2,
      ),
    );
    process.exitCode =
      status === "PASS WITH LIMITATION" ? 0 : status === "FAIL" ? 1 : 2;
  }
}
async function main(
  args,
  output = (value) => console.log(JSON.stringify(value, null, 2)),
) {
  const selected = gate(args);
  if (selected.mode === "list")
    return output({
      cases,
      U3: "PLAN ONLY — NOT TESTED; no reliable audited real COMMIT IO injection",
      status: "NOT TESTED",
      workersStarted: false,
      databasesCreated: false,
    });
  if (selected.mode === "preflight")
    return output({
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      driver: driverInfo(),
      metadataOnly: true,
      sqliteLoaded: false,
      workersStarted: false,
      databasesCreated: false,
    });
  const runId = selected.runId || randomUUID();
  if (selected.mode === "reserve")
    return output({
      runId,
      evidenceRoot: reserve(selected.caseName, runId),
      workersStarted: false,
      databasesCreated: false,
    });
  if (!selected.runId) reserve(selected.caseName, runId);
  return execute(selected.caseName, runId);
}
if (require.main === module)
  main(process.argv.slice(2)).catch((error) => {
    console.error(JSON.stringify(errorRecord(error), null, 2));
    process.exitCode = 2;
  });
module.exports = { main };
