# Phase 0 Review — AI Project Visualizer

Review date: 2026-10-07 (Asia/Shanghai)  
Specification baseline: `ce04604` — `docs: establish project foundation`  
Disposition: **Review completed; specification is not yet ready for an unconditional Phase 1 start.**

## 1. Executive Summary

The product direction is coherent: observe existing development, reconstruct project state, and answer **“Where is this project right now?”** The accepted separation `Agent → Adapter → Normalized Events → Project Core → Surface` is appropriate. Phase 1 should build a completely independent Core using controlled events, without Codex, VS Code, SQLite, network access, or an LLM as runtime requirements.

The specification nevertheless contains release-order conflicts and incomplete contracts that would force implementers to make product decisions silently. The largest problems are the v0.1 estimated-progress requirement scheduled after release, trust principles classified as optional acceptance work, ambiguous storage ownership, insufficient per-conclusion provenance, unspecified correction precedence, and assumed passive Codex observation without technical evidence.

### Finding totals and severity meaning

| Classification | Unique findings | Meaning |
| --- | ---: | --- |
| BLOCKER | 6 | A specification decision or missing feasibility gate blocks the affected work. Each finding states its gate; not every technical experiment blocks independent Core implementation. |
| SHOULD FIX | 16 | Correct before the affected phase or v0.1 acceptance; these are bounded gaps rather than reasons to expand the product. |
| CAN DEFER | 5 | Record for a later phase; do not implement during Phase 1. |
| Total | 27 | Count B-01–B-06, S-01–S-16, and D-01–D-05 once each. Later tables reference these IDs and do not add findings. |

### Evidence and limits

All nine requested documents were read: `AGENTS.md`, `PRODUCT.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DECISIONS.md`, `docs/TECH_STACK.md`, `docs/UX.md`, `docs/acceptance/v0.1.md`, and `docs/COMPETITIVE.md`. References below use their current section names, decision IDs, scenario IDs, and selected line numbers.

The working tree was clean at inspection. The repository contains specification documents and `.gitignore`; there are no package manifests, production packages, tests, or checked-in app-server experiments in this baseline. Statements that old experiments exist are documentary claims, not reproducible evidence in this repository.

This review only inspected the repository and created this report. It did not perform external documentation research, install dependencies, initialize a workspace, execute technical spikes, implement models, or test integrations. Toolchain versions and third-party capabilities remain **unverified**, not disproved. Recommendations below are proposed documentation corrections, not adopted changes to accepted decisions.

## 2. Document Contradictions

### B-01 — BLOCKER — Estimated Task Progress is required before it is scheduled

**Evidence:** `docs/acceptance/v0.1.md` Scenario 12 (line 775) requires two independent displayed numbers; §6 makes separation P0-08. §10 also requires Scenario 12 to pass to complete Phase 4. `ROADMAP.md` places v0.1 release at Phase 11 (line 329), but estimated task progress at Phase 13 (line 394). `docs/UX.md` §39 omits estimates from its minimum v0.1 Overview while earlier Overview examples include them. D-011 accepts the distinction but does not specify release timing.

**Impact:** Phase 4 cannot satisfy its stated end-to-end gate, and Phase 11 cannot pass all P0 requirements under the current sequence.

**Required resolution:** Explicitly decide whether to schedule a minimal, explainable estimate before Phase 11 or defer the *presence* of estimates in v0.1 while keeping strict separation whenever estimates exist. The latter changes current acceptance scope and needs user approval. A placeholder estimate is not a pass for Scenario 12. **Gate: before Phase 1 planning is finalized.**

### B-02 — BLOCKER — P1 acceptance weakens mandatory trust and privacy rules

**Evidence:** Acceptance §7 (line 1610) classifies Plan Certainty, Source References, Low Confidence UX, Agent Reported COMPLETED, Repository not polluted, and Privacy defaults as P1 items that may have defects. D-005, D-014, D-016, D-019, D-025, D-027 and `AGENTS.md` make their underlying invariants mandatory. Acceptance §9 itself requires provenance distinctions and privacy. Task Weight Editing is P1 there, but UX §39 and Roadmap Phase 11 include it in the minimum release.

**Impact:** “All P0 passed” could incorrectly permit fabricated certainty, source loss, false verification, or default repository pollution. Source tracking and certainty also underpin the P0 progress denominator.

**Required resolution:** Separate non-negotiable trust invariants from optional UI polish. Promote the invariants to release gates; resolve weight-editing priority explicitly. Distinguish a deferred certainty presentation from the mandatory exclusion of tentative/idea work. **Gate: before Phase 1 contracts and release criteria are approved.**

### B-03 — BLOCKER — Core/Storage ownership has two plausible interpretations

**Evidence:** `ARCHITECTURE.md` §2.1 places Storage inside Core, and §3 repeats it. Its §4 also creates a separate storage package. `docs/TECH_STACK.md` §6.1 (line 236), §8, and §21 explicitly prohibit Core → SQLite and prescribe Storage → Core dependencies. D-007 and D-008 require independent business logic.

**Impact:** Following the architecture diagrams literally could put a SQLite implementation, database lifecycle, or VS Code storage access inside Core.

**Required resolution:** Clarify that Core owns domain behavior and only the persistence contract it actually needs; Storage owns concrete persistence and migrations. The host supplies storage location and composes Adapter, Core, and Storage. Core must not import a driver, Codex protocol, or `vscode`. Architectural “Storage” inside the Core box must mean a port, if that was the intent. **Gate: before Phase 1 dependency design.**

### S-13 — SHOULD FIX — Completion icons contradict the status legend

**Evidence:** UX §9 assigns `◐` to COMPLETED and `✓` to VERIFIED, but §8 and §7 show checkmarks for ordinary completed work, and §34 says `✓ Verified / completed` (line 1130). `docs/TECH_STACK.md` §14.2 and PRODUCT §7 use similar ambiguous checkmarks. D-016 and Scenarios 16–17 prohibit equating an Agent report with verification.

**Required correction:** Apply one legend to task examples. For aggregate phases, explain whether an icon means all tasks reported complete or all tasks verified. A future verification engine need not exist to render COMPLETED honestly in v0.1.

### S-14 — SHOULD FIX — Document status and authority are inconsistent

**Evidence:** Roadmap Phase 0 still lists creation of DECISIONS, UX, acceptance, and competitive research as unchecked, though those files exist. COMPETITIVE §44 says the prerequisites are complete without resolving the old-experiment evidence gap. TECH_STACK §5 places `COMPETITIVE.md` at root while the actual file is under `docs/`. DECISIONS §5 enumerates four statuses, but §7 uses `Pending`. Several documents retain “next step” instructions from their drafting sequence.

**Required correction:** Update status from evidence; distinguish a completed document from a passed technical gate. Mark examples, accepted rules, pending implementation choices, v0.1 requirements, and future designs clearly. AGENTS already delegates by subject but gives no conflict-resolution rule: conflicting accepted requirements must be reported for decision, not silently resolved by whichever document is read last.

### S-16 — SHOULD FIX — Retention defaults disagree

**Evidence:** PRODUCT §21 describes short-term/compacted raw events; ARCHITECTURE §22 permits retaining everything in v1; UX §30 presents a seven-day retention setting. No roadmap phase implements that lifecycle.

**Required correction:** Choose and document a bounded initial policy before raw collection/storage. Specify which records are raw and which evidence references must survive. A retention setting must not promise deletion that is not implemented. This is distinct from the deferred generalized retention interface in D-02.

The North Star, observer role, local-first default, optional semantic analysis, and independence from Codex/VS Code agree across the documents. A v1 ambition and a narrower v0.1 requirement are not inherently contradictory; the release labels need to be explicit.

## 3. Scope Risks

### S-01 — SHOULD FIX — Repository examples encourage premature package creation

**Evidence:** ARCHITECTURE §4 includes `semantic`, `shared`, CLI, both Codex integration paths, and many engine folders. TECH_STACK §5 explicitly warns against empty semantic/shared packages, but §22 still recommends creating Core, Adapter, Storage, and Extension together at formal startup. Roadmap introduces these capabilities in different phases. D-033 rejects technology without a present need.

**Recommendation:** Label the large tree as a future map. During Phase 1 create only the Core package and its necessary test/build configuration. Add Storage at Phase 2, Adapter when its integration phase starts, and the Extension at Phase 10. Research outputs may precede those packages without creating production placeholders. Monorepo is accepted; creating all future packages immediately is not required.

### D-01 — CAN DEFER — Future UX must not become the v0.1 implementation checklist

**Evidence:** UX §§20–23 and §30 include semantic controls, attention signals, export, and advanced data settings; §§37–38 include “Since you last viewed.” Roadmap schedules semantic analysis, signals, export, and CLI after release; UX §40 also allows later enhancement.

**Disposition:** Roadmap candidate for the already listed later phases. Mark these mockups as future. Defer semantic providers, export/import, advanced summaries, verification engine, extra Agents, and multi-session UI. v0.1 Magic Moment can use meaningful recent events without an LLM summary or a new orchestrator. The proposed minimal estimate, if selected for B-01, is the only scope-sensitive exception and must be approved explicitly.

### D-02 — CAN DEFER — Generic provider and retention frameworks are premature

**Evidence:** ARCHITECTURE §35 proposes five empty extension interfaces; §22 requests a retention interface. No current second implementation demonstrates the required variations.

**Disposition:** Future idea. Define only contracts exercised by the current Core boundary and chosen integration. Defer plugin discovery, provider registries, generalized storage backends, and sophisticated compaction. A concrete privacy policy remains required under S-09/S-16; it does not require a framework.

### D-03 — CAN DEFER — Full multi-source reconciliation is later work

**Evidence:** PRODUCT §11 and D-026 describe a unified view; Acceptance Scenario 22 requires expressible source-specific states but explicitly defers full conflict UI. Roadmap Phase 3 lists source models without a multi-source resolution phase.

**Disposition:** Roadmap candidate after the single-source loop works. Preserve source-specific assertions and references now (B-04); defer PLAN.md/TODO.md ingestion, automatic merge heuristics, and conflict-resolution UI. Source preservation does not authorize a general task-management platform.

Repeated requirements for provenance, corrections, plan history, and explainability support the same product rather than four extra features. Their normative definitions should live in one place with links from UX and acceptance (S-14), preventing divergent implementations. Activity is an advanced/P1 surface; it must not crowd out the core loop. Transport activity needed for inference is distinct from a polished Activity UI.

## 4. Architecture Risks

### B-04 — BLOCKER — The example model cannot preserve provenance for each conclusion

**Evidence:** ARCHITECTURE §5 supplies one `Task.provenance`, one optional `confidence`, and one status. Project current task/phase and Phase status have no corresponding assertion metadata in those examples. PlanCertainty is defined in §13 but absent from the Task example. Acceptance Scenario 22 requires source A state, source B state, unified state, and a conflict indicator. D-014, D-026, D-027 require source-aware, correctable claims.

**Risk:** Correcting current-task association could overwrite the provenance of the task's Agent-reported status; a later source could overwrite the earlier status. The Core might retain file links yet lose what each source actually asserted.

**Required clarification:** Record provenance/confidence at the conclusion being asserted: status, certainty, weight, task association, current phase, and estimate as applicable. Reference source identity, source revision/event, and assertion time; retain the original assertion separately from the resolved view. Distinguish “observed that the Agent reported done” from “observed implementation success.” Define where plan certainty belongs before implementing the first model. This is a contract requirement, not a demand for a new package or a full reconciliation engine. **Gate: Phase 1 domain/event contract.**

### B-05 — BLOCKER — User corrections lack precedence and lifetime rules

**Evidence:** PRODUCT §19 says to modify state and “correct Timeline”; D-015 and ARCHITECTURE §19 say append correction events. Roadmap Phase 5 and Acceptance Scenarios 08/10 specify the immediate result but do not say what the next inferred update, new turn, plan removal, or replay does.

**Risk:** Automatic inference may immediately undo a correction. Rewriting old records may destroy provenance; indefinitely pinning a current task may create stale state. Restore/replay may produce a different result from live application.

**Required clarification:** Specify correction target and scope, effective time, superseded assertion, duration, precedence over inference, and conditions under which a new explicit source assertion may supersede it. Keep historical observations and append corrective interpretation; distinguish corrected Timeline presentation from deletion of history. Weight corrections and current-task corrections may have different lifetimes. Specify handling when a corrected task disappears. **Gate: Phase 1 must preserve correction references; behavior policy must be settled before Phase 5.**

### S-03 — SHOULD FIX — Plan identity and hierarchy reconstruction are underspecified

**Evidence:** ARCHITECTURE §§12–14 require diffs; Tasks have IDs, but no identity/matching policy. Acceptance Scenario 03 assumes a nested Phase/Task plan. There is no evidence that each Codex entry has stable IDs or nested phases.

**Risk:** Rename/reorder becomes remove/add, resetting completion, weight, or corrections. A flat source plan could force invented “observed” phases into Core.

**Recommendation:** Adapter owns protocol parsing; Core owns comparison of normalized plan revisions. Preserve source IDs where available; document fallback matching and ambiguous changes. Define a conservative flat-plan representation within Project/Phase/Task, marking any grouping as inferred. Do not infer deletion from an incomplete snapshot. Separate source certainty from task work status.

### S-04 — SHOULD FIX — Event responsibilities and reliability are incomplete

**Evidence:** ARCHITECTURE §§9–10 use `payload: unknown` and mix incoming activities with derived `progress.changed`, task events, and `timeline.annotation`. §2.3 uses different event names from §10. No event contract specifies duplicate delivery, ordering, reconnects, errors, or schema evolution.

**Risk:** Codex payloads leak through `unknown`; adapters start calculating progress; derived events feed back into the input bus and duplicate Timeline/progress entries.

**Recommendation:** Define a small validated event vocabulary, schema version, source event identity, source/received times, and causal references. Separate observations, user corrections, and Core-derived changes with explicit ownership. Specify idempotency, source ordering, late/malformed events, and reconnect replay for a single-session initial product. A synchronous in-process dispatcher is sufficient; no distributed bus or message queue is needed.

### S-05 — SHOULD FIX — Persistence recovery has no consistency contract

**Evidence:** Roadmap Phase 2 stores events, state, plan snapshots, Timeline and corrections before later engines exist; Acceptance Scenario 23 demands restoration. Neither Storage section identifies authoritative records versus derived views or transaction boundaries.

**Risk:** A crash could persist a changed plan without its matching progress explanation or correction history; replay could duplicate derived events. A schema designed before certainty/corrections are clarified will need immediate migration.

**Recommendation:** Decide whether events, snapshots, or a defined combination is authoritative. Specify atomic updates, durable cursors, schema version/migrations, and deterministic restoration. Phase 2 implements only persistence of Phase 1 contracts; later phases extend it incrementally. Defer multi-process architecture, but choose initial single-writer ownership and behavior when another extension window opens the same project.

### S-06 — SHOULD FIX — Project identity risks filesystem/IDE coupling

**Evidence:** ARCHITECTURE §5 uses `rootPath: string`; PRODUCT §33 says Local Plugin Storage; UX §29 permits current-workspace-only v0.1. The documents do not define project/session matching or relocation semantics.

**Recommendation:** Keep Project identity independent of a VS Code workspace object and Codex thread ID. Host/Adapter supplies root/location metadata and matching evidence. Specify the v0.1 single-root boundary, path normalization, session association, and moved/renamed project behavior. Decide how symlinks, Windows case differences, worktrees, and multi-root workspaces are handled or explicitly unsupported. Do not claim arbitrary URI or remote support from a string path alone.

### S-07 — SHOULD FIX — Aggregate phase state and progress edge cases are undefined

**Evidence:** ARCHITECTURE §§5/15 contain both Phase and Task weights; the formula uses task weights only. Roadmap Phase 4 asks for Phase weight calculation. Acceptance Scenario 05 requires automatic phase switching, and Scenario 20 forbids fabricated progress without a confirmed plan.

**Recommendation:** Clarify whether Phase weight is a derived sum or an independent multiplier; avoid counting both unintentionally. Define included completion statuses, zero confirmed weight/unavailable progress, positive finite weight validation, rounding, removed/cancelled/reopened tasks, and reasons for non-expansion regressions. Specify current-phase derivation from explicit/likely/corrected task, including unknown or ambiguous current work. An absent plan is not “0% complete.”

### S-08 — SHOULD FIX — Confidence is overloaded and potentially misleading

**Evidence:** ARCHITECTURE §8 normalizes an additive rule score to 0–100%; Task has one `confidence`. UX Overview places a single confidence next to both inferred current task and its estimate. D-027 requires visible inference confidence.

**Recommendation:** Separate task-association confidence from estimate confidence and completion provenance. Explain that an uncalibrated rule score is a heuristic, not a measured probability of correctness. Specify unavailable/ambiguous/stale states, rule evidence, and a threshold policy. UX §30's “Show confidence” setting must not remove all uncertainty disclosure for inferred results; this would conflict with UX §43 and D-027.

### S-09 — SHOULD FIX — Raw capture can defeat the storage privacy boundary

**Evidence:** ARCHITECTURE §22 allows all raw events to be retained, while TECH_STACK §10 prohibits default complete-source storage. `agent.message` and command/edit payloads may contain source, secrets, or private prompts even without a dedicated source-code table.

**Recommendation:** Specify an allowlist of persisted fields, redaction, bounded raw retention, and diagnostic export behavior before Phase 2/real capture. Store references or minimal evidence rather than complete raw tool outputs by default. Document what is retained and where. “Local” does not automatically mean privacy-preserving. Never treat a transport envelope as safe for storage merely because it is normalized.

These risks can be addressed within the accepted boundaries. They do not justify a generic event-sourcing platform, an orchestration service, or additional Agent packages during Phase 1.

## 5. Unvalidated Assumptions

Classification describes the next action, not proof of feasibility. “Safe to proceed” means safe for controlled Core work without relying on the assumption externally. All research and spikes below remain unexecuted.

| Assumption | Repository evidence / concern | Classification | Finding / gate |
| --- | --- | --- | --- |
| A deterministic Core can consume normalized fixtures independently of Agent and IDE | Accepted D-006–D-008; no runtime dependency is required for the domain rules | safe to proceed | Phase 1 after contract blockers are resolved; actual independence must later be tested |
| Codex Plugin can listen to lifecycle, plans, sessions and messages without Agent participation | PRODUCT §29 and ARCHITECTURE §25 assert roles without protocol/API evidence | requires documentation research | B-06; before selecting integration path |
| An app-server client can observe sessions started in the desktop app, IDE extension, or CLI | Existing-process attachment is not established by `initialize` or `thread/start` examples | requires a Spike | B-06; before Phase 7 production integration |
| Session/thread/turn events identify the active project and reliably distinguish Active/Idle/Finished/Disconnected | UX §28 promises states; no discovery/mapping contract exists | requires a Spike | B-06, S-06; integration feasibility gate |
| Formal plans and all revisions/completion reports are exposed as events | Scenario 03 expects hierarchy/certainty; structured payload, history, and coverage are unknown | requires a Spike | B-06, S-03; actual real-plan fixtures required |
| app-server delivers individual Read/Edit/Command/Test events and independently observed results | Roadmap Phase 8 and Activity mockups assume granularity; command output is not necessarily structured evidence | requires documentation research | B-06, S-02; then verify experimentally |
| Old app-server research remains reusable | PRODUCT §30 and ARCHITECTURE §26 refer to experiments absent from this checkout | requires documentation research | S-02; identify artifact location and version; do not claim retained experiments were tested |
| v0.1 should include functioning estimates rather than only reserve their distinct representation | Acceptance and Roadmap disagree | requires explicit user decision | B-01; before roadmap baseline approval |
| Agent-reported COMPLETED contributes to “Confirmed” progress | Formula says completed weight; D-016 says reported completion is not verification | requires explicit user decision | S-07; before Phase 4; clarify label/explanation without silently changing formula |
| Initial weights can be estimated without requiring optional semantic analysis | D-010 says AI initial estimate, D-019 says Core fully works with analysis disabled | requires explicit user decision | S-15; before Phase 4 |
| Node.js 24 development runtime equals the VS Code extension runtime | No host/version/ABI compatibility evidence | requires a Spike | S-10; before Phase 2 driver commitment and Phase 10 shell |
| Selected SQLite driver can be shipped in VSIX for intended OS/architectures without a user compiler | TECH_STACK §11 correctly leaves driver open | requires a Spike | S-10; before Phase 2 concrete driver selection |
| TypeScript 7.x and pnpm 12.x are stable and compatible with selected test/build tools | TECH_STACK §2 states current status without versions, links, manifests, or lockfile | requires documentation research | S-11; before Phase 1 setup; acceptance of a stack is not availability evidence |
| ESM-first sources can yield a compatible extension artifact | TECH_STACK §18 makes output format conditional on host | requires a Spike | S-10; package/runtime smoke test |
| Windows/macOS/Linux and x64/ARM64 behave equivalently | Stack names these targets but no support matrix or verification exists | requires a Spike | S-10, S-06; staged platform evidence required |
| WSL, Remote SSH, containers and browser extension hosts are supported | Not explicitly scoped; local-first does not establish these modes | requires explicit user decision | S-10; define initial supported deployment modes |
| Model can retain source-specific claims while initially implementing only one source | D-026 and Scenario 22 permit separation of model capability and full reconciliation UI | safe to proceed | B-04, D-03; use controlled assertions, not speculative extra adapters |
| Returning users understand the Overview in five seconds | D-031 and Scenario 30 are experience goals, not verified measurements | requires a Spike | S-12; manual usability exercise before release |

### B-06 — BLOCKER — Passive Codex observation is an unproven feasibility dependency

**Evidence:** PRODUCT §§6/29/30, ARCHITECTURE §§24–26, Acceptance Scenarios 02/03 and §9 promise automatic observation. This checkout has neither integration fixtures nor experiments demonstrating access to an already-running user's session.

**Risk:** Starting an app-server and creating a new thread may prove only that Visualizer can host/control its own conversation. That does not establish observation of the existing workflow and could undermine D-001/D-024.

**Required resolution:** Research the supported read/subscribe/discovery interfaces and then demonstrate non-controlling observation for a named supported Codex surface/version. If passive observation is unavailable, report the limitation and obtain an explicit product decision; do not silently require a wrapper workflow, custom Agent task board, or second Agent session.

**Gate:** A documented feasible integration path is required before Phase 7 and before claiming v0.1 feasibility. Independent Phase 1 need not wait for a completed real integration Spike, provided its contracts remain Agent-neutral and the risk is explicitly tracked. The assumption cannot be marked “safe” based on old prose.

### S-10 — SHOULD FIX — Runtime, SQLite, and deployment compatibility need one matrix

**Evidence:** D-032 accepts Node.js 24; TECH_STACK §11 acknowledges native ABI/VSIX issues; §18 leaves extension output conditional. No minimum VS Code version, host runtime, support modes, or verified binaries are specified.

**Recommendation:** Distinguish development Node from target Extension Host runtime. Test the actual host before choosing `node:sqlite` or a native driver. Name initial OS/architecture targets and what remains unverified; never imply full cross-platform support from one local Windows result. Keep VS Code-specific storage location discovery in the host and pass the location to Storage.

### S-11 — SHOULD FIX — Accepted version labels need dated availability evidence

**Evidence:** TECH_STACK §2/§24 locks major versions and asserts stability; D-032 accepts the stack, but this repository has no pinned toolchain, compatibility matrix, or research links.

**Recommendation:** Research official release and compatibility documentation before setup; record compiler/package identity and exact validated versions. If an accepted major cannot be used, request an explicit revision/superseding decision rather than silently falling back. This review makes no claim that those future/current major versions are available or unavailable.

### S-15 — SHOULD FIX — Initial weighting must work with semantic analysis disabled

**Evidence:** PRODUCT §13 and D-010 specify AI initial estimates; Scenario 09 rejects permanent all-one weights. D-019 and Scenario 25 require a fully functional Core with semantic analysis off. Roadmap Phase 4 specifies weight calculation but no initialization source.

**Recommendation:** Decide a documented source order, such as explicit source weights followed by a conservative deterministic heuristic and user adjustment. If AI weighting is retained, identify whether it is Agent-reported input or an optional Visualizer model call and how the disabled path behaves. Record weight provenance and uncertainty. Do not assume English task titles alone provide trustworthy complexity ratios or force an LLM into Core.

## 6. Required Spikes

These are **recommendations for later authorized work**, not experiments performed during this review. A failure must report evidence and the unresolved decision; it must not trigger unapproved feature expansion.

| Spike | Timing | Minimum experiment | Pass evidence / failure action |
| --- | --- | --- | --- |
| SP-01 — Passive Codex session and plan observation | Research before freezing integration promises; complete before Phase 7 | For the chosen CLI/IDE/app scope, start Codex normally outside Visualizer; observe session, project association, formal plan, update, completion, and disconnect without sending work instructions | Versioned protocol references and redacted event fixtures showing actual delivery; distinguish attached sessions from newly created threads. If impossible, escalate B-06 for product decision |
| SP-02 — Event coverage and normalization | After SP-01, before Phase 8 integration | Capture representative read/edit/command/test activity, empty/no-plan cases, reconnects and repeated events; map only supplied semantics | Availability/capability table, source IDs, sample payloads, explicit missing fields and dedup/replay behavior. Do not infer verification from a tool named “test” |
| SP-03 — SQLite VSIX runtime and packaging | Before Phase 2 concrete driver commitment | Compare candidates in the intended extension runtime; bundle/package, install, write/read, close/reopen; exercise paths outside the repo | Actual VSIX/runtime evidence for claimed targets, native/ABI requirements, migration/storage smoke result, no end-user compilation/download requirement unless explicitly accepted |
| SP-04 — Minimal VS Code host composition | Before Phase 10 implementation, coordinated with SP-03 | A disposable host smoke experiment: load a fixture-driven Core, locate app storage, deliver a correction, reload, and check extension activation/cleanup | Host version, ESM/bundle output compatibility, activation/lifecycle and storage location evidence. No business logic moves into the UI |
| SP-05 — Plan identity and inference fixtures | Before Phase 3/9 behavior is finalized | Replay flat/nested plans, renamed/reordered/removed tasks, ambiguous activity, corrected association, and new turn | Stable history/weights/corrections or explicit ambiguity; reproducible rule score evidence, no invented certainty or percentage |
| SP-06 — v0.1 Magic Moment usability | Before Phase 11 release | A user sees a real observed completion and plan expansion after a ten-minute interval, including the progress explanation | User can identify current state and cause in approximately five seconds without consulting Chat/Terminal/Diff; record observed usability result separately from automated tests |

Documentation research preceding SP-01/SP-02 must cover supported Codex Plugin capabilities, app-server protocol/version, subscription scope, session discovery, plan events and access permissions. SP-03/SP-04 research must cover VS Code host/runtime/packaging and candidate-driver compatibility. S-11 requires official toolchain release research. No dependency download is authorized by this report.

## 7. Roadmap Review

**Yes: Phase 1 should begin with an independent Project Core.** Real integration uncertainty does not justify making Codex protocol types or VS Code objects the domain model. Controlled normalized fixtures are the appropriate initial validation input. The roadmap's domain → persistence → plan/progress/correction/Timeline → Adapter → Surface direction is sound once the following gates are clarified.

### S-02 — SHOULD FIX — Integration feasibility research is too late

**Evidence:** Phase 7 relies on plans/sessions; app-server research is Phase 8. Phase 0 already asks for unverified Codex assumptions and old research conclusions, but supplies no evidence.

**Recommendation:** Separate early feasibility/documentation research from later production app-server integration. Obtain enough evidence to avoid six phases of assumptions about unavailable signals; retain Phase 8 for activity normalization/integration. Preserve Core-first implementation order and do not turn research into a production adapter during Phase 0.

### S-12 — SHOULD FIX — Phase gates confuse component checks with whole-product acceptance

**Evidence:** Acceptance §10 requires Phase 4 to pass Scenario 11's live Overview update and Scenario 12's two-number UI before UI Phase 10 and estimate Phase 13. Phase 12 schedules Why X%, empty state, first-install experience and five-second comprehension improvements after Scenario 15/29/30 already require them for v0.1.

**Recommendation:** Define component-level fixture checks at each phase, integration checks when the relevant components exist, and full scenario checks at release. Baseline Why X%, provenance, uncertainty, no-plan/empty states and correction flow belong in the Phase 10/11 gate. Phase 12 can refine them; it cannot be their first implementation. Record pending end-to-end checks rather than passing them from Core unit tests.

| Roadmap segment | Review result / proposed clarification |
| --- | --- |
| Phase 0 | Complete review, resolve spec blockers and record external feasibility gates. Do not mark missing experiments as passed |
| Phase 1 | Core only; define neutral contracts and preserve provenance/correction history. No driver, Agent, IDE, or LLM imports |
| Phase 2 | Persist current contracts incrementally after runtime/driver Spike; avoid final schemas for unimplemented engines |
| Phase 3 | Deterministic normalized plan handling and identity-aware snapshots/diffs; no requirement for arbitrary natural-language understanding |
| Phase 4 | Exact weighted calculation and explanation fixtures; resolve completion/weight policy and B-01 estimate timing |
| Phases 5–6 | Correction semantics and Timeline projections; contract references can exist in Phase 1 without implementing these engines early |
| Phases 7–8 | Implement the proven supported observation path; capability-limited activity, not promised universal monitoring |
| Phase 9 | Rule-based current-task association and confidence; this is not automatically a task-progress estimator |
| Phases 10–11 | Complete baseline usable UX and real-session end-to-end gates; resolve all mandatory trust failures before release |
| Phases 12–20 | Refinement and explicitly scheduled enhancements; estimate placement requires B-01 decision |

No phase is started by this report. Recommendations to move gates or release requirements are explicit proposals requiring specification correction first.

## 8. v0.1 Acceptance Review

The 30 scenarios can form a useful acceptance suite, but the current roadmap cannot satisfy every mandatory requirement at Phase 11 without corrections. The following maps **all 15 P0 items** to existing phases. Phase numbers refer to the current roadmap, not an approved reordered plan.

| P0 | Capability / detailed scenarios | Required phases | Consistency / finding |
| --- | --- | --- | --- |
| 01 | Project recognition (01) | 1, 10 | Host identification/composition is implicit; scope single-root identity (S-06) |
| 02 | Codex Session (02) | 7, possibly 8, 10 | Depends on unverified observation path (B-06) |
| 03 | Automatic Plan (03) | 3, 7, possibly 8, 10 | Requires actual formal-plan events and supported hierarchy mapping (B-06, S-03) |
| 04 | Phase/Task creation (03) | 1, 3, 7, 10 | Source identity/certainty must survive normalization (B-04, S-03) |
| 05 | Current Phase (05) | 1, 3, 9, 10 | Aggregate/current-phase rule absent (S-07) |
| 06 | Current Task + Confidence (06–07) | 5, 9, 10 | Rule score and uncertainty disclosure are essential (B-02, S-08) |
| 07 | Confirmed Progress (09, 11, 20) | 3, 4, 10 | Completion eligibility, weights, unavailable state need definition (S-07, S-15) |
| 08 | Estimated/Confirmed separation (12) | 4, 10, **13** | **Scheduled after release: B-01** |
| 09 | Plan Expansion (13–14) | 2, 3, 7, 10 | Feasible once stable identity and complete revisions are available |
| 10 | Progress Regression (13) | 3, 4, 6, 10 | Preserve cause and historical plan revision; fixture arithmetic required |
| 11 | Why X%? (15) | 4, 10; listed in **12** refinement | Minimum explanation UI must exist before release (S-12) |
| 12 | Timeline (18–19) | 2, 6, 7–8, 10 | Core event history feasible; test-failure wording must reflect actual captured evidence |
| 13 | User Correction (08, 10) | 2, 5, 9, 10 | Durable precedence missing; weight editing conflicts with P1 designation (B-02, B-05) |
| 14 | State Persistence (23) | 2 plus schema updates in 3–9 and host 10 | Restart consistency and source/correction history required (S-05) |
| 15 | Magic Moment (29–30) | 3–11, manual acceptance; refinement **12** | Must already work at release; no need for Phase 15 semantic rolling summary (S-12) |

Remaining scenarios: 04/20 are mandatory anti-fabrication invariants; 16/17 require truthful reported-completion representation, **not** a Phase 14 verification engine. 21/22 require provenance/source-state capacity but defer full multi-source ingestion/UI. 24–26 are mandatory default privacy/no-pollution/semantic-off invariants. 27 explicitly permits shipping without semantic features. 28 is an advanced Activity capability and may be P1 after an explicit priority clarification; unsupported event granularity must be disclosed.

Scenario 19's suggested “Test failed” needs observed or Agent-reported evidence and a reliable distinction between those sources. It must not pull the full Verification Foundation into v0.1. Scenario 30 requires a meaningful recent-event view; it does not require an LLM rolling summary or advanced last-viewed aggregation.

### Acceptance fixture precision (part of S-12)

The illustrated `68% → 64%` values lack exact initial weights in Scenario 13/30. UX §7 has completed weight 32, total 50, and newly added weights 3+2: if completed weight stays 32, the previous denominator was 45, so previous progress was approximately **71.1%**, not 68%. This is an illustrative-data inconsistency, not a reason to change the weighted formula.

Replace illustrative percentages in executable fixtures with complete arithmetic inputs and a rounding rule. Specify whether JWT completion changes the numerator before expansion in Scenario 30. Give “real-time” a measurable observation/update bound, and define five-second comprehension as a manual usability criterion rather than a latency claim. Include reconnect, duplicate-event, correction-survival, no-plan and restart checks; these validate required behavior rather than introduce new product features.

## 9. Recommended Initial Repository Structure

**Before Phase 1, the existing documentation-only structure plus this report is sufficient.** No package scaffolding is required for Phase 0 approval.

```text
ai-project-visualizer/
├─ .gitignore
├─ AGENTS.md
├─ PRODUCT.md
├─ ARCHITECTURE.md
├─ ROADMAP.md
├─ DECISIONS.md
├─ PHASE_0_REVIEW.md
└─ docs/
   ├─ TECH_STACK.md
   ├─ UX.md
   ├─ COMPETITIVE.md
   └─ acceptance/
      └─ v0.1.md
```

When separately authorized to begin Phase 1, the minimum addition is the accepted pnpm workspace configuration and **one** Core package:

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json
pnpm-lock.yaml                 # produced by approved dependency setup
packages/
└─ core/
   ├─ package.json
   ├─ tsconfig.json
   ├─ src/                    # organize files as actual behavior appears
   └─ tests/                  # controlled normalized-event fixtures
```

Use only necessary compiler/test configuration. Do not pre-create every named engine directory. Storage, Codex Adapter, Extension, and disposable experiments appear when their corresponding phase/Spike is authorized. CLI, shared, semantic, analytics, cloud, verification-provider packages and multi-agent systems are unnecessary initially. This report creates none of them.

## 10. Required Documentation Corrections

This is a proposed edit list; all specification files remain unchanged in this task.

| Document | Required correction | Finding IDs / classification |
| --- | --- | --- |
| ROADMAP | Resolve estimate timing; move feasibility research ahead of dependent integration; distinguish component and release gates; baseline UX before release; align Phase 0 completion evidence | B-01 BLOCKER; S-02/S-12/S-14 SHOULD FIX |
| Acceptance | Resolve P0/P1 contradictions; make trust/privacy/no-fabrication hard gates; map each Scenario to component/integration/manual checks; fix arithmetic and observable timing | B-01/B-02 BLOCKER; S-12 SHOULD FIX |
| ARCHITECTURE | Clarify Storage port versus implementation; preserve conclusion-level assertions, certainty, provenance and corrections; specify event ownership, validation, ordering and identity; clarify weight/phase semantics | B-03/B-04/B-05 BLOCKER; S-03–S-08 SHOULD FIX |
| PRODUCT | Label integration capabilities as unverified pending evidence; clarify the meaning of confirmed completion, initial weighting and historical corrections without silently altering accepted scope | B-06/B-05 BLOCKER; S-07/S-15 SHOULD FIX |
| TECH_STACK | Label package tree by phase; record verified toolchain/runtime matrix; keep driver pending until Spike; clarify raw-data persistence boundary; correct competitive-document path | S-01/S-09/S-10/S-11/S-14 SHOULD FIX |
| UX | Align v0.1 versus future blocks, estimate decision, icons, visible uncertainty, retention policy, truthful unsupported/disconnected/no-plan states and minimum Why panel | B-01/B-02 BLOCKER; S-08/S-12/S-13/S-16 SHOULD FIX; D-01 CAN DEFER |
| DECISIONS | Preserve accepted principles; record explicit resolutions of release timing, completion/weight semantics and supported integration/deployment scope where decisions are needed; normalize statuses | B-01/B-06 BLOCKER; S-07/S-10/S-14/S-15 SHOULD FIX |
| AGENTS | Retain all core rules; clarify that conflicting accepted requirements must be reported before implementation and that roadmap component gates cannot pass future E2E checks | S-14 SHOULD FIX |
| COMPETITIVE | Preserve dated snapshot; provide identifiable primary references and separate inferred market conclusions from verified capability claims | D-04 CAN DEFER |

### D-04 — CAN DEFER — Competitive claims lack reproducible evidence

**Evidence:** COMPETITIVE has a 2026-10-06 snapshot and capability matrix but no linked primary sources, exact project identities/versions, or research artifacts. §10 infers validated demand from the existence of tools.

**Disposition:** Future research/documentation task before public positioning claims. Tool existence is evidence of supply, not proof of user demand or of complete differentiation. Retain the product hypothesis and avoid implementing competitor-driven extras. This does not block independent Core work.

### D-05 — CAN DEFER — License selection is pending

**Evidence:** PRODUCT §36 and DECISIONS §7 leave MIT versus Apache-2.0 undecided although D-023 accepts an open-source tool.

**Disposition:** Explicit user decision before public distribution; does not block Phase 1 modeling. Do not silently choose a license or fill official identity/signature fields.

## 11. Phase 1 Readiness Checklist

### Must resolve before approving the Phase 1 specification

- [x] Read all nine specification documents and preserve accepted observer/privacy/independence principles.
- [x] Record contradictions, architectural gaps, deferred work, technical assumptions, and release dependencies without implementing them.
- [ ] Resolve B-01: v0.1 estimate presence/timing and consistent Phase 4 acceptance gate.
- [ ] Resolve B-02: mandatory trust/privacy gates and correction/weight-editing release priority.
- [ ] Resolve B-03: Core owns domain contracts; concrete Storage depends inward on Core.
- [ ] Resolve B-04: conclusion-level provenance/confidence, plan certainty and source-specific assertions survive normalization.
- [ ] Resolve B-05 at contract level: corrections preserve original assertions and have identifiable targets/scopes; settle full behavior before Phase 5.
- [ ] Record B-06 as an unresolved integration gate with a named research/Spike plan; do not freeze a Codex-specific domain contract or claim real-session support.
- [ ] Resolve Phase 1-affecting SHOULD FIX items: minimal package timing, normalized-event identity/ownership, project/session identity, unavailable state, and component-level acceptance scope.
- [ ] Verify the accepted toolchain versions through official documentation before workspace initialization; request an explicit revision if needed (S-11).

### Conditions for subsequent technical phases

- [ ] Before Phase 2: complete driver/runtime compatibility Spike; define atomic recovery, migration, storage location and initial data/retention policy (S-05/S-09/S-10/S-16).
- [ ] Before Phases 3–4: settle plan identity, aggregate weights/statuses, completion eligibility and semantic-off weight initialization (S-03/S-07/S-15).
- [ ] Before Phase 5/9: specify correction precedence/lifetime and explainable rule confidence (B-05/S-08).
- [ ] Before Phase 7: pass passive real-session observation gate for the explicitly supported Codex workflow (B-06/SP-01).
- [ ] Before Phase 11: pass the corrected full v0.1 matrix, restart/privacy/trust invariants, and manual Magic Moment; distinguish fixture success from live integration acceptance.

**Stop point:** Phase 0 review is complete. Its findings remain open. No specification decision has been silently superseded, no production code has been created, and Phase 1 has not begun.


## 12. Specification Remediation Follow-up — 2026-10-07

本节仅追加修订追踪。§1–11 原始发现及其严重性/数量保持原样，是审查时的历史基线；不把历史问题正文改成已通过。用户批准的是本轮规格修订和独立 Spike 方案编制，未授权实验、初始化或 Phase 1 实现。

### Status vocabulary

- **Specification Resolved**：冲突/契约已在文档中明确，新增决策 D-034–D-038 有用户批准依据。不是代码已实现或技术测试通过。
- **Technical Verification Pending**：运行时、协议、数据、算法、打包或验收还没有实际证据。
- **Partially Remediated / Decision Pending**：Phase 1 契约/门槛已澄清，但后续具体政策/设计仍未决定，不能假装全部关闭。
- **Deferred**：保留后续项，本轮不实现。

### BLOCKER disposition

| Finding | Specification status | 修订位置/结果 | Technical status / remaining gate |
| --- | --- | --- | --- |
| B-01 | Specification Resolved | D-034；PRODUCT §7/13–15/41；ROADMAP Phase4/10–13；UX §4–7/11/36/38–41；Acceptance12A/12B、§6/10 | v0.1 无 numeric Task estimate；Phase13 Deferred / Not implemented；Current Task Confidence 仍保留 |
| B-02 | Specification Resolved | D-035；Acceptance §6/7/9 Mandatory Trust/Privacy；ROADMAP Phase11；UX §30/39 | 所有发布信任/隐私/状态检查 Technical Verification Pending；Task Weight 编辑为 v0.1 必须项 |
| B-03 | Specification Resolved | D-036；ARCHITECTURE §2.1/3/20；TECH_STACK §6.1/8/21 | Core 无 SQLite/Codex/vscode 依赖，Storage→Core；实际代码依赖/驱动/宿主测试 Pending |
| B-04 | Specification Resolved | D-036；ARCHITECTURE §5–10；PRODUCT §18；Acceptance21/22/Phase1 checks | 结论级 assertion/provenance/confidence 与原断言保留；contract/model behavior tests Pending |
| B-05 | Specification Resolved | D-037；ARCHITECTURE §19；PRODUCT §19；UX §13/28；Acceptance08/10/23 | 普通活动/新 Turn 不覆盖；有效范围及显式失效记录；实现/恢复/真实边界信号 Pending |
| B-06 | Specification Resolved **for gate/plan only** | D-038；PRODUCT29/30；ARCHITECTURE24–26；ROADMAP Phase0/7/8；docs/spikes/codex-observation-feasibility.md | **Unverified / Technical Verification Pending**。被动观察可行性 BLOCKER 未技术关闭；Phase7 前须真实证据/支持范围审核 |

没有任何 BLOCKER 被标为 Technical PASS。B-01–B-05 的规格矛盾已解决；B-06 的验证要求已明确，但能力仍未知。整个 remediation 输出等待用户审核，不自动进入 Phase 1。

### SHOULD FIX disposition

| Finding | 本轮状态 | 已处理 / 保留门槛 |
| --- | --- | --- |
| S-01 | Specification Resolved | ARCHITECTURE4、TECH_STACK5/22、ROADMAP1：Phase1 only Core；不预建空包 |
| S-02 | Specification Resolved; Technical Verification Pending | 早期独立 Spike 与 Phase8 活动集成分离；未执行研究/实验 |
| S-03 | Specification Resolved at Phase1 contract; matching validation Pending | 稳定内/外身份、revision/completeness、平面分组推断标记；Phase3 定义/验证缺ID匹配算法 |
| S-04 | Specification Resolved; Technical Verification Pending | validated type payload、输入/纠正/派生所有权、身份/时间/顺序/幂等；真实 source cursor/ordering 待验证 |
| S-05 | Partially Remediated | 来源/纠正为恢复依据、投影/原子cursor边界明确；Phase2 最小 snapshot/schema/migration、多窗口 writer 方案与 crash验证待定 |
| S-06 | Partially Remediated | Project/Session/Task neutral identity、未知归属不猜测已明确；具体路径匹配、移动/单根多根/Remote/平台支持范围在 Host/Spike 前决定验证 |
| S-07 | Specification Resolved; behavior tests Pending | completed/verified依据资格、Phase汇总非乘数、缺权重unavailable、移除/重开/原因与展示舍入规则 |
| S-08 | Specification Resolved; calibration/rule validation Pending | association与estimate confidence分开；heuristic非概率；unknown/ambiguous/stale与人工来源；Phase9具体规则/阈值待fixture |
| S-09 | Specification Resolved at privacy boundary; Technical Verification Pending | allowlist最小依据、raw瞬时解析不默认持久化；真实日志/数据库privacy检查及Phase2细化待完成 |
| S-10 | Technical Verification Pending | 开发Node与Extension Host区分；driver/VSIX/runtime/platform matrix和支持范围未验证 |
| S-11 | Technical Verification Pending | 保留已接受选型目标，撤去无依据“当前稳定”断言；初始化前官方版本/工具兼容性研究仍未执行 |
| S-12 | Specification Resolved at phase/acceptance mapping; measurement Pending | Component/Integration/Live E2E/Manual分开；baseline UX在Phase10/11；Scenario10/13/15/30算术明确；latency budget在对应验收方案定义实测 |
| S-13 | Specification Resolved; UI acceptance Pending | Task/Phase ✓仅verified，◐reported complete；Session结束另标，不混淆任务验证 |
| S-14 | Specification Resolved for edited documents | ROADMAP Phase0真实文档状态；历史编制过程明确非技术PASS；DECISIONS Proposed与技术Pending分开；TECH_STACK路径修正。AGENTS/COMPETITIVE仅复核未改 |
| S-15 | Partially Remediated / Decision Pending | weight来源/人工编辑与semantic-off契约明确；无来源权重的默认算法在Phase4前另行批准/验证；本轮不发明估算器 |
| S-16 | Partially Remediated / Decision Pending | 删除无限raw保留/默认7天有效设置承诺；默认raw不持久化；必要持久依据的具体bounded retention期限在Phase2/采集前决定验证 |

### CAN DEFER disposition

D-01–D-05 均 Deferred。未来 UI/provider frameworks/完整多源reconciliation/竞品来源研究/License 不作为 Phase1 package 实现内容。License 仍需公开分发前用户决策；竞品快照未重新做外部核验。

### Nine-document consistency recheck

| Specification | 本轮复核结果 |
| --- | --- |
| AGENTS.md | 未修改；Observer/Local-first/Core independence/provenance/correction/不自动跳阶段与修订一致 |
| PRODUCT.md | v0.1与v1/Phase13分开；完成资格与来源/纠正政策对齐D-034–D-038 |
| ARCHITECTURE.md | 依赖图/模型/事件/Storage责任对齐；后续实现门槛明确 |
| ROADMAP.md | Core-first保留；Phase11无数值估算；baseline UX在发布前；早期Spike与Phase8分离 |
| DECISIONS.md | 原决策正文保留，新增D-034–D-038；旧首页/进度例由显式后续澄清限定版本，非静默覆盖 |
| docs/TECH_STACK.md | 包按阶段创建、版本/driver/Extension Host未验证；future tests明确Phase13 |
| docs/UX.md | v0.1无数值估算，关联Confidence/provenance/Why/纠正为baseline；future mockups标后续 |
| docs/acceptance/v0.1.md | P0-08/12A非混合，12B Phase13；信任硬门槛；fixture/E2E分离；未执行项Pending |
| docs/COMPETITIVE.md | 未修改；2026-10-06历史研究快照。§32四项v0.1体验不要求numeric estimate，与本轮范围一致；总体矩阵/双进度图为目标定位，§44仅文档准备阶段完成，不能用于证明monorepo/能力/Spike已实现或通过；外部事实仍D-04 Deferred |

ROADMAP / UX / Acceptance 的 v0.1 最低范围一致：Current Task + association Confidence/Provenance、Current Phase、Confirmed Project Progress + Why、Plan changes/history、meaningful Timeline、Correction/Weight editing、恢复及Mandatory Trust/Privacy。Activity advanced/P1；numeric estimates Phase13；完整verification、Semantic、Export、多Session、多源UI后续。

未发现上述已批准范围的剩余直接冲突；仍有显式后续决策和技术门槛，不将它们当作已验证。COMPETITIVE研究矩阵与历史决策例不是当前实现清单。

### Phase 1 readiness after remediation

- [x] v0.1发布范围、非混合与完成依据资格明确（D-034/035）。
- [x] Core/Storage/Adapter/Host/Surface编译依赖和责任明确（D-036）。
- [x] 结论级来源、身份、事件/纠正范围契约明确。
- [x] 人工纠正优先级/失效依据明确；不删除原历史（D-037）。
- [x] Phase1仅Core与受控fixture；组件验收不冒充真实集成。
- [x] Codex gate/独立方案已编制，能力仍Unverified（D-038）。
- [ ] 用户审核本轮实际文档修改；未自动放行Phase1。
- [ ] 初始化前研究并确认TypeScript/pnpm/Node与test/build工具版本兼容性（S-11）；不安装依赖来试探。
- [ ] 在独立授权任务尽早执行Codex正式接口研究/最小Spike，目标Phase1前取得证据；Phase7前必须通过获准范围门槛。
- [ ] Phase2前完成SQLite/实际宿主VSIX Spike、恢复/writer/privacy/retention设计验证。
- [ ] Phase3/4前完成缺ID匹配及无来源权重初始化政策；Phase9前验证confidence具体规则。

**Readiness:** Phase1 的主要规格契约已澄清，尚未完成启动前工具链验证和本轮审核；不宣称无条件Ready。独立Core不要求真实Codex依赖，但真实集成、跨平台、SQLite packaging和v0.1 E2E始终Technical Verification Pending。

**Stop:** 仅文档修订，未初始化Monorepo、安装依赖、实现模型/代码、执行Spike或开始Phase1。
