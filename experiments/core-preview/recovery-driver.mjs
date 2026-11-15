import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { driverSha256 } from "../../packages/storage/src/installed-resources.mjs";

// Windows x64 execution files from the reviewed 13.0.3 runtime deployment
// (TEMP restart 54535c85-a0f0-4768-ba56-1f4dc2f34e59).
const pinned = new Map([
  [
    "lib/binding.js",
    "4fe0f892facc02af7db0a1770150565d2e944e7da3c6493116d8e2a01a0f9b19",
  ],
  [
    "lib/database.js",
    "539315c97591561394d2a0f257632305c3af1e32915a123aa8cc9032056d8ae2",
  ],
  [
    "lib/index.js",
    "0d56e190de8623278641b613433e89c4af2e5c90092c9c6e425f873d7fbc7ccf",
  ],
  [
    "lib/methods/aggregate.js",
    "e9f74eb919ec93fe089c95ddf25a98f1f631c80418fa34fb2346ca1bc29f1b82",
  ],
  [
    "lib/methods/backup.js",
    "ea29d34992bb02e006d0fdeda9675ac5d2bb227aaf57468decd997e9fc9c7dbf",
  ],
  [
    "lib/methods/explain.js",
    "0bd8cc80ccc7338f1d93058beea0cde924d4e7e652da9f51267e7c0757361be7",
  ],
  [
    "lib/methods/function.js",
    "f431d49303b8bbdc044b1f1b455bdad21fc9b74b007de0acb22f08f25b4febd3",
  ],
  [
    "lib/methods/inspect.js",
    "4975a78daee850adee62ba98719d0f223819a0ec135a07c0e302994bd8dbff61",
  ],
  [
    "lib/methods/pragma.js",
    "d399bf1dbc85ef8a51f946c5a9505f2c37d0b1bed3f68863b1bf202d53d6524e",
  ],
  [
    "lib/methods/serialize.js",
    "7a10ee5c2735384b7f0c361811bc6d017db29f62b203fd3c68a35f667e2c2605",
  ],
  [
    "lib/methods/table.js",
    "2356885ca1ef37d20f2daeed2b82b9dd6e61481e851194174a16d32efa3ae2f0",
  ],
  [
    "lib/methods/transaction.js",
    "40b71d6113f328f96cec8f6f888ffddd98b5926d38fb1e2746939c7daba93e2e",
  ],
  [
    "lib/methods/wrappers.js",
    "b289d339ff56b19ab40d109050080e1c844f2a5d01e62d8cb37a0152b0479a47",
  ],
  [
    "lib/sqlite-error.js",
    "903c140bb3d9d4f6256124889f5a820a491299907885d5b9d5ff2c4eaa268a06",
  ],
  [
    "lib/util.js",
    "92b2e39e2151b43a2252e10b6d6de876ecaf0008336a4fa1dfe1317b20f1916f",
  ],
  [
    "package.json",
    "6c9ea355190dfce3646ad4d2a31c9506de36d884a6461b3655a2a0c4ba3d1695",
  ],
  ["prebuilds/win32-x64.node", driverSha256],
]);
const nativeFile = "prebuilds/win32-x64.node";
const directories = new Set(["lib", "lib/methods", "prebuilds"]);
const mismatch = () => new Error("synthetic_preview_driver_unavailable");

function fileBytes(root, leaf, digest) {
  const file = path.join(root, leaf);
  const stat = fs.lstatSync(file);
  if (
    !stat.isFile() ||
    fs.realpathSync.native(file) !== file ||
    stat.size > (leaf === nativeFile ? 8 * 1024 * 1024 : 64 * 1024)
  )
    throw mismatch();
  const bytes = fs.readFileSync(file);
  if (createHash("sha256").update(bytes).digest("hex") !== digest)
    throw mismatch();
  return bytes;
}

export function prepareDriver(driverRoot) {
  if (
    process.platform !== "win32" ||
    process.arch !== "x64" ||
    !path.isAbsolute(driverRoot)
  )
    throw mismatch();
  const root = fs.realpathSync.native(driverRoot);
  return [...pinned].map(([name, digest]) => [
    name,
    fileBytes(root, name, digest),
  ]);
}

export function stageDriver(runtime, files) {
  const root = path.join(runtime, "driver");
  fs.mkdirSync(root);
  for (const dir of directories) fs.mkdirSync(path.join(root, dir));
  for (const [name, bytes] of files)
    fs.writeFileSync(path.join(root, name), bytes, { flag: "wx" });
}

function verifyLayout(root, prefix = "") {
  if (fs.realpathSync.native(root) !== root) throw mismatch();
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory() && directories.has(name)) {
      verifyLayout(path.join(root, entry.name), name + "/");
    } else if (!entry.isFile() || !pinned.has(name)) {
      throw mismatch();
    }
  }
}

export function loadStagedDriver(runtime) {
  const root = path.join(runtime, "driver");
  verifyLayout(root);
  for (const [name, digest] of pinned) fileBytes(root, name, digest);
  const require = createRequire(path.join(root, "package.json"));
  return {
    Database: require(path.join(root, "lib/index.js")),
    isNativeLoaded: () =>
      Object.hasOwn(require.cache, path.join(root, nativeFile)),
  };
}
