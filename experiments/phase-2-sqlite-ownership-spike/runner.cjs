"use strict";

const path = require("node:path");
const { CASE_IDS, aggregate } = require("./oracle.cjs");
const { failure, safeError } = require("./protocol.cjs");
const {
  preflight,
  makeRun,
  setupCase,
  writeExclusive,
  inventory,
  budget,
} = require("./support.cjs");
const { VARIANTS, runScenario } = require("./scenarios.cjs");

function parseArgs(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === "--help"))
    return { kind: "help" };
  if (args.length === 1 && args[0] === "--preflight")
    return { kind: "preflight" };
  if (
    args.length === 5 &&
    args[0] === "--case" &&
    args[1] === "OP10" &&
    args[2] === "--variant" &&
    args[3] === "project_busy_watchdog" &&
    args[4] === "--execute"
  )
    return {
      kind: "execute",
      cases: ["OP10"],
      variant: "project_busy_watchdog",
    };
  if (
    args[0] === "--case" &&
    args.length >= 2 &&
    (args[1] === "all" || CASE_IDS.includes(args[1]))
  ) {
    if (args.length === 2)
      return { kind: "plan", cases: args[1] === "all" ? CASE_IDS : [args[1]] };
    if (args.length === 3 && args[2] === "--execute")
      return {
        kind: "execute",
        cases: args[1] === "all" ? CASE_IDS : [args[1]],
      };
  }
  throw failure("APV_ARGUMENT");
}
function outcome(error) {
  return {
    status: [
      "APV_INVARIANT",
      "APV_ORACLE_CUT",
      "APV_ORACLE_HISTORY",
      "APV_ORACLE_BINDING",
      "APV_ACK_UNCOMMITTED",
    ].includes(error.code)
      ? "FAIL"
      : "NOT TESTED",
    ...safeError(error),
    assertion: error.label ?? null,
    observedCategory: error.observed ?? null,
    cleanup: error.cleanup ?? null,
  };
}
async function execute(cases, variantOnly) {
  const run = makeRun();
  const summary = {
    runId: run.runId,
    createdAt: new Date().toISOString(),
    source: "ordinary_windows_node_disposable_harness",
    cases: Object.fromEntries(
      CASE_IDS.map((id) => [id, { status: "NOT TESTED", variants: [] }]),
    ),
    hiddenLockLossGuarantee: "NOT GUARANTEED",
    sourceAckIntegration: "NOT TESTED",
    productionIntegration: "NOT TESTED",
    formalProtocolCoverage: "NOT TESTED",
    decisionAccepted: false,
  };
  let stop = false;
  let unclosed = false;
  const ordered = cases.includes("OP06")
    ? ["OP06", ...cases.filter((id) => id !== "OP06")]
    : cases;
  for (const id of ordered) {
    if (stop) break;
    const requestedVariants = variantOnly ? [variantOnly] : VARIANTS[id];
    for (const variant of requestedVariants) {
      let binding;
      let result;
      try {
        binding = setupCase(run, id, variant);
        result = await runScenario(binding, variant);
        budget(binding.root);
        budget(run.root, 512 * 1024 * 1024);
      } catch (error) {
        result = outcome(error);
        unclosed ||=
          error.unclosed === true || error.cleanup?.unclosed === true;
      }
      const receipt = {
        runId: run.runId,
        caseId: id,
        variant,
        completedAt: new Date().toISOString(),
        ...result,
      };
      writeExclusive(
        path.join(binding?.root ?? run.root, `verdict-${id}-${variant}.json`),
        receipt,
      );
      summary.cases[id].variants.push(receipt);
      if (result.status !== "PASS") {
        stop = true;
        break;
      }
    }
    const statuses = summary.cases[id].variants.map((r) => r.status);
    while (statuses.length < requestedVariants.length)
      statuses.push("NOT TESTED");
    summary.cases[id].status = aggregate(statuses);
    summary.cases[id].fullCaseCoverage = variantOnly
      ? "NOT TESTED"
      : summary.cases[id].status;
  }
  summary.status = aggregate(cases.map((id) => summary.cases[id].status));
  summary.executedScope = [...cases];
  summary.cooperativeProtocolVerification = summary.status;
  summary.allTenCoverage = variantOnly
    ? "NOT TESTED"
    : aggregate(CASE_IDS.map((id) => summary.cases[id].status));
  summary.unclosedOwnedProcesses = unclosed;
  summary.executedVariants = Object.fromEntries(
    cases.map((id) => [id, summary.cases[id].variants.map((r) => r.variant)]),
  );
  summary.completedAt = new Date().toISOString();
  writeExclusive(path.join(run.root, "summary.json"), summary);
  // Do not read/hash SQLite files if a known worker could still hold them.
  if (!unclosed)
    writeExclusive(path.join(run.root, "inventory.json"), inventory(run.root));
  process.stdout.write(
    `${JSON.stringify({ runId: run.runId, status: summary.status, allTenCoverage: summary.allTenCoverage, decisionAccepted: false, evidenceRoot: run.root, hiddenLockLossGuarantee: "NOT GUARANTEED" }, null, 2)}\n`,
  );
  return summary.status === "PASS" ? 0 : summary.status === "FAIL" ? 1 : 2;
}
async function main(args) {
  const parsed = parseArgs(args);
  if (parsed.kind === "help") {
    process.stdout.write(
      "Disposable ownership harness: --preflight; --case OP01..OP10|all (plan only); --case OP01..OP10|all --execute (requires separate human authorization).\n",
    );
    return 0;
  }
  if (parsed.kind === "preflight") {
    process.stdout.write(`${JSON.stringify(preflight(), null, 2)}\n`);
    return 0;
  }
  if (parsed.kind === "plan") {
    process.stdout.write(
      `${JSON.stringify({ status: "NOT TESTED", cases: parsed.cases, executeRequired: true, workerStarted: false, databaseOpened: false })}\n`,
    );
    return 2;
  }
  return execute(parsed.cases, parsed.variant);
}
if (require.main === module)
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify({ status: "NOT TESTED", ...safeError(error), stage: error.preflightStage ?? "harness", workerStarted: error.preflightStage ? false : "UNKNOWN" })}\n`,
      );
      process.exitCode = 2;
    });
module.exports = { parseArgs, outcome, main };
