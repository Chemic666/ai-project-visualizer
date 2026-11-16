const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { setTimeout: pause } = require("node:timers/promises");

exports.verifyRecoverySurface = async function ({
  vscode,
  surfaceRoot,
  checkpoint,
  review,
  save,
}) {
  const { createSurfaceController } = require("./controller.cjs");
  const controller = createSurfaceController(vscode, {
    extensionUri: vscode.Uri.file(surfaceRoot),
    readAsset: (name) =>
      fs.readFileSync(path.join(surfaceRoot, "media", name), "utf8"),
    randomNonce: () => randomBytes(24).toString("base64url"),
    recoveredSample: true,
    runtimeCheckpoint: checkpoint,
  });

  async function waitForPage(mode, timeoutMs) {
    const deadline = performance.now() + timeoutMs;
    do {
      const view = controller.inspect();
      if (view.mode === mode && view.health === "ready") return view;
      if (view.health === "failed" || view.health === "closed") break;
      await pause(50);
    } while (performance.now() < deadline);
    throw Error("restart_surface_unavailable");
  }

  try {
    controller.open("recovered");
    save("surface-ready.json", await waitForPage("recovered", 20000));
    if (!review) controller.open("overview");
    save(
      "surface-return.json",
      await waitForPage("overview", review ? 90000 : 20000),
    );
  } finally {
    controller.dispose();
  }
};
