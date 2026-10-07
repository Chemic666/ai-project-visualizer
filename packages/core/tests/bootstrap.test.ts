import { expect, test } from "vitest";

test("loads the Core module without domain or host initialization", async () => {
  const core = await import("../src/index.js");

  expect(Object.keys(core)).toEqual([]);
});
