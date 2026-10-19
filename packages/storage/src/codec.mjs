import { createHash } from "node:crypto";
import { demand } from "./errors.mjs";

export const collections = [
  "projects",
  "phases",
  "tasks",
  "sessions",
  "assertions",
  "resolvedConclusions",
  "corrections",
  "acceptedEvents",
];
const statuses = ["todo", "in_progress", "completed", "verified", "blocked"];
const targets = [
  "task.status",
  "task.certainty",
  "task.weight",
  "phase.status",
  "project.currentTask",
  "project.currentPhase",
  "session.projectAssociation",
];
const provenances = [
  "observed",
  "agent_reported",
  "visualizer_inferred",
  "user_confirmed",
];
const secret =
  /bearer\s|password\s*[:=]|token\s*[:=]|api[_-]?key\s*[:=]|private key|-----BEGIN|```|\b(?:ghp_|github_pat_|sk-proj-)/i;
export function plain(value, depth = 0) {
  demand(depth <= 64);
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") return demand(Number.isFinite(value));
  if (typeof value === "string")
    return demand(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value));
  demand(typeof value === "object" && value !== null);
  demand(Object.getOwnPropertySymbols(value).length === 0);
  if (Array.isArray(value)) {
    demand(value.length <= 65536);
    for (let i = 0; i < value.length; i++) {
      demand(Object.hasOwn(value, i));
      plain(value[i], depth + 1);
    }
    demand(Object.keys(value).length === value.length);
  } else {
    demand(
      Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null,
    );
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(value),
    )) {
      demand(!["__proto__", "prototype", "constructor"].includes(key));
      demand(Object.hasOwn(descriptor, "value") && descriptor.enumerable);
      plain(descriptor.value, depth + 1);
    }
  }
}
export function closed(value, required, optional = []) {
  demand(value && typeof value === "object" && !Array.isArray(value));
  demand(required.every((k) => Object.hasOwn(value, k)));
  demand(
    Object.keys(value).every(
      (k) => required.includes(k) || optional.includes(k),
    ),
  );
}
export function id(value, limit = 256) {
  demand(
    typeof value === "string" &&
      Buffer.byteLength(value) <= limit &&
      /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value) &&
      !secret.test(value),
  );
}
export function text(value, limit = 512) {
  demand(
    typeof value === "string" &&
      value.length > 0 &&
      Buffer.byteLength(value) <= limit &&
      !secret.test(value) &&
      !/[\r\n]/.test(value),
  );
}
function time(value) {
  demand(
    typeof value === "string" &&
      /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
      Number.isFinite(Date.parse(value)),
  );
}
function ids(value, limit = 256) {
  demand(Array.isArray(value));
  value.forEach((v) => id(v, limit));
  demand(new Set(value).size === value.length);
}
function optional(object, key, check) {
  if (Object.hasOwn(object, key)) check(object[key]);
}
function reference(value, namespace) {
  closed(value, ["sourceId"], ["reference", "revision"]);
  id(value.sourceId);
  demand(namespace === undefined || value.sourceId === namespace);
  demand(Object.hasOwn(value, "reference") || Object.hasOwn(value, "revision"));
  optional(value, "reference", (v) => id(v, 512));
  optional(value, "revision", (v) => id(v, 512));
}
function event(value, projectId) {
  closed(
    value,
    [
      "id",
      "schemaVersion",
      "projectId",
      "sourceId",
      "receivedAt",
      "type",
      "payload",
    ],
    [
      "sessionId",
      "occurredAt",
      "sourceSequence",
      "sourceIdentity",
      "causedBy",
      "relatedEventIds",
    ],
  );
  for (const k of ["id", "projectId", "sourceId"]) id(value[k]);
  demand(value.projectId === projectId && value.schemaVersion === 1);
  optional(value, "sessionId", id);
  time(value.receivedAt);
  optional(value, "occurredAt", time);
  optional(value, "sourceSequence", (v) =>
    demand(Number.isSafeInteger(v) && v >= 0),
  );
  optional(value, "causedBy", id);
  optional(value, "relatedEventIds", ids);
  if (value.sourceIdentity !== undefined) {
    const s = value.sourceIdentity;
    if (s.kind === "source_event") {
      closed(s, ["kind", "sourceId", "sourceEventId"]);
      id(s.sourceId);
      id(s.sourceEventId, 512);
      demand(s.sourceId === value.sourceId);
    } else {
      closed(s, ["kind", "sourceId"], ["reference", "revision"]);
      demand(s.kind === "cursor");
      const { kind: _kind, ...r } = s;
      reference(r, value.sourceId);
    }
  }
  const p = value.payload;
  if (["session.started", "session.ended"].includes(value.type)) {
    closed(p, ["sessionId"], ["sourceSessionReference"]);
    id(p.sessionId);
    demand(value.sessionId === undefined || value.sessionId === p.sessionId);
    optional(p, "sourceSessionReference", (r) => reference(r, value.sourceId));
  } else if (["plan.detected", "plan.updated"].includes(value.type)) {
    closed(p, ["completeness", "steps"], ["sourceReference"]);
    demand(["complete", "partial"].includes(p.completeness));
    demand(Array.isArray(p.steps) && p.steps.length <= 4096);
    for (const step of p.steps) {
      closed(step, ["title"], ["sourceReference"]);
      text(step.title);
      optional(step, "sourceReference", (r) => reference(r, value.sourceId));
    }
    optional(p, "sourceReference", (r) => reference(r, value.sourceId));
  } else {
    demand(value.type === "task.status_reported");
    closed(p, ["taskId", "status"]);
    id(p.taskId);
    demand(statuses.includes(p.status));
  }
  demand(Buffer.byteLength(JSON.stringify(value)) <= 1024 * 1024);
}
export function validateEvent(value, projectId) {
  plain(value);
  event(value, projectId);
  return value;
}

export function validateCursor(value) {
  plain(value);
  closed(value, [
    "sourceId",
    "streamId",
    "codec",
    "position",
    "expectedPrevious",
    "coveredEventIds",
  ]);
  id(value.sourceId);
  id(value.streamId);
  demand(value.codec === "synthetic.v1");
  id(value.position, 512);
  if (value.expectedPrevious !== null) id(value.expectedPrevious, 512);
  ids(value.coveredEventIds);
  return value;
}

export function validateState(
  value,
  projectId,
  { allowedLocations = [] } = {},
) {
  plain(value);
  closed(value, collections);
  for (const c of collections) demand(Array.isArray(value[c]));
  demand(value.projects.length === 1 && value.projects[0].id === projectId);
  const maps = Object.fromEntries(
    collections
      .filter((c) => c !== "resolvedConclusions")
      .map((c) => {
        const map = new Map();
        for (const record of value[c]) {
          id(record.id, c === "assertions" ? 1024 : 256);
          demand(!map.has(record.id));
          map.set(record.id, record);
        }
        return [c, map];
      }),
  );
  const has = (collection, key) => demand(maps[collection].has(key));
  const p = value.projects[0];
  closed(p, [
    "id",
    "name",
    "locations",
    "phaseIds",
    "currentTaskAssertionIds",
    "currentPhaseAssertionIds",
  ]);
  text(p.name);
  ids(p.phaseIds);
  demand(Array.isArray(p.locations) && p.locations.length <= 1);
  p.locations.forEach((loc) =>
    demand(
      typeof loc === "string" &&
        Buffer.byteLength(loc) <= 4096 &&
        allowedLocations.includes(loc),
    ),
  );
  const assertionRefs = (list, target, targetId) => {
    ids(list, 1024);
    for (const key of list) {
      has("assertions", key);
      const a = maps.assertions.get(key);
      demand(a.target === target && a.targetId === targetId);
    }
  };
  assertionRefs(p.currentTaskAssertionIds, "project.currentTask", p.id);
  assertionRefs(p.currentPhaseAssertionIds, "project.currentPhase", p.id);
  for (const ph of value.phases) {
    closed(ph, ["id", "projectId", "title", "taskIds", "statusAssertionIds"]);
    demand(ph.projectId === projectId && p.phaseIds.includes(ph.id));
    text(ph.title);
    ids(ph.taskIds);
    assertionRefs(ph.statusAssertionIds, "phase.status", ph.id);
  }
  p.phaseIds.forEach((key) => has("phases", key));
  for (const t of value.tasks) {
    closed(t, [
      "id",
      "phaseId",
      "title",
      "statusAssertionIds",
      "certaintyAssertionIds",
      "weightAssertionIds",
    ]);
    has("phases", t.phaseId);
    demand(maps.phases.get(t.phaseId).taskIds.includes(t.id));
    text(t.title);
    assertionRefs(t.statusAssertionIds, "task.status", t.id);
    assertionRefs(t.certaintyAssertionIds, "task.certainty", t.id);
    assertionRefs(t.weightAssertionIds, "task.weight", t.id);
  }
  for (const ph of value.phases)
    for (const key of ph.taskIds) {
      has("tasks", key);
      demand(maps.tasks.get(key).phaseId === ph.id);
    }
  for (const s of value.sessions) {
    closed(s, [
      "id",
      "sourceId",
      "sourceSessionId",
      "projectAssociationAssertionIds",
    ]);
    id(s.sourceId);
    if (s.sourceSessionId !== null) id(s.sourceSessionId, 512);
    assertionRefs(
      s.projectAssociationAssertionIds,
      "session.projectAssociation",
      s.id,
    );
  }
  const evidence = (r) => {
    if (r.kind === "event") {
      closed(r, ["kind", "eventId"]);
      has("acceptedEvents", r.eventId);
    } else if (r.kind === "assertion") {
      closed(r, ["kind", "assertionId"]);
      has("assertions", r.assertionId);
    } else {
      closed(r, ["kind", "reference"]);
      demand(r.kind === "source");
      reference(r.reference);
    }
  };
  const targetValue = (a) => {
    demand(targets.includes(a.target));
    const collection = a.target.startsWith("task.")
      ? "tasks"
      : a.target === "phase.status"
        ? "phases"
        : a.target.startsWith("project.")
          ? "projects"
          : "sessions";
    has(collection, a.targetId);
    if (["task.status", "phase.status"].includes(a.target))
      demand(statuses.includes(a.value));
    else if (a.target === "task.certainty")
      demand(["confirmed", "tentative", "idea"].includes(a.value));
    else if (a.target === "task.weight")
      demand(
        typeof a.value === "number" && Number.isFinite(a.value) && a.value > 0,
      );
    else {
      id(a.value);
      has(
        a.target === "project.currentTask"
          ? "tasks"
          : a.target === "project.currentPhase"
            ? "phases"
            : "projects",
        a.value,
      );
    }
  };
  for (const a of value.assertions) {
    closed(
      a,
      [
        "id",
        "sourceId",
        "observedAt",
        "target",
        "targetId",
        "value",
        "provenance",
      ],
      ["assertedAt", "eventId", "sourceReference", "inference"],
    );
    id(a.sourceId);
    time(a.observedAt);
    optional(a, "assertedAt", time);
    optional(a, "eventId", (key) => has("acceptedEvents", key));
    optional(a, "sourceReference", (r) => reference(r, a.sourceId));
    targetValue(a);
    demand(provenances.includes(a.provenance));
    if (a.provenance === "visualizer_inferred") {
      const inf = a.inference,
        association = a.target === "project.currentTask",
        confidence = association
          ? "associationConfidence"
          : "inferenceConfidence";
      closed(inf, [
        "kind",
        "ruleId",
        "ruleVersion",
        "evaluatedAt",
        "evidenceRefs",
        confidence,
      ]);
      demand(
        inf.kind ===
          (association ? "current_task_association" : "assertion_inference"),
      );
      text(inf.ruleId);
      text(inf.ruleVersion);
      time(inf.evaluatedAt);
      demand(Array.isArray(inf.evidenceRefs) && inf.evidenceRefs.length > 0);
      inf.evidenceRefs.forEach(evidence);
      closed(inf[confidence], ["heuristicScore"]);
      const score = inf[confidence].heuristicScore;
      demand(
        typeof score === "number" &&
          Number.isFinite(score) &&
          score >= 0 &&
          score <= 100,
      );
    } else demand(a.inference === undefined);
  }
  for (const e of value.acceptedEvents) {
    event(e, projectId);
    optional(e, "causedBy", (key) => has("acceptedEvents", key));
    optional(e, "relatedEventIds", (keys) =>
      keys.forEach((key) => has("acceptedEvents", key)),
    );
    if (e.type === "task.status_reported") has("tasks", e.payload.taskId);
    if (e.sessionId !== undefined) {
      has("sessions", e.sessionId);
      demand(maps.sessions.get(e.sessionId).sourceId === e.sourceId);
    }
  }
  for (const c of value.corrections) {
    closed(
      c,
      ["id", "scope", "correctedAssertionId", "effectiveAt", "lifecycle"],
      ["originalAssertionId", "supersedes", "triggeringEventId"],
    );
    time(c.effectiveAt);
    has("assertions", c.correctedAssertionId);
    optional(c, "originalAssertionId", (key) => {
      has("assertions", key);
      const a = maps.assertions.get(key),
        b = maps.assertions.get(c.correctedAssertionId);
      demand(a.target === b.target && a.targetId === b.targetId);
    });
    optional(c, "supersedes", (key) => has("corrections", key));
    optional(c, "triggeringEventId", (key) => has("acceptedEvents", key));
    const s = c.scope;
    demand(s.projectId === projectId);
    optional(s, "sessionId", (key) => has("sessions", key));
    if (s.kind === "current_task") {
      closed(s, ["kind", "projectId", "sessionId"]);
      demand(
        maps.assertions.get(c.correctedAssertionId).target ===
          "project.currentTask",
      );
    } else if (s.kind === "task_weight") {
      closed(s, ["kind", "projectId", "taskId"], ["sessionId"]);
      has("tasks", s.taskId);
      const a = maps.assertions.get(c.correctedAssertionId);
      demand(a.target === "task.weight" && a.targetId === s.taskId);
    } else {
      closed(s, ["kind", "projectId", "eventIds"], ["sessionId"]);
      demand(s.kind === "historical_activity_association");
      ids(s.eventIds);
      demand(s.eventIds.length > 0);
      s.eventIds.forEach((key) => has("acceptedEvents", key));
    }
    const l = c.lifecycle;
    if (l.status === "active") closed(l, ["status"]);
    else {
      closed(
        l,
        [
          "status",
          "reasonCode",
          "ruleId",
          "ruleVersion",
          ...(l.status === "superseded"
            ? ["supersededBy", "supersededAt"]
            : ["expiredAt"]),
        ],
        ["triggeringEventId"],
      );
      demand(["superseded", "expired"].includes(l.status));
      text(l.reasonCode);
      text(l.ruleId);
      text(l.ruleVersion);
      time(l.supersededAt ?? l.expiredAt);
      optional(l, "supersededBy", (key) => has("corrections", key));
      optional(l, "triggeringEventId", (key) => has("acceptedEvents", key));
    }
  }
  const conclusionKeys = new Set();
  for (const r of value.resolvedConclusions) {
    closed(r, [
      "target",
      "targetId",
      "selectedAssertionId",
      "supportingAssertionIds",
      "conflictingAssertionIds",
      "resolution",
    ]);
    demand(targets.includes(r.target));
    const key = r.target + ":" + r.targetId;
    demand(!conclusionKeys.has(key));
    conclusionKeys.add(key);
    for (const aid of [
      r.selectedAssertionId,
      ...r.supportingAssertionIds,
      ...r.conflictingAssertionIds,
    ]) {
      has("assertions", aid);
      const a = maps.assertions.get(aid);
      demand(a.target === r.target && a.targetId === r.targetId);
    }
    ids(r.supportingAssertionIds, 1024);
    ids(r.conflictingAssertionIds, 1024);
    closed(r.resolution, ["resolvedAt", "ruleId", "ruleVersion", "reason"]);
    time(r.resolution.resolvedAt);
    text(r.resolution.ruleId);
    text(r.resolution.ruleVersion);
    text(r.resolution.reason);
  }
  return value;
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sorted(value[k])]),
    );
  return value;
}
export function encode(value) {
  plain(value);
  return JSON.stringify(sorted(value));
}
export function digest(value) {
  return createHash("sha256").update(encode(value)).digest("hex");
}
export function sourceClaim(e) {
  const { id: _id, receivedAt: _receivedAt, ...rest } = e;
  return digest(rest);
}
