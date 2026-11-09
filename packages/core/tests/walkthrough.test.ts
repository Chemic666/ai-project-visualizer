import { expect, test } from "vitest";
import { runCoreWalkthrough } from "../examples/walkthrough.js";

test("runnable walkthrough reports actual weighted progress and distinct change reasons", () => {
  const report = runCoreWalkthrough();
  const initial = report.checkpoints.find(
    (row) => row.key === "completed-report",
  )!;
  const expanded = report.checkpoints.find(
    (row) => row.key === "expansion-weighted",
  )!;
  const corrected = report.checkpoints.find(
    (row) => row.key === "weight-corrected",
  )!;
  expect(initial.progress).toMatchObject({
    status: "available",
    completedWeight: 32,
    totalWeight: 45,
    percentage: "71.1%",
  });
  expect(expanded.progress).toMatchObject({
    status: "available",
    completedWeight: 32,
    totalWeight: 50,
    percentage: "64%",
  });
  expect(corrected.progress).toMatchObject({
    status: "available",
    completedWeight: 32,
    totalWeight: 54,
    percentage: "59.3%",
  });
  expect(
    report.checkpoints.find((row) => row.key === "plan-expanded")
      ?.progressReasons,
  ).toContain("plan_expanded");
  expect(corrected.progressReasons).toContain("weight_corrected");
});

test("unavailable progress stays unavailable and never emits a placeholder percentage", () => {
  const report = runCoreWalkthrough();
  for (const key of ["session-started", "plan-expanded"]) {
    const row = report.checkpoints.find((entry) => entry.key === key)!;
    expect(row.progress.status).toBe("unavailable");
    expect(row.progress).not.toHaveProperty("percentage");
    expect(row.progress).not.toHaveProperty("completedWeight");
  }
  expect(
    report.checkpoints.find((entry) => entry.key === "plan-expanded")?.progress,
  ).toMatchObject({ issueCodes: ["weight_unknown"] });
});

test("walkthrough keeps provenance, ends current-task correction and proves safe replay/rejection", () => {
  const report = runCoreWalkthrough();
  expect(report.mode).toBe("synthetic_core_only");
  expect(report.realSessionObserved).toBe(false);
  expect(report.checks).toEqual({
    duplicatePlanPreservesState: true,
    rejectedWeightPreservesState: true,
    restoredSessionReplayPreservesState: true,
    originalCompletionClaimPreserved: true,
  });
  expect(
    report.finalTasks.find((task) => task.title === "Login"),
  ).toMatchObject({
    completion: "completed",
    statusProvenance: "agent_reported",
    weightProvenance: "user_confirmed",
  });
  expect(
    report.checkpoints.find((row) => row.key === "current-task-corrected")
      ?.currentTask,
  ).toMatchObject({
    status: "available",
    title: "JWT",
    provenance: "user_confirmed",
  });
  expect(report.checkpoints.at(-1)?.currentTask).toEqual({ status: "unknown" });
  expect(report.timelineKinds).toContain("correction.expired");
  expect(report.finalTasks.some((task) => task.completion === "verified")).toBe(
    false,
  );
});

test("the synthetic replay is deterministic and publishes no raw Core identities or paths", () => {
  const first = runCoreWalkthrough();
  expect(runCoreWalkthrough()).toEqual(first);
  const output = JSON.stringify(first);
  for (const value of [
    "core:plan:",
    "core:assertion:",
    "synthetic-event-",
    "D:\\\\",
    "sourceReference",
  ])
    expect(output).not.toContain(value);
});

test("the separate membership branch keeps removed history and never transfers old corrections to a re-entered task", () => {
  const report = runCoreWalkthrough();
  expect(report.membershipHistory).toEqual({
    identityChanged: true,
    removedTask: {
      membership: "not_member",
      planVersionCount: 3,
      correctionCount: 3,
      statusClaimCount: 1,
    },
    reenteredTask: {
      membership: "member",
      planVersionCount: 1,
      correctionCount: 0,
      statusClaimCount: 0,
    },
    reentryProgress: "unavailable",
  });
});

test("preview checkpoints expose their own task and timeline evidence without borrowing later facts", () => {
  const report = runCoreWalkthrough();
  const start = report.checkpoints[0]!;
  expect(start.tasks).toEqual([]);
  expect(start.sessionState).toBe("started");
  expect(start.timeline.map((entry) => entry.kind)).toEqual([
    "session.started",
    "progress.changed",
  ]);
  const completed = report.checkpoints.find(
    (entry) => entry.key === "completed-report",
  )!;
  expect(completed.tasks).toHaveLength(2);
  expect(completed.tasks.find((task) => task.title === "Login")).toMatchObject({
    status: "completed",
    completion: "completed",
    statusProvenance: "agent_reported",
    weight: 32,
  });
  const expanded = report.checkpoints.find(
    (entry) => entry.key === "plan-expanded",
  )!;
  expect(expanded.tasks).toHaveLength(4);
  expect(
    expanded.tasks.find((task) => task.title === "Refresh Token"),
  ).not.toHaveProperty("weight");
  expect(
    expanded.tasks.find((task) => task.title === "Refresh Token")?.status,
  ).toBe("unknown");
  expect(report.checkpoints.at(-1)?.sessionState).toBe("ended");
  expect(report.checkpoints.at(-1)?.timeline).toHaveLength(24);
});

test.each([
  { weight: 5, total: 42, percentage: "76.2%" },
  { weight: 13, total: 50, percentage: "64%" },
  { weight: 17, total: 54, percentage: "59.3%" },
])(
  "independent JWT weight trial $weight recomputes Core progress without changing earlier checkpoints",
  ({ weight, total, percentage }) => {
    const report = runCoreWalkthrough(weight);
    expect(
      report.checkpoints.find((row) => row.key === "weight-corrected")
        ?.progress,
    ).toMatchObject({
      status: "available",
      completedWeight: 32,
      totalWeight: total,
      percentage,
    });
    expect(
      report.checkpoints.find((row) => row.key === "expansion-weighted")
        ?.progress,
    ).toMatchObject({
      status: "available",
      completedWeight: 32,
      totalWeight: 50,
      percentage: "64%",
    });
    expect(
      report.checkpoints
        .find((row) => row.key === "weight-corrected")
        ?.tasks.find((task) => task.title === "JWT"),
    ).toMatchObject({
      weight,
      status: "in_progress",
      statusProvenance: "agent_reported",
      weightProvenance: "user_confirmed",
    });
  },
);

test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
  "invalid trial weight %s publishes no report",
  (weight) => {
    expect(() => runCoreWalkthrough(weight)).toThrow(
      "synthetic_update_failed:rejected",
    );
    expect(
      runCoreWalkthrough().checkpoints.find(
        (row) => row.key === "weight-corrected",
      )?.progress,
    ).toMatchObject({
      status: "available",
      completedWeight: 32,
      totalWeight: 54,
      percentage: "59.3%",
    });
  },
);

test("runnable walkthrough expands actual timeline references and separates old actions from current correction lifecycle", () => {
  const report = runCoreWalkthrough();
  expect(report.timelineInspection).toMatchObject({
    entryCount: report.timelineEntryCount,
    unavailableReferenceCount: 0,
    currentTaskCorrection: {
      action: "correction.applied",
      recordVersion: "current_state",
      lifecycle: "expired",
    },
  });
  expect(report.timelineInspection.localReferenceCount).toBeGreaterThan(0);
  expect(report.timelineInspection.currentTaskCorrection.actionAt).toBe(
    "2026-11-08T10:06:00.000Z",
  );
  const output = JSON.stringify(report.timelineInspection);
  expect(output).not.toContain("synthetic-event-");
  expect(output).not.toContain("core:assertion:");
});

test("single-event synthetic inspection shows actual current-task evidence with truthful lifecycle labels", () => {
  const baseline = runCoreWalkthrough();
  const position =
    baseline.checkpoints
      .at(-1)!
      .timeline.findIndex(
        (entry) =>
          entry.kind === "correction.applied" &&
          entry.title.includes("当前任务"),
      ) + 1;
  expect(position).toBeGreaterThan(0);
  const selected = runCoreWalkthrough(17, position).timelineInspection.selected;
  expect(selected).toMatchObject({
    position,
    kind: "correction.applied",
    at: "2026-11-08T10:06:00.000Z",
  });
  expect(selected?.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "assertion",
        value: "JWT",
        provenance: "user_confirmed",
      }),
      expect.objectContaining({
        kind: "correction",
        recordVersion: "current_state",
        lifecycle: "expired",
        value: "已失效",
      }),
    ]),
  );
  const output = JSON.stringify(selected);
  for (const raw of [
    "synthetic-event-",
    "core:plan:",
    "core:assertion:",
    "manual-current-task",
    "sourceReference",
  ])
    expect(output).not.toContain(raw);
});

test("single-event synthetic inspection preserves an explicit Agent completion claim", () => {
  const baseline = runCoreWalkthrough();
  const position =
    baseline.checkpoints
      .at(-1)!
      .timeline.findIndex(
        (entry) =>
          entry.kind === "task.status_reported" &&
          entry.title.includes("Login"),
      ) + 1;
  const selected = runCoreWalkthrough(17, position).timelineInspection.selected;
  expect(selected).toMatchObject({ provenance: "agent_reported" });
  expect(selected?.evidence).toEqual([
    expect.objectContaining({
      kind: "normalized_event",
      value: "明确报告完成",
      provenance: "agent_reported",
    }),
  ]);
  expect(JSON.stringify(selected)).not.toContain("✓");
});

test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 25])(
  "single-event synthetic inspection rejects out-of-range position %s",
  (position) => {
    expect(() => runCoreWalkthrough(17, position)).toThrow(
      "synthetic_inspection_position_invalid",
    );
  },
);

test("checkpoint evidence exposes the original Agent report without a verification upgrade", () => {
  const checkpoint = runCoreWalkthrough().checkpoints.find(
    (row) => row.key === "completed-report",
  )!;
  const event = checkpoint.timeline.find(
    (row) => row.kind === "task.status_reported" && row.title.includes("Login"),
  )!;
  expect(event.evidence).toEqual([
    expect.objectContaining({
      kind: "normalized_event",
      value: "明确报告完成",
      provenance: "agent_reported",
      status: "available",
    }),
  ]);
  expect(JSON.stringify(event.evidence)).not.toContain("✓");
});

test("checkpoint evidence keeps correction lifecycle at that checkpoint and preserves the original action", () => {
  const report = runCoreWalkthrough();
  const action = (key: string) =>
    report.checkpoints
      .find((row) => row.key === key)!
      .timeline.find(
        (row) =>
          row.kind === "correction.applied" && row.title.includes("当前任务"),
      )!;
  expect(action("current-task-corrected").evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "correction",
        recordVersion: "current_state",
        lifecycle: "active",
        value: "有效",
      }),
      expect.objectContaining({
        kind: "assertion",
        value: "JWT",
        provenance: "user_confirmed",
      }),
    ]),
  );
  expect(action("session-ended").evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "correction",
        recordVersion: "current_state",
        lifecycle: "expired",
        value: "已失效",
        endedAt: "2026-11-08T10:12:00.000Z",
      }),
      expect.objectContaining({
        kind: "assertion",
        value: "JWT",
        provenance: "user_confirmed",
      }),
    ]),
  );
  expect(action("current-task-corrected").at).toBe("2026-11-08T10:06:00.000Z");
  expect(action("session-ended").at).toBe("2026-11-08T10:06:00.000Z");
});

test("later checkpoint evidence retains the saved earlier progress transition", () => {
  const report = runCoreWalkthrough(5);
  const find = (key: string) =>
    report.checkpoints
      .find((row) => row.key === key)!
      .timeline.find(
        (row) =>
          row.kind === "progress.changed" &&
          row.at === "2026-11-08T10:04:00.000Z",
      )!;
  expect(find("completed-report").transition).toBe("0% → 71.1%");
  expect(find("session-ended").transition).toBe("0% → 71.1%");
  expect(
    report.checkpoints.find((row) => row.key === "weight-corrected")!.progress,
  ).toMatchObject({ percentage: "76.2%" });
});

test("checkpoint evidence projection stays synthetic and tracks each rebuilt trial independently", () => {
  const a = runCoreWalkthrough(5).checkpoints.find(
    (row) => row.key === "weight-corrected",
  )!;
  const b = runCoreWalkthrough(17).checkpoints.find(
    (row) => row.key === "weight-corrected",
  )!;
  const evidence = (checkpoint: typeof a) =>
    checkpoint.timeline
      .filter((row) => row.at === "2026-11-08T10:10:00.000Z")
      .flatMap((row) => row.evidence ?? []);
  expect(evidence(a)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "assertion",
        value: 5,
        provenance: "user_confirmed",
      }),
    ]),
  );
  expect(evidence(b)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "assertion",
        value: 17,
        provenance: "user_confirmed",
      }),
    ]),
  );
  const output = JSON.stringify(a.timeline.map((row) => row.evidence));
  for (const raw of [
    "synthetic-event-",
    "core:plan:",
    "core:assertion:",
    "sourceReference",
    "manual-current-task",
  ])
    expect(output).not.toContain(raw);
});

test("checkpoint progress evidence identifies the task behind each weight and correction without exposing IDs", () => {
  const report = runCoreWalkthrough();
  const checkpoint = report.checkpoints.find(
    (row) => row.key === "expansion-weighted",
  )!;
  const progress = checkpoint.timeline.find(
    (row) =>
      row.kind === "progress.changed" && row.at === "2026-11-08T10:09:00.000Z",
  )!;
  for (const [title, value] of [
    ["Login", 32],
    ["JWT", 13],
    ["Refresh Token", 3],
    ["Token Revocation", 2],
  ] as const) {
    expect(progress.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "assertion",
          label: `${title} · 任务权重声明`,
          value,
          provenance: "user_confirmed",
        }),
        expect.objectContaining({
          kind: "correction",
          label: `${title} · 任务权重纠正记录`,
        }),
      ]),
    );
  }
  expect(progress.evidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "assertion",
        label: "Login · 任务状态声明",
        value: "明确报告完成",
        provenance: "agent_reported",
      }),
      expect.objectContaining({
        kind: "assertion",
        label: "JWT · 计划确定性声明",
        value: "正式",
      }),
    ]),
  );
  const login = checkpoint.timeline.find(
    (row) => row.kind === "task.status_reported" && row.title.includes("Login"),
  )!;
  expect(login.evidence).toEqual([
    expect.objectContaining({
      label: "Login · 原任务状态报告",
      provenance: "agent_reported",
    }),
  ]);
  expect(JSON.stringify(progress.evidence)).not.toContain("core:assertion:");
});
