// Disposable acceptance verdicts. Pure data only; no Host, SQLite or process IO.
const REQUIRED_CHECKS = [
  "module_loading",
  "file_open",
  "sqlite_version",
  "schema",
  "prepared_statements",
  "foreign_keys",
  "commit",
  "rollback",
  "wal",
  "busy_timeout",
  "lock_handling",
  "close",
  "reopen",
  "persisted_data",
];
function summarizeStates(states) {
  if (states.includes("FAIL")) return "FAIL";
  if (
    !states.length ||
    states.some((state) => !["PASS", "PASS WITH LIMITATION"].includes(state))
  )
    return "NOT TESTED";
  return states.includes("PASS WITH LIMITATION")
    ? "PASS WITH LIMITATION"
    : "PASS";
}
function summarizeChecks(checks, required) {
  return summarizeStates([
    ...Object.values(checks ?? {}).map((check) => check?.status),
    ...required.map((name) => checks?.[name]?.status ?? "NOT TESTED"),
  ]);
}
function summarizeReceipt(receipt, candidate, required) {
  if (!receipt?.environment?.electron || receipt.activation !== "PASS")
    return "NOT TESTED";
  return summarizeChecks(
    receipt.candidates?.find((item) => item.candidate === candidate)?.tests,
    required,
  );
}
function validIdentity(process) {
  return (
    Number.isInteger(process?.pid) &&
    process.pid > 0 &&
    typeof process.createdAt === "string" &&
    Number.isFinite(Date.parse(process.createdAt))
  );
}
const identityKey = (process) => `${process.pid}@${process.createdAt}`;
function knownExitVerdict(input) {
  const reasons = [];
  let alive = false;
  if (input.receiptValid !== true)
    reasons.push("Missing or invalid internal Host receipt");
  if (
    input.baselineReadable !== true ||
    input.current?.readable !== true ||
    !Array.isArray(input.current?.processes)
  )
    reasons.push("Required process observation unavailable");
  if (
    !input.known?.length ||
    !validIdentity(input.host) ||
    !input.known?.some(
      (process) => identityKey(process) === identityKey(input.host),
    )
  )
    reasons.push("Missing known Host identity");
  if (input.ambiguous?.length)
    reasons.push("Suspicious processes lack reliable ownership");
  if (input.informationGaps?.length) reasons.push(...input.informationGaps);
  const independentChecks = Array.isArray(input.current?.requiredIdentityChecks)
    ? input.current.requiredIdentityChecks
    : [];
  if (
    independentChecks.some(
      (item) =>
        !Number.isInteger(item?.pid) ||
        typeof item?.expectedCreatedAt !== "string",
    )
  )
    reasons.push(
      "Malformed independent PID observation (expected scalar PID/creation time)",
    );
  for (const process of input.known ?? []) {
    if (!validIdentity(process)) {
      reasons.push("Known identity lacks PID/creation time");
      continue;
    }
    const independent = independentChecks.find(
      (item) =>
        item.pid === process.pid &&
        item.expectedCreatedAt === process.createdAt,
    );
    if (!independent)
      reasons.push(`Missing independent PID observation for ${process.pid}`);
    else if (
      independent.queryExecuted !== true ||
      independent.source !== "System.Diagnostics.Process" ||
      !Number.isFinite(Date.parse(independent.observedAt)) ||
      !Number.isFinite(Date.parse(independent.completedAt)) ||
      Date.parse(independent.completedAt) < Date.parse(independent.observedAt)
    )
      reasons.push(
        `Independent PID query execution unproven for ${process.pid}`,
      );
    else if (
      independent.state === "alive" &&
      independent.resultCode === "process_identity_read" &&
      independent.currentCreatedAt === process.createdAt
    ) {
      alive = true;
      reasons.push(`Known PID ${process.pid} independently still alive`);
    } else if (
      independent.state !== "gone" ||
      independent.resultCode !== "process_not_found"
    )
      reasons.push(
        `Independent PID check ${process.pid}: ${independent.state}`,
      );
    const current = input.current?.processes?.find(
      (item) => item.pid === process.pid,
    );
    if (!current) continue;
    if (!validIdentity(current))
      reasons.push(`Unreadable creation time for PID ${process.pid}`);
    else if (current.createdAt !== process.createdAt)
      reasons.push(`PID ${process.pid} reused or identity changed`);
    else {
      alive = true;
      reasons.push(`Known PID ${process.pid} still alive`);
    }
  }
  return {
    status: alive ? "FAIL" : reasons.length ? "NOT TESTED" : "PASS",
    scope: "known_process_set_only",
    reasons,
  };
}
function wholeExitVerdict(known, confirmation) {
  if (known.status !== "PASS")
    return { ...known, method: "blocked", automaticStatus: "NOT TESTED" };
  const limitation =
    "Process sampling cannot prove coverage of every short-lived or delegated process; complete-window exit is manually confirmed";
  if (
    confirmation?.windowsClosed !== true ||
    !Number.isFinite(Date.parse(confirmation.confirmedAt))
  )
    return {
      status: "NOT TESTED",
      method: "sampled_process_tracking_only",
      automaticStatus: "NOT TESTED",
      reasons: ["Explicit human confirmation missing"],
      limitations: [limitation],
    };
  return {
    status: "PASS WITH LIMITATION",
    method: "manual_confirmation_with_sampled_process_tracking",
    automaticStatus: "NOT TESTED",
    reasons: [],
    limitations: [limitation],
    confirmation,
  };
}
function buildProcessLedger(lifecycle) {
  const known = new Map();
  const ambiguous = new Map();
  const informationGaps = [];
  const baseline = lifecycle.baseline;
  const samples = lifecycle.samples ?? [];
  const baselineKeys = new Set(
    (baseline?.processes ?? []).filter(validIdentity).map(identityKey),
  );
  if (lifecycle.timedOut || lifecycle.launchError || lifecycle.handshakeError)
    informationGaps.push(
      "Launch/monitor/handshake failure interrupted observation",
    );
  if (baseline?.readable !== true)
    informationGaps.push("Pre-launch process baseline unreadable");
  for (const process of baseline?.processes ?? []) {
    if (
      process.codeCandidate &&
      (!validIdentity(process) || !process.commandLineReadable)
    )
      informationGaps.push("Opaque Code candidate in pre-launch baseline");
    if (process.profileMatch)
      informationGaps.push("Isolated profile already running before launch");
  }
  for (const [process, via] of [
    [lifecycle.root, "owned_start_process_handle"],
    [lifecycle.host, "internal_host_handshake_and_cim"],
  ]) {
    if (validIdentity(process))
      known.set(identityKey(process), {
        ...process,
        via,
        profileId: lifecycle.acceptanceId,
      });
    else informationGaps.push(`Missing reliable ${via} identity`);
  }
  if (samples.length < 2)
    informationGaps.push("Insufficient lifecycle observations");
  let priorSampleTime = -Infinity;
  for (const sample of samples) {
    const timestamp = Date.parse(sample.recordedAt);
    if (
      sample.readable !== true ||
      !Array.isArray(sample.processes) ||
      !Number.isFinite(timestamp)
    ) {
      informationGaps.push("Lifecycle observation failed");
      continue;
    }
    if (timestamp < priorSampleTime)
      informationGaps.push("Observation clock moved backwards");
    priorSampleTime = timestamp;
    const byPid = new Map(
      sample.processes.map((process) => [process.pid, process]),
    );
    for (const process of sample.processes) {
      if (process.profileMatch) {
        if (validIdentity(process)) {
          if (!known.has(identityKey(process)))
            known.set(identityKey(process), {
              ...process,
              via: "exact_isolated_profile_argument",
              profileId: lifecycle.acceptanceId,
            });
        } else
          informationGaps.push(
            "Profile-related process creation time unreadable",
          );
      }
    }
    // Parent PID alone is insufficient: require its observed creation identity.
    let changed = true;
    while (changed) {
      changed = false;
      for (const process of sample.processes) {
        const parent = byPid.get(process.parentPid);
        if (!validIdentity(parent) || !known.has(identityKey(parent))) continue;
        if (!validIdentity(process)) {
          informationGaps.push("Related child creation time unreadable");
          continue;
        }
        if (
          Date.parse(process.createdAt) < Date.parse(parent.createdAt) ||
          (Date.parse(process.createdAt) === Date.parse(parent.createdAt) &&
            process.createdAt < parent.createdAt)
        ) {
          informationGaps.push(
            "Parent PID reuse or inconsistent creation order",
          );
          continue;
        }
        if (!known.has(identityKey(process))) {
          known.set(identityKey(process), {
            ...process,
            via: "observed_parent_creation_identity",
            parentIdentity: identityKey(parent),
            profileId: lifecycle.acceptanceId,
          });
          changed = true;
        }
      }
    }
    for (const process of sample.processes) {
      const potentialChild = [...known.values()].some(
        (parent) => parent.pid === process.parentPid,
      );
      if (
        (!process.codeCandidate && !potentialChild) ||
        (validIdentity(process) && baselineKeys.has(identityKey(process))) ||
        (validIdentity(process) && known.has(identityKey(process)))
      )
        continue;
      // A different-looking path is not proof of a different Windows profile
      // (aliases/delegation are possible). Retain unowned new candidates.
      ambiguous.set(
        validIdentity(process)
          ? identityKey(process)
          : `unreadable@${process.pid}`,
        process,
      );
    }
    for (const process of sample.processes) {
      if (validIdentity(process) && known.has(identityKey(process))) {
        const item = known.get(identityKey(process));
        item.lastSeenAt = sample.recordedAt;
        item.observationCount = (item.observationCount ?? 0) + 1;
      }
    }
  }
  // Later independent evidence can establish ownership; lost information cannot.
  for (const key of known.keys()) ambiguous.delete(key);
  return {
    known: [...known.values()],
    ambiguous: [...ambiguous.values()],
    informationGaps: [...new Set(informationGaps)],
    baselineReadable: baseline?.readable === true,
    host: lifecycle.host,
  };
}
module.exports = {
  REQUIRED_CHECKS,
  summarizeStates,
  summarizeChecks,
  summarizeReceipt,
  validIdentity,
  identityKey,
  knownExitVerdict,
  wholeExitVerdict,
  buildProcessLedger,
};
