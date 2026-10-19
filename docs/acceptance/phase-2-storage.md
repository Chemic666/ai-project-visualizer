# Phase 2 Local Storage — Atomic Recovery / Privacy Acceptance Plan

**Status: Proposed; all executable cases below are NOT TESTED.** Date: 2026-10-08.
Design: [Phase 2.3](../storage/phase-2.3-design.md), D-042–D-044 Proposed.
This is a test protocol ready to implement after architecture approval, not an existing runner or a passing report. No guessed commands for nonexistent scripts are supplied.
Architecture follow-up keeps the original **25 S/P/M case IDs**, strengthens their subcases, and specifies O01 cross-process ownership subcases below. Direction acknowledgment is not design approval or executable evidence; D-041–D-044 remain Proposed.

## 1. Scope and executable harness requirements

A separately authorized disposable experiment must implement these cases against actual SQLite/better-sqlite3 13.0.3 and actual Core fixture outputs. It must not become packages/storage, reuse/modify archived Phase 2.2 evidence, run W1/W2/W3 again or require Codex/VS Code/network/LLM.

Runner contract:
- Generate fresh RunId and an owned temporary root outside the APV/source project repositories; every process/database/fixture/receipt belongs to that root.
- Validate Driver/native/runtime versions from execution. Use installed local dependencies only; missing/blocked tools yield NOT TESTED, not configuration/permission bypass.
- Build typed synthetic fixtures using existing Core contracts. Golden afterState comes from actual applyNormalizedEvent for event cases, trusted data fixtures for correction lifecycle/import cases. Fixture preservation does not claim a Correction Engine.
- Provide exact barriers: owner_acquired_before_recovery, before_epoch_commit, after_epoch_before_intake, after_begin, after_event, after_assertions, after_entity_versions, after_correction_versions, after_conclusion_versions, after_snapshot, after_checkpoint, after_head_update, before_commit, after_commit_before_ack, before_owner_release. Future plan/Timeline-output barriers apply only when their reviewed contracts exist, not fake Engines here.
- A child reports RunId/generation/operationId and parked barrier to its parent. Parent can inject an exception/SQLite constraint failure, or kill only its own still-owned child through its process handle after handshake. Never terminate by process name or kill a user Host. If ownership/kill/exit evidence is missing, case NOT TESTED.
- Restore/check from a **new independent process** after child exit. Same-process close/reopen is insufficient for crash cases. DB-path/generation/marker binding must match; a different PID alone is insufficient.
- Read SQL records, exact typed state/digests and checkpoint separately; do not ask only the write function whether it passed.
- Exception injection, owned process crash, actual disk/I/O faults, OS power loss and live Extension Host are separate result scopes. A mocked error label does not prove SQLITE_IOERR recovery.
- Run the proposed owner.sqlite lifetime lock on an actual distinct SQLite connection/file, using actual competing processes and project epoch checks. No JS Mutex, prefilled PID file, mocked lock result or same-process BUSY test counts as O01 proof. Every worker owns both connections on one serialized execution thread.
- Use an independent external **fixture ACK sink** after project COMMIT; record exact RunId/operation/unit acknowledged and inject crash before it. This proves the harness's boundary, not real Agent transport ACK/resume behavior. Source cursor codec/complete-unit oracles are explicitly synthetic; future Adapters must separately prove their real source semantics.
- Changes are limited to synthetic owned roots/copies. No permission changes, normal process cleanup, directory escape, raw source/prompt or global dependency installation.

Execution phases: prepare/version-proof → typed golden fixtures → transactional fault sweep → identity/replay → corruption/migration → privacy/retention/deletion/owner scope → independent evidence review. Implementing the harness requires separate authorization.

## 2. Fixture and oracle

Generation G1 belongs to Project PA with Phase PHA, Tasks TA/TB and Session SA / Source SRC-A. Project PB/G2 is separate. All ID strings are synthetic internal identities; no source/path becomes an internal ID.

Base fixture S0:
- Trusted Project/Phase/Task/Session hierarchy; no fabricated progress field.
- Separate initial status/certainty/weight assertions with explicit provenance/reference/time; positive finite weights.
- A visualizer_inferred current-task assertion with association rule/score/source basis and a separate user_confirmed correction assertion.
- Correction C1 active with explicit Project/Session scope and original/corrected assertion references.
- No unsupported plan reconciliation, Timeline generation, VERIFIED promotion or user-correction behavior.

Inputs: E1 task.status_reported(completed), actual stable source_event identity K1; E2 same source with another K2; two distinct events sharing a cursor position; a plan.detected complete input and a partial plan.updated input. Include an agent report of status=verified: its produced Assertion must remain agent_reported.

Golden full CoreState arrays/order and Source checkpoints are captured per commit. Canonical hashes are generated by the specified decoder/serialization, not handwritten as passing values. Correction end/supersession fixtures are explicitly trusted record images for persistence only.

Independently assert:
- H: contiguous ledgerSequence 1..head, prior/base links, complete operation receipts and resulting state digests; epoch-only control writes do not invent ledger commits.
- E/A/R: canonical applied event IDs and immutable Assertion/Correction/Conclusion/Entity version references.
- S: decoded snapshot/format/generation/snapshotWatermark matches its exact body/digest and source vector **at that cut**, possibly earlier than head.
- C: expected sourceCursor vector and exact covered canonical inputs/ledgerSequence; no cursor beyond the covered unit, no cursor-vs-event-ID substitution.
- Live state: only confirmed persisted cut is published; errors yield diagnostics, never empty successful CoreState.

For a failure at any pre-COMMIT boundary, expected H/E/A/R/S/C is **the old complete cut**. For successful COMMIT or a parked post-COMMIT kill, expected is **the new complete cut**. A mixed cut is FAIL regardless of process exit 0.

## 3. Atomicity / recovery cases

All are NOT TESTED; S01–S13 are proposed mandatory gates for the then-current contracts.

| ID | Action / actual observation | Required oracle |
| --- | --- | --- |
| S01 | Persist S0 + E1 in child, exit, restore from reader process | Exact afterState, provenance, correction refs and full acceptedEvents; same DB/G1; no invented defaults |
| S02 | Inject failure after each applicable pre-COMMIT barrier, including snapshot/cursor/head | Sweep all barriers; rollback leaves old complete cut, no new assertion/input/operation success or advanced cursor |
| S03 | Park before COMMIT, kill owned writer, launch reader | Writer execution and parked barrier evidenced; old complete cut; no claim of power-loss testing |
| S04 | Park after actual COMMIT before the independent fixture ACK, kill writer, acquire ownership in a new process, restore/retry same operation/stable source input | New complete cut and unchanged committed cursor; exactly one canonical input/effect; ACK the verified covered unit only after reconciliation. No claim of actual Agent transport exactly-once |
| S05 | Lose/throw post-COMMIT acknowledgment; reconcile old operationId under a new owner epoch, also after a later valid commit | Matching stable intent receipt confirms committed before original-base checks; old execution token is not reused. Publish current head, not retry's historical state. Absent receipt in healthy DB confirms not committed; unreadable DB remains unknown |
| S06 | Same internal ID with identical body, then same ID with changed status/project/body | First duplicate no new effect; second identity_conflict no overwrite/cursor advancement |
| S07 | Same stable SourceId/eventId with new internal ID/receivedAt, then conflicting payload/revision | Matching claim reuses canonical event/assertion; conflicting claim fails; alias is not added to acceptedEvents |
| S08 | Two different source events share one batch cursor; repeat cursor-only/no-identity input with a new internal ID; deliver a late event from a source without stable order | Distinct events not dropped; ledger order is local acceptance only. No stable identity permits declared repeat/at-least-once, not exactly-once; late input does not manufacture ordering/overwrite corrections |
| S09 | Interrupt a batch; propose cursor with missing coverage/mismatched prior position, cursor-only duplicate completion, stale replay position or no reliable source ordering | No crossed gap/backward cursor. Complete-unit proof is required for any advance; otherwise keep old/absent cursor and limit ACK. Checkpoint-only commit has contiguous ledgerSequence and unchanged Core state |
| S10 | Restore valid S at an earlier watermark with tail E2/E3; make no new snapshot at H; compare pinned replay and recorded versions | Rehydrate acceptedEvents through S, replay only tail, no future Assertion preload; exact H digest/cursor. Old cache retains its original watermark/vector; no relabeling |
| S11 | Corrupt/remove cache, mutate watermark/body/vector, or make snapshot format too old while authority remains valid | Supported lossless conversion or authority rebuild only; exact H with no re-inference. Cache-only mismatch is repairable; unknown authority/processor format still blocks |
| S12 | Remove/corrupt authority event/assertion/correction; gap/duplicate a commit sequence; advance authoritative cursor beyond covered events; give only older backup | unavailable for current restore, originals preserved. Never hide missing provenance/history behind a latest blob or mix old state/new cursor; explicitly labeled last-known is not successful recovery |
| S13 | Two actual fixture writers contend with same expected revision; hold a read transaction | One commit, one conflict; no lost update. Readers see all-old/all-new cut; bounded BUSY handling/WAL behavior recorded; does not claim production owner election |

Additional invariants in S01/S10/S11:
- Agent completion/verified reports remain agent_reported; no persisted evidence is upgraded to Observed/VERIFIED on restore.
- Current Task association/weight correction history and termination basis are preserved as fixture data. Restart never silently expires them.
- Complete/partial plan flags, source revisions and original plan history survive; no Plan Engine is performed.
- Absent conclusion remains absent; no todo/null/0/100% fallback.
- Replayed already committed IDs do not generate a new assertion. Real Timeline dedup is a later Phase 6 integration gate, not a fake table in this spike.

## 4. Privacy / retention / deletion cases

All are NOT TESTED. Use synthetic sentinels only.

| ID | Action / actual observation | Required oracle |
| --- | --- | --- |
| P01 | Add nested rawPrompt/sourceCode/toolOutput/env/argv and unsafe path/reference/title fields; oversize values; throw credential-bearing Error.message/stack/cause/SQL bindings at ingestion, duplicate conflict, restore, migration and deletion | Admission/safe diagnostic projection happens before every persistence/output sink. Sentinels absent from DB/WAL/SHM/journal/temp/backup/log/evidence/stdout/stderr. Whole unsafe input blocked, no cursor advancement; known sentinels are not a universal secrecy guarantee |
| P02 | Attempt an unapproved opaque credential URL/reference, masked identity/cursor, mismatched SourceId or cross-Project/G2 references | Reject unsupported format/namespace/ownership and unproved identity transformation; no merge or cross-store write |
| P03 | Supply repo-contained app root, symlink/reparse escape, UNC path or missing permissions on actual Windows fixtures | No writes in repo/escaped root; stop with sanitized reason. Real path/ownership checks required, not mocked string tests |
| P04 | Run safe capture/restore/migration with network disabled and inspect all produced files | Only allowlisted metadata under owned private root; no source/prompt output, repo pollution, API calls or raw logs; Core import remains host/storage independent |
| P05 | Hit Proposed logical/event/snapshot/physical limits, then inject SQLITE_FULL midway and at COMMIT; try checkpoint-only update with no capacity; move retention clock | Admission rejection or verified rollback/unknown-outcome reconciliation preserves all-old/all-new cut. No lost event followed by cursor/ACK advance; no authority compaction. Only already committed covered input may be re-ACKed without a new receipt |
| P06 | Repeat snapshot cleanup and successful/failed migration-backup retention | At most two complete caches; complete acceptedEvents remain. Successful backup TTL/one-copy policy applies; failed recovery preserves one backup and blocks further migration |
| P07 | Delete G1 while owner/readers exist; interrupt at pending, generation fence, partial deletion and before completion; include journal/temp/restore backup, foreign handle and full intent store | Same stable owner lock held through safe content removal/catalog completion; only project data handles close, owner marker retained. Missing ownership/permissions/space => pending/block. History is removed, not silently exported/archived elsewhere; no normal process terminated |
| P08 | Reopen the deleted project/stale G1 writer/cache/cursor; attempt old token and automatic reinitialization; explicitly resume G3; contend during deletion/resume | Retired generation cannot write/replay/serve as current. Disclosed root digest/store/owner marker survives; no recreation from missing DB. New generation/baseline only by explicit resume under same lock, PB/G2 untouched |

Deleting records/managed files is not forensic erasure. No power-loss, SSD sanitization or OS-backup deletion claim is made. On deletion tests, capture pause is APV's own intake only; no Agent session/control action is allowed.

## 5. Schema / migration cases

All are NOT TESTED; do not build production migration code to run them.

| ID | Action / actual observation | Required oracle |
| --- | --- | --- |
| M01 | Open foreign marker, unsupported newer schema/record/cursor codec/processor fingerprint and a missing active-bound store | Unavailable/read-only diagnostic, unchanged original file; no auto-init, downgrade, inference or Driver switch |
| M02 | Under Project ownership migrate synthetic v1→v2; exception sweep every DDL/data/version boundary, plus owned-process kill before/after COMMIT | Independent reader sees old supported schema/complete records or validated new cut, no mixed versions. Proven rollback may resume old cut; unknown/missing authority is unavailable, never reset. IDs/provenance/correction/ledger/cursor unchanged |
| M03 | Create SQLite API backup with outstanding WAL-era committed input; interrupt backup/restore | Valid backup includes its actual complete cut; main-file-only copying never accepted. Incomplete backup/restore blocks, original private material preserved |
| M04 | Inject permission/BUSY/FULL/IOERR paths; separately perform real owned filesystem faults when feasible | Bounded error handling and operation reconciliation; identify injected vs actual fault; rollback/durability only PASS with independent invariant evidence |

OS power-loss tests require a separately controlled machine/VM/storage setup; not performing them yields NOT TESTED. A deterministic truncation experiment or process kill is not relabeled power-loss evidence.

## 6. Owner / platform gates

**O01 — single-writer enforcement:** the unique **Proposed** recommendation is a separate stable SQLite owner file, held BEGIN IMMEDIATE transaction, plus project writerEpoch/ownerToken. See [design §6.1](../storage/phase-2.3-design.md). It is NOT TESTED and remains a release BLOCKER. S13 tests defensive data CAS separately; short project transactions alone are not ownership proof.

The [Ownership Spike pre-execution protocol](../spikes/sqlite-ownership-protocol.md) proposes OP01–OP10; no runner or experiment exists yet. It verifies only the cooperative lock/epoch/fixture-commit component. Final live-Owner guards apply to domain and epoch-control COMMIT. The stale-epoch interleaving counterexample and hidden lock-loss/file-replacement gap are explicit; passing this component cannot substitute for the full 25 cases or waive required safety scope.

2026-10-09 implementation update: the user separately authorized the [disposable harness](../../experiments/phase-2-sqlite-ownership-spike/README.md), which now exists. The previous paragraph describes its pre-execution design history; all real OP/O01 cases remain NOT TESTED and execution is not authorized. Pure JS/static preparation checks do not complete any of these 25 acceptance gates or change Decision status.

| O01 subcase | Required independent-process evidence / oracle (all NOT TESTED) |
| --- | --- |
| a: competing windows | Race first binding creation too: one catalog binding/store key/owner path wins. A holds actual owner transaction; B times out/conflicts and cannot write/ACK. B may read a consistent cut. Distinct owner connections and main DB identity are evidenced |
| b: normal release | A disables/drains/closes data writer before releasing owner lock; B acquires, restores then increments epoch. Saved A candidate rejected; no overlap/intake from two owners |
| c: crash/takeover | Kill only owned A at owner-acquired, before/after epoch and pre/post domain COMMIT barriers; B can take over only through successful lock acquisition/recovery/new epoch. Old/new complete cut and S04 ACK behavior hold |
| d: owner loss while process lives | Deliberately rollback/close only A's owner connection before data access and during an owned Project/epoch transaction; permanently disable A and guard/rollback before COMMIT. B may acquire Owner but must wait for Project rollback before fencing. Include separately labeled unsafe no-final-guard baseline; no automatic old-token reconnect or unproved hidden-loss guarantee |
| e: held lock / PID reuse | Suspend/park owned A while retaining lock; B's bounded attempt fails even if synthetic PID diagnostic is stale/reused/absent. No timeout takeover, process-name cleanup or process existence as authority |
| f: bad lock identity/permissions | Missing existing-bound owner DB, corrupt marker, alternate path/reparse/replacement attempt or unreadable access blocks ownership. Test owned copies; never delete a live lock to repair it |
| g: lifecycle / maintenance | Deletion, migration and explicit resume acquire the same binding lock; generation/token/base checks refuse stale work. Release anomalies remain blocked; no lock release before content removal |
| h: synchronous lifetime boundary | Attempt close/release interleaving with a parked candidate: the write section must finish/rollback before close, or candidate is canceled. Driver reports open/inTransaction on acquired owner connection; no helper/worker can close it independently. A JS Mutex without actual cross-process exclusion is FAIL |

Do not claim crash/PID reuse from a fictional process list: PID is non-authoritative, while original child handles/RunId establish harness ownership. Actual kernel PID reuse may be impractical to force; the controlled diagnostic-reuse subcase proves independence from PID, not observed OS recycling. Access/locking tests require real local Windows processes; unreachable tools/permission conditions are NOT TESTED. This is no authorization to run them.

**O02 — support restriction:** approvals must explicitly limit initial support to the proven local Windows x64 tuple or supply new platform evidence. Linux/macOS/ARM64/remote/web are NOT TESTED. A Windows ordinary-Node fault suite does not prove new Installed Extension Host persistence integration. The archived Host compatibility matrix is preserved; eventual production module/bundle/lifecycle verification is a distinct gate.

## 7. Evidence and PASS rules

Fresh evidence requires RunId/case ID, UTC execution time, source scope (fixture/ordinary Node/actual Windows process/Host), exact driver/SQLite/runtime/OS/arch, fixture/version fingerprints, fault/barrier and independent-reader observations. Keep original result/errors privately; public results are allowlisted derivatives, with original hashes and omitted-field disclosure.

All executed assertions must pass. FAIL dominates missing required checks; no internal execution/reader evidence means NOT TESTED rather than a false Driver PASS/FAIL. Each sweep records every boundary, including gaps/skips. A limitation is preserved at case and overall level.

Overall result fields must distinguish:
- designReviewed: false until user architecture approval;
- specificationAccepted: per D-042–D-044 explicit approval, never inferred from tests;
- atomicity/replay/privacy/retention/migration/ownership: each separate verification status;
- processCrash vs injectedError vs actualFilesystemFault vs powerLoss;
- ordinaryNode vs actualHost/production integration;
- decisionAccepted: false until separate D-041 approval.

This task executed none of these cases. The plan's existence is not a PASS. Production implementation must repeat relevant acceptance on actual Storage rather than promoting a disposable prototype to production.

## 8. Gate disposition and later integration

D-041 cannot become Accepted on the basis of this document alone. Required: resolve architecture wording/ownership decisions, approve policy proposals, execute mandatory planned gates with honest OS/runtime coverage and review remaining unsupported scope. Partial gate success is recorded separately; a BLOCKER or NOT TESTED required gate prevents acceptance.

Later phases add and retest their real contracts:
- Phase 3: plan revision/diff and stable hierarchy recovery.
- Phase 4: progress explanation and completion-eligibility records.
- Phase 5: actual correction precedence/expiry and its atomic persisted changes.
- Phase 6: meaningful Timeline references and dedup under replay.
- Phase 10/11: actual App restart/privacy E2E on the supported Host.

Those items do not justify implementing future Engines or pretending full v0.1 Scenario 23 is satisfied by current Core fixture preservation.

## 9. Follow-up coverage of the original 25 cases

| Requested risk | Existing case/subcase coverage | Required execution scope |
| --- | --- | --- |
| Cross-process competition, stale Writer, crash takeover/release anomalies | S13 + O01 a–h | Actual separate local processes and separate owner/data connections; mock injection alone insufficient |
| COMMIT before external ACK crash | S04/S05 + O01 c | Owned writer kill + fresh reader + independent fixture ACK sink; actual Agent ACK/resume remains separately NOT TESTED |
| Snapshot/watermark/cursor mismatch and old snapshot | S09–S12 | Owned corrupted fixture copies + independently read authority; crash/restart variants need fresh process |
| Missing/noncontinuous ledger, duplicate/conflicting/late inputs | S06–S12 | Real SQLite fixture injection, pinned Core outputs and fresh restore; no stable identity explicitly degrades |
| Quota admission and disk full during faults | P05 + S02/S05/M04 | Deterministic rejection/exception sweep first; actual filesystem FULL/IOERR separately controlled or NOT TESTED |
| Delete/reopen/old cursor and token | P07/P08 + O01 g | Actual Windows handles/files + interrupted owned processes; no inherited user process cleanup |
| Migration interruption and failed rollback | M01–M04 | Transactional SQLite sweep + process kill + independent version/provenance/cursor checks |
| Unsafe fields reaching DB or any log/error sink | P01–P04 | Synthetic sentinel injection and inspection of all owned DB/sidecar/temp/backup/output artifacts, including failure paths |
| Retained evidence/history vs cache cleanup/compression | P06/P07 + S10–S12 | Synthetic clock/snapshot fixtures; exact complete ledger/reference restoration; no authority pruning |

The original 13 S + 8 P + 4 M = **25** cases remain, with strengthened actions/oracles; O01 has eight explicit subcases, O02 keeps scope restrictions. Nothing has run: **all executable cases/subcases are NOT TESTED**. Disposable fixture cases are implementable after approval; whole-machine power loss, forensic erase, real kernel PID reuse, actual Agent cursor/ACK capabilities, cross-platform and production Host integration are not proven by that runner and stay separately pending. Real Plan/Correction/Timeline Engines remain later-phase gates.
