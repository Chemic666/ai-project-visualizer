import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { StorageError, demand } from "./errors.mjs";
export const nativeBuild = Object.freeze({
  buildId: "fc7be262-e067-4658-9329-dce0dd36d858",
  dllSha256: "1e1dc8ebe575078928d7a7b84a1c9321dfc867f735135483b7146531e8be46db",
});
export const driverSha256 =
  "e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a";
const hash = (p) =>
  createHash("sha256").update(fs.readFileSync(p)).digest("hex");
export function inspectInstalledResources() {
  try {
    const base = fileURLToPath(new URL("../../", import.meta.url)),
      manifest = path.join(base, "deployment.json");
    demand(path.basename(base) === "runtime", "unavailable");
    const pkg = JSON.parse(
      fs.readFileSync(path.join(base, "../package.json"), "utf8"),
    );
    demand(
      pkg.name === "apv-storage-host-validation" &&
        pkg.publisher === "apv-local-validation",
      "unavailable",
    );
    const m = JSON.parse(fs.readFileSync(manifest, "utf8"));
    demand(
      m.kind === "synthetic-host-resources-v1" &&
        m.files.length > 10 &&
        m.files.length < 256,
      "unavailable",
    );
    const seen = new Set();
    for (const f of m.files) {
      demand(
        typeof f.path === "string" &&
          f.path &&
          !f.path.includes("..") &&
          !/[\\:]/.test(f.path) &&
          !f.path.startsWith("/") &&
          !seen.has(f.path),
        "unavailable",
      );
      seen.add(f.path);
      const target = path.join(base, ...f.path.split("/"));
      for (let d = target; d !== path.dirname(base); d = path.dirname(d)) {
        const s = fs.lstatSync(d);
        demand(
          !s.isSymbolicLink() &&
            (s.isDirectory() || (s.isFile() && s.nlink === 1)) &&
            fs.realpathSync.native(d) === d,
          "unavailable",
        );
      }
      demand(hash(target) === f.sha256, "unavailable");
    }
    for (const p of [
      "core.mjs",
      "driver/prebuilds/win32-x64.node",
      "storage/native-resource/manifest.json",
      "storage/native-resource/apv_identity.dll",
      "storage/src/host-worker.mjs",
    ])
      demand(seen.has(p), "unavailable");
    const nativePath = path.join(base, "storage/native-resource/manifest.json"),
      n = JSON.parse(fs.readFileSync(nativePath, "utf8"));
    demand(
      n.kind === "packaged-readonly-attestor-v1" &&
        n.buildId === nativeBuild.buildId &&
        n.dllSha256 === nativeBuild.dllSha256 &&
        hash(path.join(base, "storage/native-resource/apv_identity.dll")) ===
          nativeBuild.dllSha256 &&
        hash(path.join(base, "driver/prebuilds/win32-x64.node")) ===
          driverSha256,
      "unavailable",
    );
    return {
      base,
      driverRoot: path.join(base, "driver"),
      corePath: path.join(base, "core.mjs"),
      processorFingerprint: hash(path.join(base, "core.mjs")),
      nativePackage: { manifestPath: nativePath, ...nativeBuild },
    };
  } catch {
    throw new StorageError("unavailable");
  }
}
