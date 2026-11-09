const { renderSurface } = require("./render.cjs");
function exact(message, keys) {
  return (
    message !== null &&
    typeof message === "object" &&
    !Array.isArray(message) &&
    Object.keys(message).sort().join(",") === keys.sort().join(",")
  );
}
exports.createSurfaceController = (
  vscode,
  { extensionUri, readAsset, randomNonce },
) => {
  const media = vscode.Uri.joinPath(extensionUri, "media");
  let panel,
    mode = null,
    generation = null,
    health = "closed";
  function open(next) {
    if (!["overview", "synthetic"].includes(next))
      throw Error("surface_mode_rejected");
    if (panel && mode === next) {
      panel.reveal(vscode.ViewColumn.One);
      return;
    }
    let template;
    try {
      template = readAsset(
        next === "overview" ? "overview.html" : "index.html",
      );
    } catch {
      throw Error("surface_assets_unavailable");
    }
    const created = !panel;
    if (created) {
      panel = vscode.window.createWebviewPanel(
        "apv.projectOverview",
        "AI Project Visualizer",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          enableCommandUris: false,
          localResourceRoots: [media],
        },
      );
      const current = panel,
        listeners = [];
      listeners.push(
        current.webview.onDidReceiveMessage((message) => {
          if (panel !== current || message?.generation !== generation) return;
          if (
            exact(message, ["type", "destination", "generation"]) &&
            message.type === "surface.navigate" &&
            ["overview", "synthetic"].includes(message.destination)
          ) {
            // Only navigation to these own pages is accepted; no command/path RPC.
            try {
              open(message.destination);
            } catch {
              health = "failed";
            }
          } else if (
            exact(message, ["type", "mode", "generation", "ok"]) &&
            message.type === "surface.ready" &&
            message.mode === mode &&
            typeof message.ok === "boolean"
          )
            health = message.ok ? "ready" : "failed";
        }),
      );
      listeners.push(
        current.onDidDispose(() => {
          listeners.forEach((item) => item.dispose());
          if (panel === current) {
            panel = undefined;
            mode = null;
            generation = null;
            health = "closed";
          }
        }),
      );
    }
    try {
      const nextGeneration = randomNonce();
      const assets = Object.fromEntries(
        ["style.css", "surface.css", "bridge.js", "app.js"].map((name) => [
          name,
          panel.webview
            .asWebviewUri(vscode.Uri.joinPath(media, name))
            .toString(),
        ]),
      );
      const html = renderSurface(template, {
        mode: next,
        nonce: nextGeneration,
        cspSource: panel.webview.cspSource,
        assets,
      });
      mode = next;
      generation = nextGeneration;
      health = "loading";
      panel.webview.html = html;
      panel.reveal(vscode.ViewColumn.One);
    } catch {
      if (created) panel?.dispose();
      throw Error("surface_assets_unavailable");
    }
  }
  return {
    open,
    inspect: () => ({ mode, health }),
    dispose: () => panel?.dispose(),
  };
};
