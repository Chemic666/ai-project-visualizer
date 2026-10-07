# Codex Passive Observation Feasibility Spike

Plan status: Specification Resolved — approved for documentation on 2026-10-07.

Capability status: **Unverified / Technical Verification Pending**.

Execution status: **Not started**. This document contains no experiment result.

Related: D-038; Phase 0 Review B-06 / S-02 / S-03 / S-04 / S-06.

## 1. Question and success boundary

Can an independent observer discover and read a Codex Session started through the user's normal workflow, reliably associate it with a project, and obtain its formal plan and revisions without creating or directing that development Session?

The product remains `Agent → Adapter → Normalized Events → Core → Surface`. The Spike answers feasibility; it does not implement a production Adapter, VS Code UI, orchestration, or a replacement task board.

Starting app-server, initializing a client, or creating a new Thread proves only the tested protocol interaction. It is **not** evidence of observation of an existing CLI/IDE/app Session. Historical data access and live observation are separate capabilities.

## 2. Timing and authorization

Arrange independently as early as possible, targeting evidence before Phase 1 implementation. Core-first implementation remains the roadmap direction and uses Agent-neutral fixtures; technical uncertainty must not leak protocol types into Core. Passing this gate for an approved support scope is mandatory before Phase 7 production integration and before claiming real v0.1 feasibility.

This remediation authorizes documenting the plan only. Research and experimental execution require a subsequent explicit task. Reuse installed tools; dependency installation is not authorized here. Any disposable experiment stays labeled research and is not automatically promoted into production code.

## 3. Documentation research before experiments

For each candidate, collect primary official references, retrieval date and protocol/application version. Do not infer capabilities from names or old undocumented experiments.

| Candidate | Questions to establish | Current evidence |
| --- | --- | --- |
| Codex Plugin | Are passive lifecycle/session/plan subscriptions available? What is their scope and permission model? Does obtaining data require Agent actions? | Unverified |
| app-server | Can a separate client discover/attach/read/subscribe to an already-running user's Session? Is discovery limited to its own process/threads? What is shared across CLI/IDE/app? | Unverified |
| Other formally documented read interface | Is observation supported without workflow control? Does it expose historical snapshots, live updates, stable identities and project metadata? | Unverified; candidate only if documented |

Record plan structure, status/plan certainty semantics, source item IDs, event IDs/sequence/cursor, completion reports, project/worktree metadata, reconnect/history, visibility limits and supported host modes. Neither a terminal command called “test” nor an Agent summary is independent Verification Evidence.

Locate old app-server material if available; record its origin/version and separate old conclusions from current verification. No reusable experimental artifact is currently attached to this repository.

## 4. Select a minimal experiment scope

After research, name the first supported candidate Surface (CLI, IDE extension, or desktop app), OS, installed versions and interface. Prefer the smallest documented passive path. Do not silently select a wrapper or require Visualizer to start the Agent.

Use disposable local test projects with non-sensitive plans. The user starts Codex normally; the observer is a separate read client. A user-entered test prompt to Codex may generate a formal plan, but the observer must not inject instructions, create turns, approve work, or force task updates. Record any setup needed and whether it compromises zero-config expectations.

Only documented read/discover/subscribe operations are eligible. If a candidate requires control actions, stop that path and record its limit. A manually supplied Session ID may demonstrate reading but does not pass automatic discovery; a manually exported plan may demonstrate parsing but does not pass automatic capture.

## 5. Experiment matrix

| Probe | Minimum observation | Pass criterion |
| --- | --- | --- |
| Discovery | Codex starts outside observer; also try observer starting after the Session | Identify that same Session automatically within the supported scope; no new observer-owned development Thread |
| Project attribution | Two test projects, including similar names | Correct root/source evidence; unknown association remains unknown; no cross-project updates |
| Formal plan | User's normal Codex flow produces a plan | Obtain structured plan or documented source form; distinguish explicit plan from chat idea; record flat/nested structure and ID limits |
| Plan revision | Add, rename/reorder and explicitly remove an item | Observe revisions/complete-vs-partial semantics and enough identity to retain history; ambiguous changes explicitly reported |
| Completion | Codex explicitly reports task completion | Task-attributable report with source/time/reference; label Agent Reported, never automatically VERIFIED |
| Session state | Idle/activity/end and observer disconnect | Record which states have actual signals; disconnect must not be confused with end |
| Restart/reconnect | Observer reconnects to the same ongoing Session | Supported cursor/history/recovery behavior documented; duplicate/late-event behavior captured, gaps disclosed |
| Negative case | No formal plan or unreadable source | Distinguish no-plan from observation unavailable; do not fabricate tasks or progress |
| Activity inventory | Representative read/edit/command/test operations | List actual granularity and missing fields; full Activity is not a prerequisite to passive Plan discovery |

Record observation latency per probe. Research must determine how to identify a work boundary and order explicit task selections; if these are unavailable, preserve correction precedence and disclose limits rather than inferring them from file activity or new Turns.

## 6. Data handling and outputs

Keep source references and minimal necessary evidence. Redact credentials, tokens, private prompts, code contents and raw tool output; use test fixture data for reproducibility. Report access requirements, API visibility and gaps without exposing unrelated user sessions.

Deliver a research report containing:

- Exact Surface/OS/application/protocol versions and dated primary references.
- A capability table: available / unavailable / unknown, separately for discovery, live subscription, history, formal plan, revisions, task reporting, activity and attribution.
- Reproduction steps and redacted event fixtures from the **existing** user-started Session.
- Source identity/order/cursor mapping, ambiguous cases, duplicate/gap/reconnect results and measured observation latency.
- Proposed minimal normalization into Core contracts, without importing protocol types or implementing a production package.
- A conclusion, limitations, zero-config implications and any required user support-scope decision.

No results/fixtures exist yet. Their future creation must not be described as completed by this plan.

## 7. Result and release gates

| Result | Meaning | Next action |
| --- | --- | --- |
| Pass | Automatic passive observation supplies project/session/formal plan/revisions and necessary task reports in the tested workflow | Review evidence and approved support scope; only then plan Phase 7 implementation |
| Restricted pass | Core loop works only for named Surface/version/setup or with stated limitations | User approves support boundary; do not advertise general Codex support |
| Fail | Only self-created Threads, final historical records, manual export, or missing essential signals | Keep B-06 technically open; request product decision, do not add orchestration/wrapper automatically |
| Inconclusive | Environment/access prevents reliable experiment | Keep Unverified; state what is needed to retry, no technical PASS |

Passing a subset of probes is not a full Pass. Optional Activity gaps may remain, but limitations affecting task association/current state and real v0.1 acceptance must be explicit. A single-platform result proves only that platform/version; it does not establish cross-platform behavior, VSIX runtime compatibility or SQLite packaging.

## 8. Evidence checklist

- [ ] Research current formal interfaces and versions.
- [ ] Distinguish attach/discovery from creation/control.
- [ ] Select and record one supported normal workflow.
- [ ] Observe existing Session and project attribution.
- [ ] Capture formal plan/revisions and task-attributable reports.
- [ ] Test reconnect, duplicate/gap, no-plan and unreadable-source cases.
- [ ] Record capability/latency/identity limitations and redacted fixtures.
- [ ] Review any restricted support scope with user.
- [ ] Update B-06 technical state using actual evidence; never from this checklist alone.

All items remain pending. Phase 1 has not begun.
