const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { createSurfaceController } = require("./src/controller.cjs");
let controller;
exports.activate = (context) => {
  controller = createSurfaceController(vscode, {
    extensionUri: context.extensionUri,
    readAsset: (name) =>
      fs.readFileSync(path.join(context.extensionPath, "media", name), "utf8"),
    randomNonce: () => randomBytes(24).toString("base64url"),
  });
  context.subscriptions.push(controller);
  for (const [command, mode] of [
    ["apv.open", "overview"],
    ["apv.openSyntheticDemo", "synthetic"],
  ])
    context.subscriptions.push(
      vscode.commands.registerCommand(command, () => {
        try {
          controller.open(mode);
        } catch {
          vscode.window.showErrorMessage(
            "项目概览资源暂不可用，请重新构建或安装此扩展。",
          );
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
