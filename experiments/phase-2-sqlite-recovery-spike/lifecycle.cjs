"use strict";
const { fail } = require("./checks.cjs");
async function quiescent(exited, drained, timeoutMs = 10000) {
  let timer;
  try {
    await Promise.race([
      Promise.all([exited, drained]),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(fail("EXIT_OR_CAPTURE_TIMEOUT_NOT_TESTED")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
module.exports = { quiescent };
