import assert from "node:assert/strict";
import test from "node:test";
import { WriterLifecycle } from "../src/lifecycle.mjs";

const stages = [
  "ADMITTED",
  "OWNER_HELD_UNFENCED",
  "RECOVERED",
  "FENCED",
  "ACTIVE",
  "REVOKING",
  "DRAINED",
  "CLOSED",
];
test("O01: normal lifetime has every real stage; CLOSED cannot return to ACTIVE", () => {
  const life = new WriterLifecycle();
  for (const stage of stages.slice(1)) life.advance(stage);
  assert.deepEqual(
    life.history().map((e) => e.phase),
    stages,
  );
  assert.throws(() => life.assertActive(), { code: "unavailable" });
  assert.throws(() => life.advance("ACTIVE"), { code: "unavailable" });
});
test("O01/M04: early revocation is monotonic and blocks intake before drain", () => {
  const life = new WriterLifecycle();
  life.advance("REVOKING");
  assert.throws(() => life.assertActive(), { code: "unavailable" });
  assert.throws(() => life.advance("OWNER_HELD_UNFENCED"), {
    code: "unavailable",
  });
  life.advance("DRAINED");
  life.advance("CLOSED");
});
test("O01: no fencing/recovery stages may be skipped or fabricated", () => {
  const life = new WriterLifecycle();
  assert.throws(() => life.advance("ACTIVE"), { code: "unavailable" });
  assert.throws(() => life.advance("CLOSED"), { code: "unavailable" });
  assert.equal(life.phase(), "ADMITTED");
});
