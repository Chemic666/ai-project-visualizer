const fs = require("node:fs");
const path = require("node:path");
const { environment, probeCandidate } = require("./probe.cjs");
const root = path.resolve(__dirname, "_runtime", "development-node");
const result = {
  scope: "development_node_only",
  recordedAt: new Date().toISOString(),
  environment: environment(),
  candidates: ["node:sqlite", "better-sqlite3"].map((candidate) =>
    probeCandidate(candidate, root),
  ),
};
fs.mkdirSync(path.join(__dirname, "evidence"), { recursive: true });
fs.writeFileSync(
  path.join(__dirname, "evidence", "development-node.json"),
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
if (
  result.candidates.some((candidate) =>
    Object.values(candidate.tests).some((test) => test.status === "FAIL"),
  )
)
  process.exitCode = 1;
