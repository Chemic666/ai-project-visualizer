# Phase 2.3 — Recovery / Unknown COMMIT Disposable Harness

**Public-safe publication copy (2026-10-19).** The original private preparation document bytes are retained separately. Original SHA256: `b4453c639bae1a2d8c19d907f34d65758ea9dfbe7f33fe9bae33f9498e546600`. Machine prefixes below use `%APV_REPO%` (repository root), `%LOCALAPPDATA%` (original account's local app-data root), `%ProgramFiles%` and `%APV_CLANG_EXE%` (the recorded Clang executable), where applicable. These are publication aliases, not literal historical command bytes or newly observed paths. RunIds, build/binary fingerprints, results and limitations are unchanged. This copy is not a new execution authorization.

**Preparation only. Every real U/R scenario: NOT TESTED. Execution is NOT authorized.**
Production Storage is not implemented. D-041–D-044 remain Proposed; the complete 13 S / 8 P / 4 M production cases remain NOT TESTED. Compatibility, Ownership and Atomicity Spikes remain CLOSED — PASS WITH LIMITATION. Nothing here reruns, edits or replaces their tools or evidence.

## 1. Specification disposition and reuse

[ARCHITECTURE §9](../../ARCHITECTURE.md#9-normalized-event-model) now permits absent sourceIdentity, requires sourceEventId only in source_event, and separates internal EventId from source consumption position. Its identity-specific preparation blocker is resolved. This does not validate persistence, repeat handling, Cursor coverage or recovery.

This directory independently copies reference-fixtures.ts, reference-db.cjs, checks.cjs and reference-oracle.cjs from the closed Atomicity preparation, with origin hashes in reference-provenance.json. It calls only these **new local copies**, not the historical Runner/Worker. SQL staging remains deliberately limited to one stable SRC-A/K1 input in PA/G1. The original correction supersession is a trusted manual record-image fixture, not a Correction Engine. Core imports use the current unchanged packages/core API.

Controlling contracts: [Storage design §§4–8](../../docs/storage/phase-2.3-design.md), [failure contract F07/F08/F11/F12](../../docs/storage/phase-2.3-support-and-failure-contract.md), and [production Acceptance](../../docs/acceptance/phase-2-storage.md). PREPARATION.md records the implementation plan and scope rulings.

## 2. Prepared scenarios and honest scope

| Scenario | Prepared schedule / independent decision                                                                                                                                                                                                                                                                                                                                                                                 | Real status                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| U1       | Real PK constraint at after_assertions while Project transaction is active → record error-time inTransaction → explicit ROLLBACK and data-connection close while retaining Owner → independent Reader compares every table with baseline → close old Worker → fresh recovery Worker restores old state before new fence                                                                                                  | NOT TESTED; one pre-COMMIT barrier, not full S02 sweep                               |
| U2       | Full bundle and operation receipt commit → deliberately hide success from the application and record synthetic post-success error → permanently disable/close old data connection → normal old process exit → independent SQL → new process/Owner/connection restore → new epoch → reconcile original nonce/intent/identity → actual Core stable alias replay → fresh independent SQL → external fixture publication/ACK | NOT TESTED; controlled success-response loss, **not real COMMIT I/O uncertainty**    |
| U3       | Evidence plan in §3 only; selector is rejected before execution imports. No Driver shim, custom VFS or fake IOERR is implemented                                                                                                                                                                                                                                                                                         | NOT TESTED; no reliable audited fault-injection method available in this preparation |
| U4       | Independent copies for missing receipt, wrong receipt nonce, wrong receipt epoch, wrong generation, unreadable DB and receipt/Ledger inconsistency; each fails recovery before new fence and fails reconciliation. Separately, a live Writer retains an uncommitted partial transaction while a fresh Reader sees the old cut: outcome remains unknown/unavailable                                                       | NOT TESTED; receipt/nonce absence alone never authorizes retry or ACK                |
| R1       | Real owned ChildProcess SIGKILL after_assertions → bound exit/stream drainage → fresh Reader exact old cut → new recovery process/connection restores old assertions/provenance/correction state → new epoch → independent Reader old state, no ACK                                                                                                                                                                      | NOT TESTED; process crash, **not power loss**                                        |
| R2       | Actual COMMIT → park at after_commit_before_ack → owned SIGKILL/exit → independent Reader new cut → fresh recovery process holds same Owner and restores before fencing → reconcile original receipt/nonce/stable claim → Core duplicate with no new business commit → independent Reader verifies new head → external synthetic ACK                                                                                     | NOT TESTED; no actual Agent transport ACK or exactly-once guarantee                  |
| R3       | Fresh SQLite backup copies with missing event, missing correction history, Cursor beyond ledger, unsupported processor fingerprint, or damaged DB header → new Reader and recovery process reject; intact Snapshot cannot hide absent authority                                                                                                                                                                          | NOT TESTED; controlled data faults, **not disk fault or power loss**                 |

Every unit has a new private fixture binding and independent project.sqlite / owner.sqlite. U4/R3 faults touch only fresh SQLite-backup copies; the committed source database remains intact. No failed output is overwritten or deleted, and there is no automatic retry.

## 3. U3 real COMMIT I/O uncertainty — required evidence, no execution

Before a real U3 run can be approved, provide an independently auditable injection design for the exact Windows/SQLite/Driver tuple. It must locate the actual Project/control COMMIT and its underlying write/sync/VFS call, show which real operation failed and the returned native SQLite error, and preserve the native binary/source hashes, configuration, operation ID, intent digest, original acquisition nonce/epoch/generation, error-time transaction state, and process/connection lifecycle. A JavaScript throw before/after COMMIT, a changed Error.code, a constraint exception, a SIGKILL, or U2's known successful COMMIT does not supply this evidence.

After fault injection: revoke intake/publication/ACK; prove that the suspect transaction cannot later commit. Keep valid Owner while settlement is unproved. Only then inspect one consistent authoritative cut from a healthy new connection to the same admitted resource. Match operation receipt and stable intent, canonical event identity, original execution nonce/epoch, complete records/history and committed source coverage. A newer legitimate Owner epoch does not invalidate a historical business receipt. A missing/superseded **control** nonce cannot attribute an earlier fencing COMMIT: no historical control-receipt table is invented here. If settlement, identity or evidence is unprovable, retain commit_outcome_unknown/unavailable.

Candidate native/VFS instrumentation would require its own design, provenance, build and execution authorization. No such dependency/tool is downloaded, installed or built here. Production S05/M04/P05 and real IO uncertainty remain NOT TESTED regardless of U2.

## 4. Persistence cut and reconciliation

Independent reference schema tables: control, commits, events, assertions, entity_versions, correction_versions, conclusion_versions, dedup, snapshots, checkpoints. This disposable extension adds fixture_meta (RunId/unit/Project/generation/schema/processor fingerprint) and **operation_receipts** inside the same business transaction. A receipt binds operation ID, stable intent digest, original acquisition nonce/token and epoch, result digest, and exact checkpoint coverage. This is not a historical fencing-receipt implementation or production schema.

The single business bundle is sequence 2 over trusted bootstrap 1. Event E1 has internal EventId E1 and stable SRC-A/K1. Complete-unit checkpoint UNIT-1 is separate from the event key. Assertions remain agent_reported; C1/C2 correction images and original assertions remain in history. Snapshot body omits acceptedEvents and records its watermark, state digest and checkpoint vector. Recovery reconstructs **all Core collections from authoritative SQL rows**, including acceptedEvents; it independently compares generated snapshots, journal links, history and checkpoint. Snapshot alone never becomes authority.

Every Reader runs integrity_check, foreign_key_check and all 12 table queries under one BEGIN read transaction. Oracle validates exact row counts, IDs/bodies, sequence/base/prior/result links, namespace/generation/fingerprint, immutable before/history images, source claim/dedup, Snapshot body/watermark/vector, and Cursor coverage. It compares the old complete cut on failure and the new complete cut on success. After a legitimate new fence, only control epoch/token may change; the complete domain cut must remain identical.

Missing receipt/nonce is never a standalone not-committed proof. Only U1/R1's reviewed combination of bound termination/rollback-close evidence plus the independently verified **complete old cut** permits not_committed_proven. No scenario automatically retries business input. U4/R3 are unavailable; they never publish/ACK or overwrite unknown outcome. Original and new capabilities are kept distinct.

An already committed source unit can be ACK-eligible only after settlement, fresh authoritative reconciliation, a healthy ACTIVE new Owner/capability, complete source coverage, and the declared synthetic complete-unit protocol. The parent writes a separate fixture ACK file **after another independent Reader**; SQLite COMMIT and this external ACK do not form one atomic transaction. Actual Adapter protocols remain pending.

Limits: latest head is exactly 1 or 2; receipt reconciliation after a later business commit, earlier Snapshot plus tail replay, checkpoint-only transactions, control-COMMIT ambiguity, bootstrap/maintenance crash sweeps and unsupported versions are later work. Rejecting out-of-scope recovery is unavailable, not a claimed general decoder.

## 5. Event identity / Cursor coverage matrix

| Identity requirement                    | Prepared now                                                                                                                                                           | Separate later verification                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A: stable sourceEventId replay          | Typed stable/alias input; pure claim comparison; U2/R2 schedule executes actual Core duplicate over restored SQL, preserves canonical E1/Assertions and original times | Real Driver run NOT TESTED; complete S06/S07 duplicate ingestion paths and source namespace capability                           |
| B: sourceIdentity missing               | Typed missing/new-ID examples and pure Core/claim tests; no manufactured stable key; repeated external normalization can add an event/assertion                        | Missing-ID durable crash/replay/ACK behavior; no cross-crash external dedup or exactly-once promise                              |
| C: one Cursor, multiple events          | Two typed cursor-only events sharing BATCH-1; pure Core accepts both; Cursor is never a key in claim comparison                                                        | Multi-event SQLite bundle, interrupted batch, prior-position/gap/coverage and checkpoint-only completion; S08/S09 NOT TESTED     |
| D: same Project, distinct generations   | Pure mismatch rejection; U4 fresh-copy generation mismatch schedule fails closed                                                                                       | Positive independent G1/G2 storage isolation, retired generation/reopen lifecycle; no P08 completion                             |
| E: matching/conflicting duplicate claim | Pure same internal ID / stable alias rules and conflict checks; runtime resume checks claim before Core duplicate shortcut                                             | Actual identity_conflict ingestion rollback, full decoder/namespace/prior claim matrix and no Cursor advance; S06/S07 NOT TESTED |

The stable-only reference SQL schema is **not** the proposed optional-identity production schema. Current preparation does not broaden it to cursor-only/no-identity persistence. No Core change, identity algorithm or implicit delivery guarantee follows from this matrix.

## 6. Exact existing Acceptance mapping

| Existing clause                                                                                           | Prepared disposable subset                                                             | Remaining production scope                                                                            |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| S01: independent process exact state/provenance/corrections/acceptedEvents restore                        | R1/R2 recovery plus independent SQL, PA/G1, exact seeded/current collections           | Full production state/version/Host recovery                                                           |
| S02: every applicable pre-COMMIT barrier leaves old complete cut                                          | U1 actual constraint+rollback at after_assertions                                      | Full barrier sweep and production write/control/maintenance paths                                     |
| S03: parked pre-COMMIT owned kill and fresh Reader old cut                                                | R1 partial-write barrier / actual ChildProcess termination                             | Other crash barriers and production lifecycle; no power loss                                          |
| S04: post-COMMIT/pre-ACK kill, new Owner restore/retry, one canonical effect                              | R2; actual Core stable retry and external fixture ACK only after reconciliation/Reader | Real source protocol and complete production recovery                                                 |
| S05: lost acknowledgment, old receipt under new epoch, including later valid commit                       | U2 and U4 nonce/receipt/settlement failures, new epoch, current head 2                 | Later-business-head publication, control attribution and U3 real I/O uncertainty                      |
| S06/S07: same internal/stable identity matching body versus conflict                                      | Pure claim rules; U2/R2 stable canonical reuse                                         | Complete SQLite duplicate admission/conflict rollback not prepared here                               |
| S08/S09: shared Cursor, missing identity, complete-unit/prior/gap rules                                   | Independent typed/pure planning in §5; stable UNIT-1 consistency checked in U/R        | Multiple-input durable Cursor paths and checkpoint-only commits                                       |
| S10/S11: old Snapshot+tail / cache reconstruction                                                         | Scope limits and negative watermark/fingerprint tests                                  | Tail replay, processor version equivalence and cache-only rebuilding not implemented                  |
| S12: missing authority / Cursor beyond coverage => unavailable                                            | R3 controlled-copy subset, no Snapshot-only success                                    | Full missing-provenance/ledger/backup matrix and production behavior                                  |
| S13: two business writers same base, pinned Reader, one commit/one conflict                               | Persisted current-epoch guard reused as prerequisite only                              | **No new S13 race prepared or PASS claimed**; closed Atomicity scope unchanged                        |
| M01/M04: unsupported marker/version/unreadable authority and independently labeled failure reconciliation | R3 fingerprint/unreadable copies; U1/U2 labels and U3 evidence plan                    | Real filesystem/IO/API faults, schema migration and production support                                |
| P02/P08: namespace/Project/generation isolation and retired generation                                    | Pure/generation mismatch preparation only                                              | Privacy admission, foreign Project positives and deletion/reopen lifecycle remain outside scope       |
| P05: quota/FULL with unknown-outcome reconciliation                                                       | U3 future evidence plan references its reconciliation requirement only                 | **No capacity, Retention or SQLITE_FULL test prepared**                                               |
| O01-c / F07/F08/F11/F12: crash takeover, fresh Owner, fencing, settlement/recovery failures               | Actual separate Owner file/connection plus new-process restore-before-fence schedule   | Full owner/platform matrix, hidden loss, release failures and control-COMMIT ambiguity remain pending |

These mappings preserve all production statuses and IDs. U/R are local scenario names, not replacements for S/P/M/O01.

## 7. Files, isolation and evidence

- fixtures.ts/reference-fixtures.ts: current Core golden fixture and typed identity examples; no Driver or Worker effects.
- reference-db.cjs/checks.cjs/reference-oracle.cjs: provenance-pinned local copies of the earlier stable-only staging/checking ideas.
- oracle.cjs/policy.cjs: SQL authority reconstruction, old/new complete-cut checks, receipt/nonce reconciliation, claim rules and independent ACK admission.
- sql.cjs/worker.cjs: injected-Driver disposable schema/transactions; bound private connections and serialized commands; explicit settlement; restore before new epoch; raw errors and real parked barriers.
- actors.cjs/scenarios.cjs: owned ChildProcess identity/nonce/handshake/exit logs, bounded waits, exact U/R schedules; SIGKILL only R1/R2 at proven Barrier. No process-name kill or PID-based takeover.
- lifecycle.cjs/timeline.cjs: require both process close and stream drainage before sealing; offline audit separately checks settlement-before-Reader, restore-before-new-fence and Reader-before-ACK-before-Owner-release order. Settlement proofs bind the original Writer PID, worker nonce, receipt reference and kind-specific close/exit fields.
- safety.cjs/runner.cjs: strict execution gate, fresh RunId, no caller database path, physical local-temp checks before database creation; source/native fingerprints; manifest and one-shot start marker.
- evidence.cjs/audit.cjs: complete inventory+hash seal and offline raw receipt/SQL/lifecycle audit, independent of Runner's verdict. Audit creates no SQLite connection or experiment Worker.
- run.cmd: independent top-level Node CMD stdout/stderr/exit capture plus separately sealed CMD files, then offline audit. It preserves original Node exit and reports audit exit separately.
- *.test.cjs/test-data.cjs: synthetic pure tests, never runtime evidence. tsconfig.json/eslint.config.mjs: static checks.

Future execution is restricted to the installed Windows x64 Node v24.21.0, better-sqlite3 13.0.3 and observed SQLite 3.53.4. Missing/mismatched tools block execution; there is no install, rebuild or Driver switch. Native dependencies are located by metadata from the existing compatibility dependency installation, not by executing the closed Spike.

Only `%TEMP%\apv-sqlite-recovery\<new RunId>` is admissible. Reject repository ancestors, UNC, symlink/Junction aliases, unexpected physical resource identity and hardlinked DBs. Each unit checks recorded main/Owner file dev/ino and live marker before open. This bounded fixture check is **not** production catalog uniqueness or race-resistant Windows handle binding. Successful external replacement/hidden loss and guard–COMMIT race remain NOT GUARANTEED.

Manifest/source/native hashes and generated typed fixture are retained. Worker raw JSON contains RunId/unit/role/worker nonce/PID, sequenced command/barrier/SQL/error/settlement records; parent observations and lifecycle bind those rows to owned handles. Normal stdout/stderr streams are drained before inventory. If settlement/exit/cleanup cannot be proved, record NOT TESTED/incomplete, leave the owned child identified, and never infer release or run cleanup by process name. No automatic retry or evidence deletion exists.

Inventory includes final result, all raw receipts/logs, fixture/module, lifecycle, retained databases/sidecars and unit markers. inventory.json and seal.json explicitly exclude themselves. Streaming CMD stdout/stderr and subsequently captured exit are excluded from the first seal and independently bound by cmd-inventory.json/cmd-seal.json **after** the Node process returns. Existing files use exclusive writes. Re-auditing without --seal-cmd is read-only; resealing with that flag fails rather than overwrites.

Raw errors/stacks are preserved only in this closed synthetic private fixture evidence. No real Agent input, prompt, token, environment dump or source capture is admitted. This limitation does not implement production Privacy/Retention gates.

## 8. Authorized preparation validation

The following checks are allowed now and create no experiment SQLite database or experiment Worker:

```cmd
node --test experiments\phase-2-sqlite-recovery-spike\*.test.cjs
node node_modules\typescript\bin\tsc --project experiments\phase-2-sqlite-recovery-spike\tsconfig.json --noEmit
node node_modules\eslint\bin\eslint.js --config experiments\phase-2-sqlite-recovery-spike\eslint.config.mjs experiments\phase-2-sqlite-recovery-spike
node experiments\phase-2-sqlite-recovery-spike\runner.cjs --list
node experiments\phase-2-sqlite-recovery-spike\runner.cjs --preflight
git diff --check
```

node --check is additionally used for every CJS file. Pure fixtures compile in memory using installed esbuild and unchanged Core code; no Driver is loaded. Pure pass/static success cannot set any U/R/S/P/M scenario to PASS. Preparation check results are reported separately by Codex.

## 9. Later Windows CMD authorization and commands

**Do not execute this section in the current preparation task.** ChatGPT must separately review this source, authorize exact U/R case selectors and the real owned-process kills for R1/R2, and approve the bounded environment/fixture/source protocol. User performs the authorized runs in Windows CMD. U3 has no runnable command and needs separate credible injection preparation first.

After that authorization, from the existing checkout:

```cmd
cd /d %APV_REPO%
experiments\phase-2-sqlite-recovery-spike\run.cmd U1 --execute
```

Use the same existing run.cmd with the **separately authorized** U2/U4/R1/R2/R3 selector, one invocation per case, a fresh RunId each time. The wrapper prints APV_RECOVERY_NODE_EXIT, APV_RECOVERY_AUDIT_EXIT and the exact retained evidence root. No loop, automatic rerun, old-run-id reuse or cleanup command is supplied. An audit error does not erase the original Node exit/logs or DB evidence. Submission requires independent review of the retained raw artifacts and excludes production PASS claims.

## 10. Remaining Production P0

True U3 COMMIT I/O uncertainty and failed real settlement/release; historical control-nonce attribution; restore after later business heads/older caches/tail; optional-identity and multi-event Cursor durable coverage; claim decoder/scope correctness; production physical catalog/resource binding; hidden Owner loss/replacement/final race scope; private lifecycle, actual Driver/API/OS release errors; exact production Host/platform admission; unresolved Privacy gate timing, allowlist/quota/retention/deletion/migration approval and full 25-case acceptance. This preparation closes none of them.
