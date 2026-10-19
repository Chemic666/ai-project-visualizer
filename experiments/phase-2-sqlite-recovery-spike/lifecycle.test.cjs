"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { quiescent } = require("./lifecycle.cjs");
test("observed exit cannot seal evidence before output streams drain", async () => {
  let release,
    done = false;
  const drained = new Promise((resolve) => {
    release = resolve;
  });
  const waiting = quiescent(Promise.resolve(), drained).then(() => {
    done = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(done, false);
  release();
  await waiting;
  assert.equal(done, true);
});
test("pending stream capture has a bounded unavailable timeout", async () => {
  await assert.rejects(quiescent(Promise.resolve(), new Promise(() => {}), 5), {
    code: "EXIT_OR_CAPTURE_TIMEOUT_NOT_TESTED",
  });
});
