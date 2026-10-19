import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
if (!args.length) {
  console.log(
    "Native attestor build disabled. --build --compiler ABSOLUTE_CLANG --driver-root ABSOLUTE_DRIVER",
  );
} else {
  if (
    args.length !== 5 ||
    args[0] !== "--build" ||
    args[1] !== "--compiler" ||
    args[3] !== "--driver-root" ||
    process.platform !== "win32" ||
    process.arch !== "x64"
  )
    throw Error("BUILD_ARGUMENTS_REJECTED");
  const hash = (p) =>
      createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
    compiler = fs.realpathSync.native(args[2]),
    driver = fs.realpathSync.native(args[4]);
  if (
    hash(compiler) !==
    "febeba5265931ff7f83d6e40cd1e5953c62a640e20928fd6eab86b64687e92dd"
  )
    throw Error("UNAPPROVED_COMPILER");
  const inspector = path.join(path.dirname(compiler), "llvm-readobj.exe"),
    source = fileURLToPath(new URL("./apv_identity.c", import.meta.url)),
    headers = path.join(driver, "deps/sqlite3");
  const buildId = randomUUID(),
    root = path.join(
      fs.realpathSync.native(os.tmpdir()),
      "apv-storage-attestor-build-" + buildId,
    );
  fs.mkdirSync(root);
  const dll = path.join(root, "apv_identity.dll"),
    command = [
      "-std=c11",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-O2",
      "-shared",
      "-I",
      headers,
      source,
      "-o",
      dll,
      "-Wl,--no-undefined",
    ];
  const inputs = [
    source,
    fileURLToPath(import.meta.url),
    path.join(headers, "sqlite3.h"),
    path.join(headers, "sqlite3ext.h"),
    path.join(driver, "package.json"),
    path.join(driver, "binding.gyp"),
    path.join(driver, "deps/defines.gypi"),
  ].map((file) => ({ file, sha256: hash(file) }));
  const manifest = {
    buildId,
    root,
    started: new Date().toISOString(),
    compiler,
    compilerSha256: hash(compiler),
    inspector,
    inspectorSha256: hash(inspector),
    command,
    inputs,
    driverRoot: driver,
    driverNativeSha256: hash(path.join(driver, "prebuilds/win32-x64.node")),
    node: process.version,
  };
  const save = (name, value) =>
    fs.writeFileSync(
      path.join(root, name),
      typeof value === "string" ? value : JSON.stringify(value, null, 2),
      { flag: "wx" },
    );
  save("build-start.json", manifest);
  let ok = true;
  for (const [stage, exe, argv] of [
    ["compiler", compiler, command],
    [
      "pe",
      inspector,
      ["--file-headers", "--coff-imports", "--coff-exports", dll],
    ],
  ]) {
    const result = spawnSync(exe, argv, {
      encoding: "utf8",
      windowsHide: true,
    });
    save(stage + ".stdout.txt", result.stdout ?? "");
    save(stage + ".stderr.txt", result.stderr ?? "");
    save(stage + ".exit.json", {
      status: result.status,
      signal: result.signal,
      error: result.error ? "spawn_error" : null,
    });
    if (result.status !== 0 || result.error) {
      ok = false;
      break;
    }
    if (
      stage === "pe" &&
      (!result.stdout.includes("IMAGE_FILE_MACHINE_AMD64") ||
        !result.stdout.includes("sqlite3_apvidentity_init") ||
        /Name:.*sqlite.*\.dll/i.test(result.stdout))
    ) {
      ok = false;
      break;
    }
  }
  save("build.json", {
    ...manifest,
    status: ok ? "BUILD PASS" : "BUILD FAIL",
    dllSha256: ok ? hash(dll) : null,
    dll: ok ? dll : null,
  });
  console.log(
    JSON.stringify({
      buildId,
      manifest: path.join(root, "build.json"),
      status: ok ? "BUILD PASS" : "BUILD FAIL",
    }),
  );
  process.exitCode = ok ? 0 : 1;
}
