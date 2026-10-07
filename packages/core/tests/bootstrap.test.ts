import { expect, test, vi } from "vitest";

vi.mock("node:fs", () => {
  throw new Error("Core must not import host filesystem APIs");
});
vi.mock("node:fs/promises", () => {
  throw new Error("Core must not import host filesystem APIs");
});
vi.mock("node:sqlite", () => {
  throw new Error("Core must not import storage APIs");
});
vi.mock("node:net", () => {
  throw new Error("Core must not import network APIs");
});
vi.mock("node:http", () => {
  throw new Error("Core must not import network APIs");
});
vi.mock("node:https", () => {
  throw new Error("Core must not import network APIs");
});
vi.mock("node:child_process", () => {
  throw new Error("Core must not start host processes");
});

test("imports Core without host, storage or network initialization", async () => {
  const fetch = vi.fn(() => {
    throw new Error("Core must not access the network during import");
  });
  vi.stubGlobal("fetch", fetch);
  vi.resetModules();

  try {
    const core = await import("../src/index.js");

    expect(Object.keys(core).sort()).toEqual([
      "PLAN_CERTAINTIES",
      "PROVENANCES",
      "WORK_STATUSES",
      "applyNormalizedEvent",
      "createCoreState",
      "getAssertion",
      "getAssertionsForTarget",
      "getPhase",
      "getProject",
      "getSession",
      "getTask",
      "hasProcessedEvent",
    ]);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
