import { lstat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Host-side writer for three generated files in a trusted local checkout.
export async function writePreviewOutput(out, assets) {
  const existingDirectory = await lstat(out).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (
    existingDirectory &&
    (!existingDirectory.isDirectory() || existingDirectory.isSymbolicLink())
  )
    throw new Error("preview_output_must_be_local");
  if (!existingDirectory) await mkdir(out);
  const outputs = [
    ["index.html", assets.html],
    ["app.js", assets.script],
    ["style.css", assets.css],
  ];
  for (const [name] of outputs) {
    const target = join(out, name);
    const existing = await lstat(target).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (
      existing &&
      (!existing.isFile() || existing.isSymbolicLink() || existing.nlink > 1)
    )
      throw new Error("preview_output_must_be_regular");
  }
  for (const [name, bytes] of outputs) await writeFile(join(out, name), bytes);
}
