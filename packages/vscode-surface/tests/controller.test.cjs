const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const filename = path.join(__dirname, "../src/controller.cjs");
const target = fs.existsSync(filename) ? require(filename) : {};
function fixture({ recoveredSample = false } = {}) {
  assert.equal(
    typeof target.createSurfaceController,
    "function",
    "surface controller is not implemented",
  );
  const panels = [],
    reads = [];
  let serial = 0,
    fail;
  const uri = (value) => ({
    value,
    toString() {
      return this.value;
    },
  });
  const vscode = {
    ViewColumn: { One: 1 },
    Uri: {
      joinPath: (root, ...parts) => uri(root.value + "/" + parts.join("/")),
    },
    window: {
      createWebviewPanel: (type, title, column, options) => {
        let receive, closed;
        const p = {
          type,
          title,
          column,
          options,
          reveals: 0,
          disposed: false,
          listeners: 0,
          webview: {
            html: "",
            cspSource: "vscode-webview://unit",
            asWebviewUri: (u) => uri("webview://" + u.value),
            onDidReceiveMessage: (f) => {
              receive = f;
              p.listeners++;
              return { dispose: () => p.listeners-- };
            },
          },
          onDidDispose: (f) => {
            closed = f;
            p.listeners++;
            return { dispose: () => p.listeners-- };
          },
          reveal() {
            p.reveals++;
          },
          dispose() {
            if (!p.disposed) {
              p.disposed = true;
              closed?.();
            }
          },
          send: (m) => receive?.(m),
        };
        panels.push(p);
        return p;
      },
    },
  };
  const template =
    '<html><head><link rel="stylesheet" href="style.css" /><script src="bridge.js" defer></script></head><body><main id="unconnected-overview">尚未连接会话<!-- recovered-sample-entry --></main></body></html>';
  const demo =
    '<html><head><link rel="stylesheet" href="style.css" /><script src="app.js" defer></script></head><body><div class="app-shell">仅合成数据</div></body></html>';
  const reported = [];
  const controller = target.createSurfaceController(vscode, {
    recoveredSample,
    onNavigationError: () => reported.push("unavailable"),
    extensionUri: uri("extension-root"),
    readAsset: (name) => {
      reads.push(name);
      if (fail === "*" || name === fail) throw Error("PRIVATE_PATH");
      if (name === "recovered.js") return "/* bundled recovered app */";
      return name === "overview.html" ? template : demo;
    },
    randomNonce: () => String(++serial).padStart(32, "a"),
  });
  const generation = () =>
    panels.at(-1).webview.html.match(/data-apv-generation="([^"]+)"/)[1];
  return {
    controller,
    panels,
    reads,
    generation,
    reported,
    setFail: (asset = "*") => {
      fail = asset;
    },
  };
}
test("surface controller: construction is lazy; default overview has no workspace resource roots", () => {
  const f = fixture();
  assert.deepEqual(f.controller.inspect(), { mode: null, health: "closed" });
  assert.deepEqual(f.reads, []);
  f.controller.open("overview");
  assert.equal(f.panels.length, 1);
  const p = f.panels[0];
  assert.deepEqual(
    p.options.localResourceRoots.map((u) => u.value),
    ["extension-root/media"],
  );
  assert.equal(p.options.enableScripts, true);
  assert.equal(p.options.enableCommandUris, false);
  assert.deepEqual(f.reads, ["overview.html"]);
  assert.deepEqual(f.controller.inspect(), {
    mode: "overview",
    health: "loading",
  });
  f.controller.dispose();
});
test("surface controller: repeated same command reveals one panel without resetting its document", () => {
  const f = fixture();
  f.controller.open("overview");
  const html = f.panels[0].webview.html;
  f.controller.open("overview");
  assert.equal(f.panels.length, 1);
  assert.equal(f.panels[0].webview.html, html);
  assert.equal(f.reads.length, 1);
  assert.ok(f.panels[0].reveals >= 1);
  f.controller.dispose();
});
test("surface controller: navigation requires exact fields and current document generation", () => {
  const f = fixture();
  f.controller.open("overview");
  const p = f.panels[0],
    old = f.generation();
  for (const msg of [
    { type: "surface.navigate", destination: "synthetic", generation: "stale" },
    {
      type: "surface.navigate",
      destination: "synthetic",
      generation: old,
      path: "PRIVATE",
    },
    { type: "executeCommand", command: "bad" },
    [],
    null,
  ])
    p.send(msg);
  assert.equal(f.controller.inspect().mode, "overview");
  p.send({
    type: "surface.navigate",
    destination: "synthetic",
    generation: old,
  });
  assert.equal(f.controller.inspect().mode, "synthetic");
  assert.notEqual(f.generation(), old);
  assert.equal(f.panels.length, 1);
  p.send({
    type: "surface.ready",
    mode: "overview",
    generation: old,
    ok: true,
  });
  assert.equal(f.controller.inspect().health, "loading");
  p.send({
    type: "surface.navigate",
    destination: "overview",
    generation: f.generation(),
  });
  assert.equal(f.controller.inspect().mode, "overview");
  f.controller.dispose();
});
test("surface controller: only current generation readiness is recorded; it is not project state", () => {
  const f = fixture();
  f.controller.open("synthetic");
  const p = f.panels[0],
    generation = f.generation();
  p.send({ type: "surface.ready", mode: "overview", generation, ok: true });
  assert.equal(f.controller.inspect().health, "loading");
  p.send({
    type: "surface.ready",
    mode: "synthetic",
    generation,
    ok: true,
    progress: 100,
  });
  assert.equal(f.controller.inspect().health, "loading");
  p.send({ type: "surface.ready", mode: "synthetic", generation, ok: false });
  assert.deepEqual(f.controller.inspect(), {
    mode: "synthetic",
    health: "failed",
  });
  p.send({ type: "surface.ready", mode: "synthetic", generation, ok: true });
  assert.deepEqual(f.controller.inspect(), {
    mode: "synthetic",
    health: "ready",
  });
  f.controller.dispose();
});
test("surface controller: dispose settles listeners and permits a fresh command", () => {
  const f = fixture();
  f.controller.open("overview");
  f.panels[0].dispose();
  assert.deepEqual(f.controller.inspect(), { mode: null, health: "closed" });
  assert.equal(f.panels[0].listeners, 0);
  f.controller.open("synthetic");
  assert.equal(f.panels.length, 2);
  f.controller.dispose();
  assert.equal(f.panels[1].listeners, 0);
  assert.deepEqual(f.controller.inspect(), { mode: null, health: "closed" });
});
test("surface controller: missing new asset keeps existing page and exposes no private error", () => {
  const f = fixture();
  f.controller.open("overview");
  const html = f.panels[0].webview.html;
  f.setFail();
  assert.throws(() => f.controller.open("synthetic"), {
    message: "surface_assets_unavailable",
  });
  assert.equal(f.panels[0].webview.html, html);
  assert.equal(f.controller.inspect().mode, "overview");
  f.controller.dispose();
});

test("the recovery entry is only available in an explicit build", () => {
  const f = fixture();
  f.controller.open("overview");
  const p = f.panels[0];
  assert.ok(!p.webview.html.includes('id="open-recovered"'));
  assert.throws(() => f.controller.open("recovered"), {
    message: "surface_mode_rejected",
  });
  p.send({
    type: "surface.navigate",
    destination: "recovered",
    generation: f.generation(),
  });
  assert.equal(f.controller.inspect().mode, "overview");
  assert.deepEqual(f.reads, ["overview.html"]);
  f.controller.dispose();
});

test("recovered sample has its own asset and same-panel return navigation", () => {
  const f = fixture({ recoveredSample: true });
  f.controller.open("overview");
  const p = f.panels[0],
    original = f.generation();
  assert.match(p.webview.html, /id="open-recovered"/);
  p.send({
    type: "surface.navigate",
    destination: "recovered",
    generation: original,
    path: "extra",
  });
  assert.equal(f.controller.inspect().mode, "overview");
  p.send({
    type: "surface.navigate",
    destination: "recovered",
    generation: original,
  });
  assert.equal(f.controller.inspect().mode, "recovered");
  assert.equal(f.panels.length, 1);
  assert.notEqual(f.generation(), original);
  assert.match(p.webview.html, /id="back-overview"/);
  assert.match(
    p.webview.html,
    /src="webview:\/\/extension-root\/media\/recovered\.js"/,
  );
  assert.doesNotMatch(p.webview.html, /src="[^"]+\/app\.js"/);
  p.send({
    type: "surface.ready",
    mode: "recovered",
    generation: original,
    ok: true,
  });
  assert.equal(f.controller.inspect().health, "loading");
  p.send({
    type: "surface.ready",
    mode: "recovered",
    generation: f.generation(),
    ok: true,
  });
  assert.equal(f.controller.inspect().health, "ready");
  p.send({
    type: "surface.navigate",
    destination: "overview",
    generation: f.generation(),
  });
  assert.equal(f.controller.inspect().mode, "overview");
  assert.equal(f.panels.length, 1);
  f.controller.dispose();
});

test("a missing recovery asset leaves a ready overview visible and reports a safe error", () => {
  for (const asset of [
    "recovered.js",
    "bridge.js",
    "style.css",
    "surface.css",
  ]) {
    const f = fixture({ recoveredSample: true });
    f.controller.open("overview");
    const p = f.panels[0],
      original = f.generation(),
      oldHtml = p.webview.html;
    p.send({
      type: "surface.ready",
      mode: "overview",
      generation: original,
      ok: true,
    });
    f.setFail(asset);
    p.send({
      type: "surface.navigate",
      destination: "recovered",
      generation: original,
    });
    assert.deepEqual(f.controller.inspect(), {
      mode: "overview",
      health: "ready",
    });
    assert.deepEqual(f.reported, ["unavailable"]);
    assert.equal(p.webview.html, oldHtml);
    assert.equal(f.generation(), original);
    f.controller.dispose();
  }
});
