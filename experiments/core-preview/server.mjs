import { createServer } from "node:http";

// Only the generated synthetic assets are held in memory. No URL becomes a path.
export async function startPreview({ html, script, css }) {
  const assets = new Map([
    ["/", { body: html, type: "text/html; charset=utf-8" }],
    ["/index.html", { body: html, type: "text/html; charset=utf-8" }],
    ["/app.js", { body: script, type: "text/javascript; charset=utf-8" }],
    ["/style.css", { body: css, type: "text/css; charset=utf-8" }],
  ]);
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    function reply(status, body, type = "text/plain; charset=utf-8") {
      response.writeHead(status, {
        "Content-Type": type,
        "Content-Length":
          typeof body === "string" ? Buffer.byteLength(body) : body.byteLength,
      });
      response.end(request.method === "HEAD" ? undefined : body);
    }
    const origin = `http://127.0.0.1:${request.socket.localPort}`;
    if (
      request.headers.origin !== undefined &&
      request.headers.origin !== origin
    ) {
      reply(403, "Not a preview origin");
      return;
    }
    if (request.headers.host !== `127.0.0.1:${request.socket.localPort}`) {
      reply(403, "Not a preview host");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      reply(405, "Method not allowed");
      return;
    }
    let target;
    try {
      target = new URL(request.url, origin);
    } catch {
      reply(400, "Invalid URL");
      return;
    }
    if (target.origin !== origin) {
      reply(403, "Not a preview origin");
      return;
    }
    const asset = assets.get(target.pathname);
    if (!asset) {
      reply(404, "Not found");
      return;
    }
    reply(200, asset.body, asset.type);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
