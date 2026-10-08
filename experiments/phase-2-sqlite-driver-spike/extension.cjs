// DISPOSABLE Extension Host probe, not the Phase 10 production extension.
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");
const {
  environment,
  errorData,
  probeCandidate,
  restartProbe,
} = require("./probe.cjs");

exports.activate = function (context) {
  async function run(mode = "probe") {
    const root = context.globalStorageUri.fsPath;
    const report = {
      scope:
        context.extensionMode === vscode.ExtensionMode.Development
          ? "development_extension_host"
          : context.extensionMode === vscode.ExtensionMode.Test
            ? "test_extension_host"
            : "installed_extension_host",
      recordedAt: new Date().toISOString(),
      mode,
      environment: {
        ...environment(),
        vscode: vscode.version,
        remoteName: vscode.env.remoteName ?? null,
        uiKind: vscode.env.uiKind,
      },
      activation: "PASS",
      candidates: [],
    };
    for (const candidate of ["node:sqlite", "better-sqlite3"]) {
      if (mode === "probe")
        report.candidates.push(probeCandidate(candidate, root));
      else {
        try {
          report.candidates.push({
            candidate,
            ...restartProbe(candidate, root, mode),
          });
        } catch (error) {
          report.candidates.push({
            candidate,
            status: error.code === "MODULE_NOT_FOUND" ? "NOT TESTED" : "FAIL",
            error: errorData(error),
          });
        }
      }
    }
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      path.join(root, `host-${mode}.json`),
      JSON.stringify(report, null, 2) + "\n",
    );
    return report;
  }
  context.subscriptions.push(
    vscode.commands.registerCommand("apvSqliteSpike.run", () => run()),
  );
  return { run };
};
