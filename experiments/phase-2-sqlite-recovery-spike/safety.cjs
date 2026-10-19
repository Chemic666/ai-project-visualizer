"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { fail } = require("./checks.cjs");
const cases = ["U1", "U2", "U4", "R1", "R2", "R3"];
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function gate(args) {
  if (!args.length || (args.length === 1 && args[0] === "--list"))
    return { mode: "list" };
  if (args.length === 1 && args[0] === "--preflight")
    return { mode: "preflight" };
  let caseName,
    runId,
    reserve = false,
    execute = false;
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (seen.has(key)) throw fail("DUPLICATE_ARGUMENT");
    seen.add(key);
    if (key === "--case" || key === "--run-id") {
      const value = args[++i];
      if (typeof value !== "string" || !value || value.startsWith("--"))
        throw fail("ARGUMENT_VALUE_REQUIRED");
      if (key === "--case") caseName = value;
      else runId = value;
    } else if (key === "--reserve") reserve = true;
    else if (key === "--execute") execute = true;
    else throw fail("UNKNOWN_ARGUMENT");
  }
  if (
    !execute ||
    !cases.includes(caseName) ||
    (runId !== undefined && !uuidPattern.test(runId)) ||
    (reserve && !runId)
  )
    throw fail("EXECUTION_GATE_OR_CASE");
  return { mode: reserve ? "reserve" : "execute", caseName, runId };
}
function inside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}
function physicalDirectory(directory, repo) {
  const full = path.resolve(directory);
  if (full.startsWith("\\\\") || inside(repo, full))
    throw fail("ROOT_NOT_ISOLATED");
  let ancestor = full;
  while (true) {
    if (fs.existsSync(ancestor)) {
      const stat = fs.lstatSync(ancestor);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        fs.realpathSync.native(ancestor).toLowerCase() !==
          ancestor.toLowerCase()
      )
        throw fail("REPARSE_OR_ALIAS_PATH");
      if (fs.existsSync(path.join(ancestor, ".git")))
        throw fail("ROOT_INSIDE_REPOSITORY");
    }
    const next = path.dirname(ancestor);
    if (next === ancestor) break;
    ancestor = next;
  }
  return full;
}
function confined(root, ...components) {
  for (const value of components)
    if (!/^[A-Za-z0-9_.-]+$/.test(value) || value === "." || value === "..")
      throw fail("PATH_COMPONENT");
  const target = path.join(root, ...components);
  if (!inside(root, target)) throw fail("PATH_ESCAPE");
  return target;
}
function errorRecord(error) {
  return {
    name: error.name,
    code: error.code || "HARNESS_ERROR",
    message: error.message,
    stack: error.stack,
    ...(error.cause ? { cause: errorRecord(error.cause) } : {}),
  };
}
module.exports = {
  cases,
  uuidPattern,
  gate,
  inside,
  physicalDirectory,
  confined,
  errorRecord,
};
