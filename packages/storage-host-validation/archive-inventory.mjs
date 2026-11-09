import fs from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

// Generated validation VSIX only; reads bytes, never extracts archive paths.
export async function readVsixInventory(vsix, toolPackage) {
  const packageFile = fs.realpathSync.native(toolPackage);
  const metadata = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  if (metadata.name !== "@vscode/vsce" || metadata.version !== "4.0.0")
    throw Error("archive_tool_unsupported");
  const require = createRequire(packageFile),
    yauzl = require("yauzl");
  const stat = fs.lstatSync(vsix);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024 * 1024)
    throw Error("archive_identity_rejected");
  return new Promise((resolve, reject) => {
    let reader,
      finished = false,
      total = 0;
    const rows = [],
      seen = new Set();
    const fail = () => {
      if (finished) return;
      finished = true;
      reader?.close();
      reject(Error("archive_identity_rejected"));
    };
    yauzl.open(
      vsix,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error) return fail();
        reader = zip;
        if (!Number.isSafeInteger(zip.entryCount) || zip.entryCount > 4096)
          return fail();
        zip.on("error", fail);
        zip.on("end", () => {
          if (finished) return;
          finished = true;
          resolve(rows);
        });
        zip.on("entry", (entry) => {
          const name = entry.fileName,
            trimmed = name.replace(/\/$/, "");
          if (
            !/^[\x20-\x7e]+$/.test(name) ||
            name.includes("\\") ||
            name.includes(":") ||
            trimmed
              .split("/")
              .some((part) => !part || part === "." || part === "..") ||
            seen.has(trimmed.toLowerCase()) ||
            !Number.isSafeInteger(entry.uncompressedSize) ||
            entry.uncompressedSize < 0 ||
            entry.uncompressedSize > 64 * 1024 * 1024
          )
            return fail();
          seen.add(trimmed.toLowerCase());
          total += entry.uncompressedSize;
          if (total > 256 * 1024 * 1024) return fail();
          if (name.endsWith("/")) return zip.readEntry();
          zip.openReadStream(entry, (error, stream) => {
            if (error) return fail();
            const digest = createHash("sha256");
            let bytes = 0;
            stream.on("error", fail);
            stream.on("data", (chunk) => {
              bytes += chunk.length;
              if (bytes > entry.uncompressedSize) {
                stream.destroy();
                fail();
                return;
              }
              digest.update(chunk);
            });
            stream.on("end", () => {
              if (finished) return;
              if (bytes !== entry.uncompressedSize) return fail();
              rows.push({ path: name, bytes, sha256: digest.digest("hex") });
              zip.readEntry();
            });
          });
        });
        zip.readEntry();
      },
    );
  });
}
