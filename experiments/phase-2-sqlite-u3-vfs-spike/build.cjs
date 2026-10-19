"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { hash, write, physical, driverPaths } = require("./checks.cjs");
function main(args) {
  if (args.length === 0) {
    console.log(
      "G0 disabled by default. build.cjs --build --compiler ABSOLUTE_CLANG_EXE",
    );
    return;
  }
  if (
    args.length !== 3 ||
    args[0] !== "--build" ||
    args[1] !== "--compiler" ||
    !path.isAbsolute(args[2])
  )
    throw new Error("INVALID_G0_ARGUMENTS");
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("WINDOWS_X64_REQUIRED");
  const compiler = fs.realpathSync.native(args[2]),
    inspect = path.join(path.dirname(compiler), "llvm-readobj.exe"),
    driver = driverPaths();
  physical(__dirname);
  if (!fs.existsSync(inspect)) throw new Error("PE_INSPECTOR_MISSING");
  const buildRoot = path.join(__dirname, "build");
  if (!fs.existsSync(buildRoot)) fs.mkdirSync(buildRoot);
  physical(buildRoot);
  const buildId = crypto.randomUUID(),
    dir = path.join(buildRoot, buildId);
  fs.mkdirSync(dir);
  physical(dir);
  const inputPaths = [
    path.join(__dirname, "native/apv_vfs.c"),
    path.join(driver.headers, "sqlite3.h"),
    path.join(driver.headers, "sqlite3ext.h"),
    path.join(driver.base, "binding.gyp"),
    path.join(driver.base, "deps/defines.gypi"),
    driver.package,
  ];
  const inputs = Object.fromEntries(inputPaths.map((p) => [p, hash(p)]));
  const dll = path.join(dir, "apv_vfs.dll");
  const command = [
    "-std=c11",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-O2",
    "-shared",
    "-I",
    driver.headers,
    inputPaths[0],
    "-o",
    dll,
    "-Wl,--no-undefined",
  ];
  const receipt = {
    buildId,
    started: new Date().toISOString(),
    compiler,
    compilerSha256: hash(compiler),
    inspector: inspect,
    inspectorSha256: hash(inspect),
    command: { exe: compiler, args: command },
    inputs,
    node: process.version,
    nodeSha256: hash(process.execPath),
    driver: "13.0.3",
    driverSha256: hash(driver.native),
    sqliteHeader: "3.53.4",
    integration: "NOT TESTED",
    g2: "NOT AUTHORIZED / NOT TESTED",
  };
  write(path.join(dir, "build-start.json"), receipt);
  for (const [label, exe, argv] of [
    ["compiler-version", compiler, ["--version"]],
    ["compile", compiler, command],
    [
      "pe",
      inspect,
      ["--file-headers", "--coff-exports", "--coff-imports", dll],
    ],
  ]) {
    const r = spawnSync(exe, argv, { encoding: "utf8", windowsHide: true });
    write(path.join(dir, label + ".stdout.txt"), r.stdout || "");
    write(path.join(dir, label + ".stderr.txt"), r.stderr || "");
    write(path.join(dir, label + ".exit.json"), {
      exe,
      args: argv,
      status: r.status,
      signal: r.signal,
      error: r.error ? { code: r.error.code, message: r.error.message } : null,
    });
    if (r.error || r.status !== 0) {
      write(path.join(dir, "build.json"), {
        ...receipt,
        status: "BUILD FAIL",
        failedStage: label,
      });
      throw new Error("BUILD_FAIL: " + dir);
    }
    if (
      label === "pe" &&
      (!r.stdout.includes("IMAGE_FILE_MACHINE_AMD64") ||
        !r.stdout.includes("sqlite3_apvvfs_init") ||
        /Name:.*sqlite.*\.dll/i.test(r.stdout) ||
        /Symbol: sqlite3_/i.test(r.stdout))
    )
      throw new Error("PE_EXPORT_OR_LINKAGE_REJECTED: " + dir);
  }
  write(path.join(dir, "build.json"), {
    ...receipt,
    status: "BUILD PASS",
    binarySha256: hash(dll),
    finished: new Date().toISOString(),
    databaseOpens: 0,
  });
  console.log(
    JSON.stringify(
      {
        g0: "BUILD PASS",
        buildId,
        dir,
        dllSha256: hash(dll),
        g1: "PREPARED / NOT TESTED",
        g2: "NOT AUTHORIZED / NOT TESTED",
      },
      null,
      2,
    ),
  );
}
try {
  main(process.argv.slice(2));
} catch (e) {
  console.error(e.stack);
  process.exitCode = 1;
}
