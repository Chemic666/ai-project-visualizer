import path from "node:path";
import { demand, StorageError } from "./errors.mjs";

// Evidence of the actual connection's reported pathname, NOT its OS file ID.
// A Driver/VFS-owned Windows handle is not exposed by the current public API.
export function inspectConnection(db, expectedPath) {
  try {
    demand(db.open && typeof db.name === "string", "binding_conflict");
    const attached = db.pragma("database_list");
    demand(
      Array.isArray(attached) && attached.length >= 1 && attached.length <= 2,
      "binding_conflict",
    );
    const main = attached.find((row) => row.name === "main");
    demand(main, "binding_conflict");
    for (const row of attached)
      if (row !== main)
        demand(
          row.seq === 1 &&
            row.name === "temp" &&
            row.file === "" &&
            db.pragma("temp_store", { simple: true }) === 2,
          "binding_conflict",
        );
    demand(
      main.name === "main" &&
        main.seq === 0 &&
        typeof main.file === "string" &&
        path.isAbsolute(main.file),
      "binding_conflict",
    );
    demand(
      main.file === expectedPath && db.name === expectedPath,
      "binding_conflict",
    );
    return {
      sqliteReportedName: main.file,
      driverName: db.name,
      nativeHandleIdentity: "unavailable",
      assurance: "connection-reported-path-only",
    };
  } catch {
    throw new StorageError("binding_conflict");
  }
}
