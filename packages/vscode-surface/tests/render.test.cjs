const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const modulePath = path.join(__dirname, "../src/render.cjs");
const target = fs.existsSync(modulePath) ? require(modulePath) : {};
const overview =
  '<!doctype html><html><head><link rel="stylesheet" href="style.css" /><script src="bridge.js" defer></script></head><body><main id="unconnected-overview">尚未连接会话 · 进度未知</main></body></html>';
const synthetic = fs.readFileSync(
  path.join(__dirname, "../../../experiments/core-preview/index.html"),
  "utf8",
);
const params = {
  mode: "overview",
  nonce: "a".repeat(32),
  cspSource: "vscode-webview://unit",
  assets: {
    "app.js": "webview://media/app.js",
    "style.css": "webview://media/style.css",
    "bridge.js": "webview://media/bridge.js",
    "surface.css": "webview://media/surface.css",
  },
};
function render(template, options = {}) {
  assert.equal(
    typeof target.renderSurface,
    "function",
    "surface renderer is not implemented",
  );
  return target.renderSurface(template, { ...params, ...options });
}
test("surface renderer: disconnected overview keeps unknown values and loads only packaged resources", () => {
  const html = render(overview);
  assert.ok(html.includes("进度未知"));
  assert.ok(html.includes('data-apv-mode="overview"'));
  assert.ok(html.includes('data-apv-generation="' + params.nonce + '"'));
  assert.ok(html.includes('href="webview://media/style.css"'));
  assert.ok(html.includes('src="webview://media/bridge.js"'));
  assert.ok(!html.includes('src="webview://media/app.js"'));
  assert.ok(!html.includes('href="style.css"'));
});
test("surface renderer: nonce CSP denies network, inline execution, forms and embedding", () => {
  const html = render(overview);
  for (const rule of [
    "default-src 'none'",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "script-src 'nonce-" + params.nonce + "'",
  ])
    assert.ok(html.includes(rule), rule);
  assert.ok(!html.includes("unsafe-inline"));
  assert.ok(!html.includes("unsafe-eval"));
  assert.ok(html.indexOf("Content-Security-Policy") < html.indexOf("<link"));
  assert.equal((html.match(/nonce="/g) || []).length, 1);
});
test("surface renderer: synthetic Core page gets return navigation and two nonce scripts", () => {
  const html = render(synthetic, { mode: "synthetic" });
  assert.ok(html.includes('id="back-overview"'));
  assert.ok(html.includes("仅合成数据"));
  assert.ok(html.includes('src="webview://media/app.js"'));
  assert.ok(
    html.indexOf('src="webview://media/bridge.js"') <
      html.indexOf('src="webview://media/app.js"'),
  );
  assert.equal((html.match(/nonce="/g) || []).length, 2);
  assert.ok(html.includes('href="webview://media/surface.css"'));
});
test("surface renderer: resource attributes are escaped", () => {
  const html = render(overview, {
    assets: {
      ...params.assets,
      "style.css": 'webview://media/style.css?a=1&b="x"',
    },
  });
  assert.ok(html.includes("style.css?a=1&amp;b=&quot;x&quot;"));
  assert.ok(!html.includes('b="x"'));
});
test("surface renderer: unknown modes and malformed templates refuse with fixed errors", () => {
  assert.throws(() => render(overview, { mode: "real" }), {
    message: "surface_mode_rejected",
  });
  assert.throws(() => render("PRIVATE_SENTINEL"), {
    message: "surface_template_rejected",
  });
});
test("surface renderer: invalid nonce cannot add scripts or markup", () => {
  assert.throws(() => render(overview, { nonce: 'x" onload="bad' }), {
    message: "surface_nonce_rejected",
  });
});
