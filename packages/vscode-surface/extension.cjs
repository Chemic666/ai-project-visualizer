const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { createSurfaceController } = require("./src/controller.cjs");
const recoveredSample =
  typeof APV_SURFACE_RECOVERED_SAMPLE !== "undefined" &&
  APV_SURFACE_RECOVERED_SAMPLE;
let controller;
exports.activate = (context) => {
  const showUnavailable = () => {
    void vscode.window.showErrorMessage(
      "项目预览资源暂不可用，请重新构建此扩展。",
    );
  };
  controller = createSurfaceController(vscode, {
    extensionUri: context.extensionUri,
    recoveredSample,
    onNavigationError: showUnavailable,
    readAsset: (name) =>
      fs.readFileSync(path.join(context.extensionPath, "media", name), "utf8"),
    randomNonce: () => randomBytes(24).toString("base64url"),
  });
  context.subscriptions.push(controller);
  for (const [command, mode] of [
    ["apv.open", "overview"],
    ["apv.openSyntheticDemo", "synthetic"],
    ...(recoveredSample ? [["apv.openRecoveredDemo", "recovered"]] : []),
  ])
    context.subscriptions.push(
      vscode.commands.registerCommand(command, () => {
        try {
          controller.open(mode);
        } catch {
          showUnavailable();
        }
      }),
    );
  // Own-surface health only; it is never a Project or observation capability.
  return { inspectSurface: () => controller.inspect() };
};
exports.deactivate = () => {
  controller?.dispose();
  controller = undefined;
};
