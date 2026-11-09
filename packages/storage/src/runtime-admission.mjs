// Validation-only tuple expansion. No production or automatic version admission.
export function supportsSyntheticRuntime(runtime, context) {
  if (runtime.platform !== "win32" || runtime.arch !== "x64") return false;
  if (context.profile === undefined)
    return (
      runtime.node === "v24.21.0" &&
      (!context.installed ||
        (runtime.electron === "43.7.3" && runtime.modules === "148"))
    );
  const localProfile =
    context.profile === "extension-host-restart-1.144.0" &&
    context.local === true;
  const tempProfile =
    context.profile === "extension-host-temp-restart-1.144.0" &&
    context.local === false;
  return (
    (localProfile || tempProfile) &&
    context.installed === true &&
    context.nativeBound === true &&
    runtime.node === "v24.22.1" &&
    runtime.electron === "43.8.3" &&
    runtime.modules === "148"
  );
}
