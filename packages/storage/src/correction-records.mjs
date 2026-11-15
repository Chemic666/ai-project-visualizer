import { closed, id } from "./codec.mjs";
import { demand } from "./errors.mjs";
import { isPlanEvent } from "./plan-records.mjs";

export function validateCorrectionCommand(input) {
  closed(
    input,
    ["id", "scope", "assertion", "effectiveAt"],
    ["originalAssertionId", "supersedes", "triggeringEventId"],
  );
  id(input.id);
}

// Recovery compares this decision to the recorded images. Only those images
// (not re-executed source transitions or regenerated Timeline) supply its cut.
export function correctionCore(plan, input, scope) {
  validateCorrectionCommand(input);
  const result = scope.prepareUserCorrection(plan, scope.planScope, input);
  demand(result.status === "prepared" || result.status === "duplicate");
  return result.status === "duplicate"
    ? plan.core
    : { ...plan.core, ...result.value.patch };
}

export function sourceCorrectionVersions(plan, event, scope) {
  const reason =
    event.type === "session.ended"
      ? "session_ended"
      : isPlanEvent(event)
        ? "task_removed"
        : undefined;
  if (reason === undefined) return plan.core.corrections;
  return plan.core.corrections.map((record) => {
    if (record.lifecycle.status !== "active") return record;
    const prepared = scope.prepareCorrectionExpiry(plan, {
      correctionId: record.id,
      eventId: event.id,
      expiredAt: event.receivedAt,
      reason,
    });
    if (
      prepared.status === "rejected" &&
      prepared.reason === "invalid_expiry_evidence"
    )
      return record;
    demand(prepared.status === "prepared");
    return prepared.value;
  });
}

export function verifyCorrectionLinks(state) {
  const assertions = new Map(state.assertions.map((a) => [a.id, a]));
  const tasks = new Map(state.tasks.map((task) => [task.id, task]));
  const linked = new Set();
  for (const record of state.corrections) {
    const assertion = assertions.get(record.correctedAssertionId);
    demand(
      assertion?.provenance === "user_confirmed" && !linked.has(assertion.id),
    );
    const refs =
      record.scope.kind === "current_task"
        ? state.projects[0].currentTaskAssertionIds
        : tasks.get(record.scope.taskId)?.weightAssertionIds;
    demand(refs?.includes(assertion.id));
    linked.add(assertion.id);
  }
  // Only explicit correction commands may introduce manual authority for
  // these two fields, including when admitting the initial synthetic state.
  for (const assertion of state.assertions)
    if (
      assertion.provenance === "user_confirmed" &&
      ["project.currentTask", "task.weight"].includes(assertion.target)
    )
      demand(linked.has(assertion.id));
}
