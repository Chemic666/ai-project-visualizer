import assert from "node:assert/strict";
import { request } from "node:http";
import test from "node:test";
import { startPreview } from "./server.mjs";

const assets = {
  html: "<h1>Synthetic fixture only</h1>",
  script: new TextEncoder().encode("/* synthetic script */"),
  css: "body { color: #123; }",
};
async function fixture(t) {
  const preview = await startPreview(assets);
  t.after(() => new Promise((resolve) => preview.server.close(resolve)));
  return preview;
}
function raw(url, options = {}) {
  return new Promise((resolve, reject) => {
    const call = request(
      url,
      { ...options, headers: { Connection: "close", ...options.headers } },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    call.setTimeout(3000, () =>
      call.destroy(new Error("synthetic_request_timeout")),
    );
    call.once("error", reject);
    call.end();
  });
}

test("preview binds loopback and serves only its in-memory synthetic assets with a restrictive policy", async (t) => {
  const { server, url } = await fixture(t);
  assert.equal(server.address().address, "127.0.0.1");
  for (const [path, expected] of [
    ["/", assets.html],
    ["/index.html", assets.html],
    ["/app.js", "/* synthetic script */"],
    ["/style.css", assets.css],
  ]) {
    const result = await raw(url + path);
    assert.equal(result.status, 200);
    assert.equal(result.body, expected);
    assert.match(
      result.headers["content-security-policy"],
      /connect-src 'none'/,
    );
    assert.equal(result.headers["cross-origin-resource-policy"], "same-origin");
    assert.equal(result.headers["cache-control"], "no-store");
    assert.equal(result.headers["access-control-allow-origin"], undefined);
  }
});

test("paths and query strings cannot request repository files or directory listings", async (t) => {
  const { url } = await fixture(t);
  for (const path of [
    "/package.json",
    "/../../.codex/config.toml",
    "/%2e%2e/%2e%2e/.git/config",
    "/app.js/../../package.json",
    "/index.html/private",
    "/%2fpackage.json",
  ]) {
    const result = await raw(url, { path });
    assert.equal(result.status, 404);
    assert.equal(result.body, "Not found");
  }
  const withQuery = await raw(url + "/?file=../../package.json");
  assert.equal(withQuery.body, assets.html);
});

test("foreign host, foreign absolute target and mutation methods are rejected", async (t) => {
  const { url } = await fixture(t);
  assert.equal(
    (await raw(url, { headers: { Host: "example.invalid" } })).status,
    403,
  );
  assert.equal(
    (await raw(url, { path: "http://example.invalid/app.js" })).status,
    403,
  );
  for (const origin of [
    "https://example.invalid",
    "null",
    "http://127.0.0.1:1",
  ])
    assert.equal((await raw(url, { headers: { Origin: origin } })).status, 403);
  assert.equal((await raw(url, { headers: { Origin: url } })).status, 200);
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"])
    assert.equal((await raw(url, { method })).status, 405);
});

test("HEAD returns resource metadata without a response body", async (t) => {
  const { url } = await fixture(t);
  const result = await raw(url, { method: "HEAD" });
  assert.equal(result.status, 200);
  assert.equal(result.body, "");
  assert.equal(
    Number(result.headers["content-length"]),
    Buffer.byteLength(assets.html),
  );
});
