import { encode } from "./codec.mjs";
import { demand } from "./errors.mjs";

// Logical UTF-8 size of the closed SQL-row arrays, not SQLite pages/journals.
// Stream rows and stop at the first over-budget row instead of loading a whole
// catalog. A single row still follows the existing trusted catalog contract.
export function checkCatalogBudget(db, native, budget) {
  let bytes = 0;
  const tables = ["bindings"];
  if (native) tables.push("native_bindings");
  for (const table of tables) {
    bytes += 2; // [] also counts for a not-yet-created schema-2 Native table.
    demand(bytes <= budget, "quota_exceeded");
    if (
      table === "native_bindings" &&
      !db
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type='table' AND name='native_bindings'",
        )
        .get()
    )
      continue;
    let first = true;
    for (const row of db.prepare(`SELECT * FROM ${table}`).iterate()) {
      bytes += Buffer.byteLength(encode(row)) + (first ? 0 : 1);
      demand(bytes <= budget, "quota_exceeded");
      first = false;
    }
  }
}
