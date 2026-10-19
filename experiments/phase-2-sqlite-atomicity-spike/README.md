# S02/S13 Disposable Atomicity and Transaction Fencing Preparation

**Public-safe publication copy (2026-10-19).** The original private preparation document bytes are retained separately. Original SHA256: `a5710e9b3350162d13f9a8f301f9fdd5aa76a716b15c4ed7ce42e18c4a5eb61c`. Machine prefixes below use `%APV_REPO%` (repository root), `%LOCALAPPDATA%` (original account's local app-data root), `%ProgramFiles%` and `%APV_CLANG_EXE%` (the recorded Clang executable), where applicable. These are publication aliases, not literal historical command bytes or newly observed paths. RunIds, build/binary fingerprints, results and limitations are unchanged. This copy is not a new execution authorization.

**Status: PREPARED FOR REVIEW; real Cases A–E NOT TESTED.** Prepared 2026-10-09.
This directory implements a disposable, ordinary Windows Node experiment, not
production Storage, a new package, Extension Host acceptance or another Ownership
Spike. No database, Worker or fault scenario was executed during preparation.
D-041–D-044 remain Proposed; full Phase 2 and production S02/S13 remain NOT TESTED.

## 1. Specification findings and bounded scope

| Original clause / position                                                                                                                                                                                                                                                                                                                                 | Classification and impact                                                                                                                                                                                                                                     | Minimal recommendation, **not applied**                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ARCHITECTURE §9, line 141](../../ARCHITECTURE.md#9-normalized-event-model): `sourceEventId（来源不提供时由 Adapter 的稳定 cursor/identity 策略生成）`; line 145 promises source-pair idempotence                                                                                                                                                          | Semantic conflict with the existing optional Core identity and distinct batch position. Line 152 explicitly records the unresolved discrepancy. Cursor-only, missing-ID and derived-ID persistence/degradation paths are **BLOCKED pending user disposition** | Keep event identity optional. Permit an Adapter identity only after independently validating event-specific stability/uniqueness. A consumption/batch cursor is not an event key; absence remains absence and downgrade is explicit |
| [Core normalized-event.ts](../../packages/core/src/domain/normalized-event.ts): source identity is optional; cursor/revision can cover multiple events. [Design §7.1](../../docs/storage/phase-2.3-design.md#7-identity-duplicates-order-and-checkpoints): missing stays missing, never synthesized from a batch cursor/title/time. D-042 remains Proposed | Current Core and Proposed Storage agree; the Proposed clarification cannot silently supersede the original approved Architecture                                                                                                                              | Obtain the explicit specification disposition before implementing affected production paths or interpreting this experiment as complete identity coverage                                                                           |
| [Design §2](../../docs/storage/phase-2.3-design.md#2-evidence-and-specification-alignment): ARCHITECTURE §20/v0.1 privacy gate timing vs ROADMAP Phase 2 timing                                                                                                                                                                                            | Existing stage-gate wording conflict. No real capture, Driver acceptance or production authorization is inferred here                                                                                                                                         | Explicitly approve consistent timing before production; keep the existing stricter gates and all current statuses                                                                                                                   |

Only the common stable-source-event subset is prepared: synthetic SRC-A/K1
identifies exactly E1; a **separate** synthetic complete-unit checkpoint covers E1
at ledgerSequence 2. UNIT-1 is never used as the event/dedup key. This is a fixture
scope, not a decision resolving the conflict. Broader fixtures remain paused.

Cursor advancement and fixture ACK are separate: checkpoint data commits with the
whole bundle; the external parent ACK sink receives an intent only **after** a
successful Project COMMIT receipt. No SQLite transaction contains the external
ACK. Real Adapter resume/ACK, changed duplicate claims, cursor-only and no-identity
semantics are not implemented or validated. Current Core replay checks do not
validate changed duplicate bodies; Proposed Storage claim comparison must precede
such replay. This experiment accepts only one fresh stable E1, not a general
dedup decoder or S06/S07 implementation.

No existing specification, Decision, old experiment or original evidence was
modified. Missing-ID/cursor policy requires approval; this directory cannot grant
it. The stable subset is subject to review and separate execution authorization.

## 2. Actual S02/S13 mapping

Original [Phase 2 acceptance](../../docs/acceptance/phase-2-storage.md) §1/§2 are
prerequisites: actual local SQLite processes, actual typed Core golden output,
fresh disposable root, independent SQL, source coverage and external fixture ACK.

| Existing clause                                                                                                                                                                                                                                                                 | Prepared mapping                                                                                                                                                                                                                                                                                                   | Scope / status                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S02, line 58:** `Inject failure after each applicable pre-COMMIT barrier, including snapshot/cursor/head`; `Sweep all barriers; rollback leaves old complete cut, no new assertion/input/operation success or advanced cursor`                                                | C sweeps 10 business barriers, injects a real PK constraint statement, explicitly rolls back and compares **all tables** with the independently observed old cut. Successful control independently verifies the complete new bundle. D/E supply SQL cuts and transaction settlement evidence                       | **Partial Coverage; NOT TESTED.** Business pre-COMMIT scope only; bootstrap/fencing acquisition barriers, process kill, disk/IO, real recovery, future plan/Timeline and production implementation are not covered                                                                                                                   |
| **S13, line 69:** `Two actual fixture writers contend with same expected revision; hold a read transaction`; `One commit, one conflict; no lost update. Readers see all-old/all-new cut; bounded BUSY handling/WAL behavior recorded; does not claim production owner election` | A uses separate A/B processes with expected base 1; A holds the Project transaction, B1 fencing actually contends, A is revoked and rolls back, B2 commits once. A pinned Reader retains its old cut through the commit; fresh Readers see the new cut. B checks post-fence stale rejection and same-base conflict | **Partial Coverage; NOT TESTED.** Controlled ownership handoff is not two simultaneously authorized production Writers/CAS election; B's still-live old process is a negative SQL capability probe without Owner permission. WAL use/visibility and 250ms timeout are observed, not checkpoint-starvation/full-WAL/performance proof |
| D/E                                                                                                                                                                                                                                                                             | Embedded checkpoints in A/B/C, not new acceptance IDs                                                                                                                                                                                                                                                              | Reader SQL and explicit error settlement, not unknown-COMMIT recovery or Extension Host acceptance                                                                                                                                                                                                                                   |

Acceptance §1 barrier aliases: `after_event_dedup` covers after_event plus its
dedup claim; `after_entities/corrections/conclusions` correspond to the three
version-image barriers; `after_head` corresponds to after_head_update. Remaining
names match. The first `after_begin` is **after current persisted capability and
base guards**, before any bundle DML. Fencing/control/bootstrap barriers and
after_commit_before_ack crash are not swept in C. These omissions are disclosed,
not converted to PASS.

## 3. Files and implementation sequence

| File                              | Responsibility                                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fixtures.ts / tsconfig.json       | Compile-time checked existing Core contracts; golden event application through actual applyNormalizedEvent; trusted correction/conclusion record images           |
| db.cjs                            | Minimal disposable DDL, guarded fencing and staged business bundle; Database injected by Worker only                                                              |
| worker.cjs                        | Each child owns private SQLite connections on a serialized command thread; sequenced raw receipts; actual Driver load only in future execution                    |
| runner.cjs                        | Explicit execution gate, new RunId/root, bound ChildProcess/nonce, bounded command waits, separate parent ACK sink, source/native hashes, lifecycle and inventory |
| scenarios.cjs                     | A/B/C scheduling; D/E embedded checks; no execution at import                                                                                                     |
| oracle.cjs / checks.cjs           | Pure receipt binding, whole-cut rollback comparison, raw-row reconstruction and aggregate verdict; no Driver/Worker imports                                       |
| checks.test.cjs / oracle.test.cjs | Pure tests; synthetic test objects are never runtime evidence                                                                                                     |
| eslint.config.mjs / .gitignore    | Local static rules and exclusion of generated material                                                                                                            |

Preparation order: inspect contracts → record affected-path blocker → pure
assertion tests → minimal fixture/schema/Workers → scenario/Reader checks → static
validation → review. Next: separately authorize exactly the bounded scenarios →
run on Windows → independent raw-evidence audit. No install or production change.

## 4. Environment and isolation

Future execution requires Windows x64 ordinary Node **24.x**, the repository's
installed local **better-sqlite3 13.0.3**, its `prebuilds/win32-x64.node`
and local esbuild. Version/hash metadata is read from the existing disposable
Driver dependency installation. Nothing is installed, globally changed or
selected for production. Missing native/tool resources block execution, without
pnpm/config/permission bypass. SQLite version is captured by the executing child;
it is not assumed from Driver version. This is not an Extension Host support claim.

Databases are created only under a freshly generated
`%TEMP%\apv-sqlite-atomicity\<RunId>\<unit>` outside project repositories. No
database-path argument exists. Temp roots resolving through aliases/reparse links
or UNC are rejected. New unit directories cannot already exist. Owner DB uses a
normal rollback journal with BEGIN IMMEDIATE; Project DB uses WAL with
foreign_keys enabled. This fixture does not prove physical identity binding,
power-loss durability or production FULL/IO policy. No normal VS Code/Worker
process is inspected or terminated; no global cleanup is implemented. A stuck
owned child is reported as incomplete and left identified, never declared clean.

This is a closed synthetic source allowlist. Evidence contains synthetic IDs,
record images, fixture strings, child PID/nonce, runtime versions and SQLite
errors from synthetic SQL. It must never accept source code, user prompts,
credentials, live Source input or real project paths. Local evidence remains
private; do not publish raw stacks/path-bearing stderr without review.

## 5. Minimal persistence bundle and transaction boundary

DDL is experiment-only, not a proposed production schema implementation:

- control: Project/generation, persisted epoch/token, ledger head and state digest.
- commits: contiguous seq, operation ID, base/prior digest, execution capability,
  resulting digest. Fencing-only commits change no domain ledger/head/cursor.
- events + dedup: independent internal E1 and source SRC-A/K1, canonical JSON,
  claim digest, same commit reference.
- assertions: immutable original/source/event/provenance JSON and commit link.
- entity_versions, correction_versions, conclusion_versions: history images;
  original claim bodies/history are preserved, not overwritten.
- snapshots: actually generated state image **without duplicated acceptedEvents**,
  exact watermark/digest and checkpoint vector at that cut.
- checkpoints: distinct SRC-A/stream/codec complete unit and canonical E1 coverage,
  linked to the same ledger sequence.

Bootstrap sequence 1 seeds the reviewed synthetic beforeState and epoch 0. It is
not production creating-store/recovery validation. Fencing increments epoch in a
Project BEGIN IMMEDIATE after obtaining Owner, then enters ACTIVE only on confirmed
COMMIT. Every business operation acquires Project BEGIN IMMEDIATE before reading
current generation/epoch/token/head/digest. No cached capability authorizes DML.
Guard/base mismatch rolls back; all applicable bundle effects and head commit
together at sequence 2. COMMIT rechecks Owner and current Project guard on the same
serialized thread. This does not remove the external Guard–COMMIT race.

The actual Core E1 outcome retains agent_reported completion. No Verified upgrade
occurs. C1/C2 supersession images are **explicit trusted manual fixture data**;
E1 does not expire a correction and no correction/resolution engine is executed.
Timeline/plan outputs do not exist in current Core and are not fabricated.

Workers park an open transaction at test-only command barriers so the parent can
schedule independent Readers/competitors. Such parking is an instrumented
experiment boundary, not proof of production's private synchronous transaction
lifecycle. Guards and the final COMMIT have no callback/await between them.

## 6. Scenario schedule and independent SQL criteria

| Case | Scheduled evidence and assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A    | A ACTIVE epoch1/base1 → pinned old Reader → stage full uncommitted bundle → fresh Reader old cut → explicit observable Owner rollback/revocation, retaining Project transaction → B1 Owner HELD_UNFENCED/fence attempt/SQLITE_BUSY, no fence_committed → independent old cut → A COMMIT refuses OWNER_REVOKED and explicit rollback → old cut → A/B1 close → fresh B2 fences epoch2, no ledger change → B2 complete bundle/COMMIT → pinned old Reader still old; fresh Reader exactly complete new cut |
| B    | Old process obtains epoch1 then normally releases Owner/Project handles, remains alive → new Writer fences epoch2 → independent baseline → old process negative SQL probe acquires Project write transaction then Guard rejects stale capability → exact unchanged SQL cut → new Writer commits bundle → independent complete cut → stale probe again rejected → unchanged cut → current Writer stale base1 receives BASE_CONFLICT → unchanged cut                                                     |
| C    | Fresh unit per each pre-COMMIT barrier → Writer fences → independent baseline → duplicate-control-PK SQL statement really raises SQLITE_CONSTRAINT_PRIMARYKEY → receipt proves transaction still active at error → explicit ROLLBACK with inTransaction=false → fresh independent Reader's all-table cut exactly equals baseline → graceful close; separate success control reads pre/uncommitted/new cuts                                                                                             |
| D    | Each cut comes from a distinct Reader process/connection under BEGIN; each table query and raw rows recorded. A additionally pins one read transaction across the new COMMIT. Head/digest is not enough: all tables must agree                                                                                                                                                                                                                                                                         |
| E    | Actual Project BUSY vs guard/base mismatch vs actual constraint exception are separate codes/receipts. Record error-time and post-ROLLBACK state; close confirmation is explicit. Outcome lookup admission requires inTransaction=false and confirmed rollback/close. No unknown COMMIT lookup or IO fault is performed                                                                                                                                                                                |

Successful Oracle: exactly two ledger records (bootstrap and business), head 2,
base1/prior/new digest, correct generation/capability, exactly E1 and its source key,
exact immutable Assertions and old/new history images, exact Core afterState arrays,
snapshot2/watermark2/vector and checkpoint covered E1 at seq2, one dedup claim. Old
claims/provenance remain unchanged. Negative Oracle: **every table byte-equivalent
JSON row cut** to its measured baseline, no new success receipt, source position or
derived/history record. Fencing-only Oracle permits only epoch/token change.

For every commit the Worker emits committed before publication and fixture ACK
intent; the separate parent records an ACK sink receipt referencing those raw
sequence numbers and operation. Rejected commands must emit none of these.
Independent audit must also check Worker-wide totals: exactly one business commit,
one publish/ACK intent/sink for a successful unit, none for failed-only units.
No Runner success summary substitutes for raw SQL or ACK evidence.

## 7. Evidence and verdict

Each future run creates exclusive files, never overwrites older evidence:
`manifest.json`, `fixture.json`, raw sequenced Worker receipts, command/parent-order
observations, independent SQL cuts, ACK sink receipts, stdout/stderr,
`lifecycle.json`, `parent-observations.json`, `inventory.json`, `derived-result.json`.
Manifest records source/Core SHA256 and native SHA256 plus runtime identity;
inventory hashes raw evidence. SQLite files are retained for possible separately
authorized read-only audit, not public fixtures. Raw SQL and source hashes must
be independently checked against inventory/manifest before accepting the verdict.

Binding: RunId, nonce, PID and actual parent-owned ChildProcess; Worker receipt
sequence is contiguous. Parent order/command responses provide causality, not
cross-process wall-clock ordering. Lifetime records distinguish normal expected
exit from unexpected exit, and capture exit code/signal. These cases do not kill
processes. A command/cleanup timeout, missing receipt/Oracle or residual child
produces NOT TESTED, never PASS. Actual invariant assertion failure dominates
later missing checks as FAIL. An infrastructure failure is not a SQLite protocol
failure. Only fully observed bounded runs can aggregate PASS WITH LIMITATION;
unconditional PASS is deliberately not emitted by this partial-scope runner.

The derived result's **top-level CLI exit code remains UNVERIFIED**, even if the
program sets process.exitCode. Record `%ERRORLEVEL%` immediately in CMD; stdout,
Runner verdict and code intent do not independently prove it. Experiment protocol
result, CLI status, static tests and production acceptance are separate.

Unverified/unsupported coverage remains explicit: broader source identity/real
ACK/duplicate recovery; COMMIT IO uncertainty/nonce reconciliation; crash restart;
release failure/hidden Owner loss/file replacement; identity/WAL domain binding;
arbitrary SQL Writers; power loss/platform/Host; migration/deletion/retention/privacy
policy; all remaining S/P/M. Original Ownership conclusions are unchanged.

## 8. Next-round Windows CMD suggestions — DO NOT RUN without approval

Review the source-contract disposition and approve this **stable-event Partial
Coverage** scope first. No command below was executed with --execute this round.

Static metadata/preparation commands (no SQLite or Worker):

```cmd
cd /d "%APV_REPO%"
node experiments\phase-2-sqlite-atomicity-spike\runner.cjs --list
node experiments\phase-2-sqlite-atomicity-spike\runner.cjs --preflight
node --test experiments\phase-2-sqlite-atomicity-spike\checks.test.cjs experiments\phase-2-sqlite-atomicity-spike\oracle.test.cjs
```

After **separate explicit execution authorization**, choose only the authorized
case. Each invocation creates a new independent RunId. First example:

```cmd
cd /d "%APV_REPO%"
set "APV_CMD_CAPTURE=%TEMP%\apv-atomicity-cmd-%RANDOM%-%RANDOM%"
mkdir "%APV_CMD_CAPTURE%"
echo %ERRORLEVEL%
```

确认 mkdir 返回 0 且新目录为空后，再执行下面一段；否则停止，不执行实验。

```cmd
node experiments\phase-2-sqlite-atomicity-spike\runner.cjs --case A --execute > "%APV_CMD_CAPTURE%\A.txt" 2>&1
set "APV_A_EXIT=%ERRORLEVEL%"
echo %APV_A_EXIT%> "%APV_CMD_CAPTURE%\A-exit-code.txt"
type "%APV_CMD_CAPTURE%\A.txt"
type "%APV_CMD_CAPTURE%\A-exit-code.txt"
```

If B/C are separately approved, use identical capture steps replacing A with B/C
and `--case A` with `--case B`/`--case C`. Do not infer they were authorized by A.
Do not overwrite captures or rerun a failure for an improved result. Stop on
unexpected error, missing receipt, wrong version/hash, root binding failure,
cleanup problem or NOT TESTED/FAIL; preserve files and report actual RunId/root/
capture path. If directory creation fails in an interactive
CMD session, stop manually before the execution block. No force/global cleanup or
permission/config workaround. Independent evidence audit is required after every
authorized run before upgrading even its narrow result.

## 9. Preparation verification record

Final static verification: 2026-10-10. JS syntax, fixture TypeScript noEmit,
local ESLint, Prettier check and Git whitespace checks passed. Pure tests:
**9 tests passed**, including evidence-incomplete vs protocol-failure classification.
These results do not load SQLite, run the staged SQL, start a Worker or verify A–E.
Read-only metadata preflight: Node v24.21.0, Windows x64, local Driver 13.0.3;
native resource SHA256
`e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a`.
This is resource identity, not successful native loading.

Historical Ownership evidence protection was checked by **file reads/hashes only**:
13 existing inventories, 4,563 referenced entries, zero missing/hash-mismatched
entries. No SQLite connection was opened and no experiment was rerun. OP10 P0
inventory SHA256 remains
`598cd810b3dff81d008ccb52619801f804f8d1a031386218344c72b970aa41ef`.
No claim is made here about evidence files outside those inventories.

Only the 13 files in this new experiment directory were added for this task;
preexisting specification/production/historical Harness files were not edited.
All runtime cases and production S02/S13 remain **NOT TESTED**. Contract disposition,
source scope review and separate execution approval remain pending. No commit/push.
