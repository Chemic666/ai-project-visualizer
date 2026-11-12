import { encode } from "./codec.mjs";
import { demand } from "./errors.mjs";

// Count the exact UTF-8 size of the canonical JSON array without retaining it.
export function countRowArrayBytes(readRows, budget) {
  let bytes = 2;
  demand(bytes <= budget, "quota_exceeded");
  let separator = 0;
  for (const row of readRows()) {
    bytes += Buffer.byteLength(encode(row)) + separator;
    demand(bytes <= budget, "quota_exceeded");
    separator = 1;
  }
  return bytes;
}

export function checkCatalogBudget(db, native, budget) {
  let bytes = 0;
  const tables = ["bindings"];
  if (native) tables.push("native_bindings");
  for (const table of tables) {
    bytes += countRowArrayBytes(() => {
      if (
        table === "native_bindings" &&
        !db
          .prepare(
            "SELECT name FROM sqlite_schema WHERE type='table' AND name='native_bindings'",
          )
          .get()
      )
        return []; // An absent, not-yet-created table still counts as [].
      return db.prepare(`SELECT * FROM ${table}`).iterate();
    }, budget - bytes);
  }
}
