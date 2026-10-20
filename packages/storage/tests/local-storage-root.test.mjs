import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const windows = process.platform === "win32";
const api = await import("../src/local-storage-root.mjs").catch(() => ({}));
const ps = (code, env = process.env) => {
  const r = spawnSync(
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(`$ErrorActionPreference='Stop'; ${code}`, "utf16le").toString(
        "base64",
      ),
    ],
    { encoding: "utf8", windowsHide: true, env },
  );
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
// Exercise the production ACL predicate with real CommonAce values, without
// creating directories or changing any ACL. Windows PowerShell 5.1 must not
// coerce a zero AceFlags result back into an enum that has no zero member.
test(
  "ACL full-control predicate handles numeric zero and InheritOnly safely",
  { skip: !windows },
  () => {
    const source = fs.readFileSync(
      new URL("../src/windows-private-root.ps1", import.meta.url),
      "utf8",
    );
    const predicate = source
      .split(/\r?\n/)
      .find((line) =>
        line.includes("if ($ace.SecurityIdentifier.Value -ceq $sid.Value"),
      );
    assert.equal(typeof predicate, "string");
    const actual = JSON.parse(
      ps(`
    $ErrorActionPreference='Stop'
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $result=@()
    foreach ($case in @(@(3,2032127),@(11,2032127),@(3,131209),@(0,2032127))) {
      $ace=[Security.AccessControl.CommonAce]::new([Security.AccessControl.AceFlags]$case[0],[Security.AccessControl.AceQualifier]::AccessAllowed,$case[1],$sid,$false,$null)
      $userFull=$false
      ${predicate}
      $result+=@($userFull)
    }
    ConvertTo-Json -InputObject $result -Compress
  `),
    );
    assert.deepEqual(actual, [true, false, false, true]);
  },
);
const preserved = [];
function fresh() {
  const runId = randomUUID();
  const r = api.prepareLocalValidationRoot({ runId });
  assert.equal(r.ok, true, JSON.stringify(r));
  preserved.push({ runId, root: r.root });
  return r;
}
// Only paths issued by fresh() in this process may be used for ACL fixtures.
function fixtureEnvironment(filename, fixture) {
  assert.ok(
    fixture &&
      preserved.some(
        (r) => r.runId === fixture.runId && r.root === fixture.root,
      ),
    "UNREGISTERED_ACL_FIXTURE",
  );
  assert.ok(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      fixture.runId,
    ) &&
      path.basename(fixture.root) === fixture.runId &&
      path.basename(path.dirname(fixture.root)) === "validation" &&
      path.resolve(fixture.root) === fixture.root &&
      typeof filename === "string" &&
      (filename === path.join(fixture.root, "observed") ||
        filename === path.join(fixture.root, "private", "unsafe.json")),
    "INVALID_ACL_FIXTURE_PATH",
  );
  const item = fs.lstatSync(filename);
  assert.ok(
    !item.isSymbolicLink() &&
      (item.isDirectory() || (item.isFile() && item.nlink === 1)) &&
      fs.realpathSync.native(fixture.root) === fixture.root &&
      fs.realpathSync.native(filename) === filename,
    "ALIASED_ACL_FIXTURE_PATH",
  );
  return { ...process.env, APV_ACL_FIXTURE: filename };
}
const fixtureScript = (code) =>
  `$p=$env:APV_ACL_FIXTURE; if ([string]::IsNullOrWhiteSpace($p)) { throw 'APV_ACL_FIXTURE_REQUIRED' }; ${code}`;
function readFixtureAcl(filename, fixture) {
  return JSON.parse(
    ps(
      fixtureScript(`
    $sections=[Security.AccessControl.AccessControlSections]::Access
    $a=if ([IO.Directory]::Exists($p)) { [IO.Directory]::GetAccessControl($p,$sections) } else { [IO.File]::GetAccessControl($p,$sections) }
    $aces=@($a.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | ForEach-Object {
      @{sid=$_.IdentityReference.Value;type=$_.AccessControlType.ToString();mask=[int]$_.FileSystemRights;inherited=$_.IsInherited;inheritance=[int]$_.InheritanceFlags;propagation=[int]$_.PropagationFlags}
    })
    @{sddl=$a.GetSecurityDescriptorSddlForm($sections);aces=$aces} | ConvertTo-Json -Depth 4 -Compress
  `),
      fixtureEnvironment(filename, fixture),
    ),
  );
}
function assertEveryoneRead(proof) {
  assert.ok(Array.isArray(proof?.aces), "ACL_READBACK_MISSING");
  const entries = proof.aces.filter((ace) => ace.sid === "S-1-1-0");
  assert.equal(entries.length, 1, "EVERYONE_READ_ACE_MISSING_OR_AMBIGUOUS");
  const ace = entries[0];
  // icacls R may also include SYNCHRONIZE. Neither form permits write/execute.
  assert.ok(
    ace.type === "Allow" &&
      ace.inherited === false &&
      ace.inheritance === 0 &&
      ace.propagation === 0 &&
      (ace.mask === 131209 || ace.mask === (131209 | 1048576)),
    "UNEXPECTED_EVERYONE_PERMISSIONS",
  );
}
function grantEveryone(filename, fixture) {
  fixtureEnvironment(filename, fixture);
  // Admission checks the unchanged physical/ACL policy before any mutation.
  assert.equal(
    api.inspectLocalValidationRoot(fixture.root, fixture.runId).ok,
    true,
  );
  // Recheck the exact registered target immediately before the single-file DACL
  // operation. /L avoids following a link; no recursion or continue-on-error.
  fixtureEnvironment(filename, fixture);
  const before = fs.lstatSync(filename, { bigint: true });
  const result = spawnSync(
    "C:\\Windows\\System32\\icacls.exe",
    [filename, "/grant", "*S-1-1-0:R", "/L"],
    {
      encoding: "utf8",
      windowsHide: true,
      timeout: 20000,
      maxBuffer: 1024 * 1024,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, "ACL_FIXTURE_DACL_GRANT_FAILED");
  fixtureEnvironment(filename, fixture);
  const after = fs.lstatSync(filename, { bigint: true });
  assert.ok(
    before.dev === after.dev && before.ino === after.ino,
    "ACL_FIXTURE_IDENTITY_CHANGED",
  );
  const proof = readFixtureAcl(filename, fixture);
  assertEveryoneRead(proof); // Initialization must finish before rejection tests.
  return proof;
}

test("ACL fixture readback requires exactly one explicit Everyone Read ACE", () => {
  const ace = {
    sid: "S-1-1-0",
    type: "Allow",
    mask: 131209,
    inherited: false,
    inheritance: 0,
    propagation: 0,
  };
  for (const mask of [131209, 131209 | 1048576])
    assertEveryoneRead({ aces: [{ ...ace, mask }] });
  for (const proof of [
    undefined,
    {},
    { aces: [] },
    { aces: [ace, ace] },
    ...[
      { mask: 2032127 },
      { mask: 131209 | 2 },
      { type: "Deny" },
      { inherited: true },
      { inheritance: 3 },
      { propagation: 2 },
      { sid: "S-1-5-18" },
    ].map((change) => ({ aces: [{ ...ace, ...change }] })),
  ]) {
    assert.throws(() => assertEveryoneRead(proof));
  }
});

test(
  "ACL fixture transport rejects empty input and stops on preparation errors",
  { skip: !windows },
  () => {
    const marker = "synthetic-'quoted'-with spaces";
    assert.equal(
      ps(fixtureScript("[Console]::Write($p)"), {
        ...process.env,
        APV_ACL_FIXTURE: marker,
      }),
      marker,
    );
    for (const value of [undefined, "", " "]) {
      const env = { ...process.env };
      delete env.APV_ACL_FIXTURE;
      if (value !== undefined) env.APV_ACL_FIXTURE = value;
      assert.throws(
        () => ps(fixtureScript("throw 'UNREACHED'"), env),
        /APV_ACL_FIXTURE_REQUIRED/,
      );
    }
    assert.throws(
      () => ps("Write-Error 'APV_FIXTURE_SETUP_FAILURE'; exit 0"),
      (error) => {
        assert.match(error.message, /APV_FIXTURE_SETUP_FAILURE/);
        return true;
      },
    );
    assert.throws(
      () =>
        fixtureEnvironment("C:\\outside", {
          runId: randomUUID(),
          root: "C:\\outside",
        }),
      /UNREGISTERED_ACL_FIXTURE/,
    );
  },
);

test(
  "official resolver ignores LOCALAPPDATA environment substitution without creating production storage",
  { skip: !windows },
  () => {
    assert.equal(typeof api.deriveStorageLocation, "function");
    const official = ps(
      `[Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)`,
    );
    const production = path.join(official, "AIProjectVisualizer", "storage-v1");
    const existed = fs.existsSync(production);
    const previous = process.env.LOCALAPPDATA;
    try {
      process.env.LOCALAPPDATA = "Z:\\apv-poisoned-environment";
      const r = api.deriveStorageLocation();
      assert.equal(r.ok, true);
      assert.equal(r.localApplicationData, official);
      assert.equal(r.productionRoot, production);
      assert.equal(fs.existsSync(production), existed);
    } finally {
      process.env.LOCALAPPDATA = previous;
    }
  },
);

test(
  "creates only a UUID validation root with private inherited ACLs and reopens it",
  {
    skip: !windows,
  },
  () => {
    assert.equal(typeof api.prepareLocalValidationRoot, "function");
    const r = fresh();
    assert.deepEqual(fs.readdirSync(r.root).sort(), ["observed", "private"]);
    assert.equal(r.proof.fileSystem, "NTFS");
    assert.equal(r.proof.driveType, "Fixed");
    assert.equal(r.proof.protectedDacl, true);
    assert.match(r.proof.ownerSid, /^S-1-/);
    assert.match(r.proof.daclSddl, /D:P/);
    assert.equal(api.prepareLocalValidationRoot({ runId: r.runId }).ok, false);
    assert.equal(
      api.prepareLocalValidationRoot({ runId: r.runId, reopen: true }).ok,
      true,
    );
    fs.writeFileSync(path.join(r.privateDirectory, "synthetic.json"), "{}", {
      flag: "wx",
    });
    assert.equal(api.inspectLocalValidationRoot(r.root, r.runId).ok, true);
  },
);

test(
  "rejects traversal, malformed UUIDs and a foreign or noncanonical root without paths in failures",
  {
    skip: !windows,
  },
  () => {
    assert.equal(typeof api.inspectLocalValidationRoot, "function");
    assert.deepEqual(api.prepareLocalValidationRoot(null), {
      ok: false,
      reason: "unavailable",
    });
    for (const runId of [
      "../escape",
      "invalid",
      "",
      randomUUID().toUpperCase(),
    ]) {
      assert.deepEqual(api.prepareLocalValidationRoot({ runId }), {
        ok: false,
        reason: "unavailable",
      });
    }
    const r = fresh();
    for (const root of [
      path.dirname(r.root),
      r.root + "\\.",
      r.root.toUpperCase(),
      "\\\\localhost\\C$\\other",
    ]) {
      assert.deepEqual(api.inspectLocalValidationRoot(root, r.runId), {
        ok: false,
        reason: "unavailable",
      });
    }
    assert.equal(
      api.inspectLocalValidationRoot(r.root, randomUUID()).ok,
      false,
    );
  },
);

test(
  "rejects world-readable directory and file ACLs without repairing fixtures",
  {
    skip: !windows,
  },
  () => {
    assert.equal(typeof api.prepareLocalValidationRoot, "function");
    for (const kind of ["directory", "file"]) {
      const r = fresh();
      const target =
        kind === "directory"
          ? r.observedDirectory
          : path.join(r.privateDirectory, "unsafe.json");
      if (kind === "file") fs.writeFileSync(target, "{}", { flag: "wx" });
      const unsafeAcl = grantEveryone(target, r);
      assert.deepEqual(api.inspectLocalValidationRoot(r.root, r.runId), {
        ok: false,
        reason: "unavailable",
      });
      assert.equal(
        api.prepareLocalValidationRoot({ runId: r.runId, reopen: true }).ok,
        false,
      );
      const afterRejection = readFixtureAcl(target, r);
      assertEveryoneRead(afterRejection);
      assert.deepEqual(
        afterRejection,
        unsafeAcl,
        "ADMISSION_MUST_NOT_REPAIR_FIXTURE_DACL",
      );
    }
  },
);

test(
  "rejects a junction and hardlinked file entirely within preserved synthetic roots",
  {
    skip: !windows,
  },
  () => {
    assert.equal(typeof api.prepareLocalValidationRoot, "function");
    const junction = fresh();
    fs.symlinkSync(
      junction.privateDirectory,
      path.join(junction.observedDirectory, "alias"),
      "junction",
    );
    assert.equal(
      api.inspectLocalValidationRoot(junction.root, junction.runId).ok,
      false,
    );
    const hardlink = fresh();
    const file = path.join(hardlink.privateDirectory, "synthetic.json");
    fs.writeFileSync(file, "{}", { flag: "wx" });
    fs.linkSync(file, path.join(hardlink.observedDirectory, "alias.json"));
    assert.equal(
      api.inspectLocalValidationRoot(hardlink.root, hardlink.runId).ok,
      false,
    );
  },
);

test.after(() => {
  if (preserved.length)
    console.log(
      JSON.stringify({
        kind: "preserved-local-validation-fixtures",
        roots: preserved,
      }),
    );
});
