// Official --extensionTestsPath runner contract: export an async run function.
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

exports.run = async function () {
  const extension = vscode.extensions.getExtension(
    "apv-disposable-spike.apv-sqlite-driver-spike",
  );
  if (!extension) throw new Error("Disposable extension not found");
  const api = await extension.activate();
  const mode = process.env.APV_SPIKE_MODE || "probe";
  const report = await api.run(mode);
  report.runId = process.env.APV_SPIKE_RUN_ID;
  const installedRoot = process.env.APV_SPIKE_INSTALLED_ROOT;
  report.loadedFromInstalledDirectory = installedRoot
    ? path
        .resolve(extension.extensionPath)
        .startsWith(path.resolve(installedRoot) + path.sep)
    : false;
  if (installedRoot && !report.loadedFromInstalledDirectory)
    throw new Error(
      "Probe did not load from the isolated installed extension directory",
    );
  const destination = process.env.APV_SPIKE_EVIDENCE;
  if (!destination)
    throw new Error("Explicit APV_SPIKE_EVIDENCE path required");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + "\n");
  // A NOT TESTED candidate is recorded, never silently counted as passing.
  console.log(
    JSON.stringify({
      mode,
      scope: report.scope,
      evidenceFile: path.basename(destination),
    }),
  );
};
