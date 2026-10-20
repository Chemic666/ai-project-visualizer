import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const hash = (p) =>
  createHash("sha256").update(fs.readFileSync(p)).digest("hex");
export async function verifyUnavailable(resources, evidence) {
  assert.equal(process.versions.electron, "43.7.3");
  const results = [];
  let psSeq = 0;
  for (const kind of ["missing-dll", "damaged-install", "permission-denied"]) {
    const copy = path.join(evidence, "negative-" + kind);
    fs.cpSync(path.dirname(resources.base), copy, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    const { inspectInstalledResources } = await import(
      pathToFileURL(
        path.join(copy, "runtime/storage/src/installed-resources.mjs"),
      ).href
    );
    inspectInstalledResources(); // The complete copied package must be valid first.
    const dll = path.join(
      copy,
      "runtime/storage/native-resource/apv_identity.dll",
    );
    let before, denied, restored;
    if (kind === "missing-dll") fs.renameSync(dll, dll + ".preserved");
    if (kind === "damaged-install")
      fs.appendFileSync(
        path.join(copy, "runtime/core.mjs"),
        "\n// controlled damaged copy\n",
      );
    const ps = (code, extra = {}) => {
      const args = [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(code, "utf16le").toString("base64"),
      ];
      const r = spawnSync(
        path.join(
          process.env.SystemRoot ?? "C:\\Windows",
          "System32/WindowsPowerShell/v1.0/powershell.exe",
        ),
        args,
        {
          env: { ...process.env, APV_DENY_FIXTURE: dll, ...extra },
          encoding: "utf8",
          windowsHide: true,
          timeout: 10000,
        },
      );
      fs.writeFileSync(
        path.join(evidence, `permission-api-${++psSeq}.json`),
        JSON.stringify({
          args,
          pid: r.pid,
          status: r.status,
          signal: r.signal,
          error: r.error?.message ?? null,
          stdout: r.stdout,
          stderr: r.stderr,
        }),
        { flag: "wx" },
      );
      if (r.status !== 0) throw Error("permission_fixture_failed");
      return r.stdout.trim();
    };
    if (kind === "permission-denied") {
      before = {
        sha256: hash(dll),
        sddl: ps("([IO.File]::GetAccessControl($env:APV_DENY_FIXTURE)).Sddl"),
      };
      denied = ps(
        "$a=[IO.File]::GetAccessControl($env:APV_DENY_FIXTURE); $r=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.WindowsIdentity]::GetCurrent().User,'ReadData','Deny'); $a.AddAccessRule($r); [IO.File]::SetAccessControl($env:APV_DENY_FIXTURE,$a); ([IO.File]::GetAccessControl($env:APV_DENY_FIXTURE)).Sddl",
      );
    }
    try {
      if (kind === "permission-denied")
        assert.throws(
          () => fs.readFileSync(dll),
          (e) => ["EACCES", "EPERM"].includes(e.code),
        );
      assert.throws(() => inspectInstalledResources(), { code: "unavailable" });
    } finally {
      if (before) {
        ps(
          "$a=[IO.File]::GetAccessControl($env:APV_DENY_FIXTURE); $a.SetSecurityDescriptorSddlForm($env:APV_RESTORE_SDDL,[Security.AccessControl.AccessControlSections]::Access); [IO.File]::SetAccessControl($env:APV_DENY_FIXTURE,$a)",
          { APV_RESTORE_SDDL: before.sddl },
        );
        restored = {
          sha256: hash(dll),
          sddl: ps("([IO.File]::GetAccessControl($env:APV_DENY_FIXTURE)).Sddl"),
        };
        assert.equal(restored.sha256, before.sha256);
      }
    }
    results.push({
      kind,
      status: "unavailable",
      extensionHostPid: process.pid,
      dllLoaded: false,
      workerStarted: false,
      before,
      denied,
      restored,
      originalPackageUntouched: true,
    });
  }
  fs.writeFileSync(
    path.join(evidence, "negative-resources.json"),
    JSON.stringify(results, null, 2),
    { flag: "wx" },
  );
  return results;
}
