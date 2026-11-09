import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { writePreviewOutput } from "./output.mjs";

const assets = {
  html: "new synthetic html",
  script: new TextEncoder().encode("new synthetic script"),
  css: "new synthetic css",
};
async function fixture() {
  const scratch = fileURLToPath(new URL("./dist/", import.meta.url));
  await mkdir(scratch, { recursive: true });
  // Retain these small synthetic cases under ignored dist; never delete evidence.
  return mkdtemp(join(scratch, "output-case-"));
}

test("normal output creates and updates exactly the three generated resources", async () => {
  const root = await fixture();
  const out = join(root, "preview");
  await writePreviewOutput(out, assets);
  assert.equal(await readFile(join(out, "index.html"), "utf8"), assets.html);
  assert.equal(
    await readFile(join(out, "app.js"), "utf8"),
    "new synthetic script",
  );
  await writePreviewOutput(out, { ...assets, html: "updated synthetic html" });
  assert.equal(
    await readFile(join(out, "index.html"), "utf8"),
    "updated synthetic html",
  );
});

test("hard-linked output is rejected before altering either its external sentinel or other generated files", async () => {
  const root = await fixture();
  const out = join(root, "preview");
  const source = join(root, "source-sentinel.txt");
  await mkdir(out);
  await writeFile(source, "preserve this synthetic sentinel");
  await writeFile(join(out, "index.html"), "preserve previous generated html");
  await link(source, join(out, "app.js"));
  await assert.rejects(writePreviewOutput(out, assets), {
    message: "preview_output_must_be_regular",
  });
  assert.equal(
    await readFile(source, "utf8"),
    "preserve this synthetic sentinel",
  );
  assert.equal(
    await readFile(join(out, "index.html"), "utf8"),
    "preserve previous generated html",
  );
});

test("a non-file output target is rejected before changing earlier generated files", async () => {
  const root = await fixture();
  const out = join(root, "preview");
  await mkdir(out);
  await mkdir(join(out, "app.js"));
  await writeFile(join(out, "index.html"), "preserve previous generated html");
  await assert.rejects(writePreviewOutput(out, assets), {
    message: "preview_output_must_be_regular",
  });
  assert.equal(
    await readFile(join(out, "index.html"), "utf8"),
    "preserve previous generated html",
  );
});
