import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const file = fileURLToPath(
  new URL("../src/runtime-admission.mjs", import.meta.url),
);
const api = fs.existsSync(file) ? await import(pathToFileURL(file).href) : {};
const legacy = {
  node: "v24.21.0",
  electron: "43.7.3",
  modules: "148",
  platform: "win32",
  arch: "x64",
};
const current = { ...legacy, node: "v24.22.1", electron: "43.8.3" };
const context = {
  installed: true,
  local: true,
  nativeBound: true,
  profile: "extension-host-restart-1.144.0",
};

test("lower Host/Worker gate admits the precise new tuple only in installed local Native validation", () => {
  assert.equal(typeof api.supportsSyntheticRuntime, "function");
  assert.equal(api.supportsSyntheticRuntime(current, context), true);
});
test("default Host/Worker compatibility stays restricted to the legacy tuple", () => {
  assert.equal(api.supportsSyntheticRuntime(legacy, { installed: true }), true);
  assert.equal(
    api.supportsSyntheticRuntime(
      { ...legacy, electron: undefined, modules: "other" },
      { installed: false },
    ),
    true,
  );
  assert.equal(
    api.supportsSyntheticRuntime(current, { installed: true }),
    false,
  );
  assert.equal(
    api.supportsSyntheticRuntime(
      { ...legacy, node: "v24.22.1" },
      { installed: false },
    ),
    false,
  );
});
test("an opt-in profile cannot bypass installation, local admission, Native or runtime identity", () => {
  for (const patch of [
    { installed: false },
    { local: false },
    { nativeBound: false },
    { profile: "unknown" },
  ])
    assert.equal(
      api.supportsSyntheticRuntime(current, { ...context, ...patch }),
      false,
    );
  for (const patch of [
    { node: legacy.node },
    { electron: legacy.electron },
    { modules: "149" },
    { platform: "linux" },
    { arch: "arm64" },
  ])
    assert.equal(
      api.supportsSyntheticRuntime({ ...current, ...patch }, context),
      false,
    );
});

test("installed TEMP validation has an explicit separate profile and cannot claim local admission", () => {
  const temp = {
    ...context,
    local: false,
    profile: "extension-host-temp-restart-1.144.0",
  };
  assert.equal(api.supportsSyntheticRuntime(current, temp), true);
  assert.equal(
    api.supportsSyntheticRuntime(current, { ...temp, local: true }),
    false,
  );
  assert.equal(
    api.supportsSyntheticRuntime(current, { ...temp, installed: false }),
    false,
  );
  assert.equal(
    api.supportsSyntheticRuntime(current, { ...temp, nativeBound: false }),
    false,
  );
});
