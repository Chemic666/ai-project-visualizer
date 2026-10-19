# Disposable Recovery Spike — Independent Evidence Audit

**Public-safe publication copy (2026-10-19).** The original private audit/review bytes are retained separately. Original SHA256: `8c6d1fabb414302b531f684d4a23fada04ffa24a8300b6edb3fb07b8f2dabe34`. Machine prefixes below use `%APV_REPO%` (repository root), `%LOCALAPPDATA%` (original account's local app-data root), `%ProgramFiles%` and `%APV_CLANG_EXE%` (the recorded Clang executable), where applicable. These are publication aliases, not literal historical command bytes or newly observed paths. RunIds, build/binary fingerprints, results and limitations are unchanged. This copy is not a new execution authorization.

**Audit date: 2026-10-11. Overall: PASS WITH LIMITATION. Recommendation: proceed to formal Recovery Spike Closure Review; this report does not close the Spike.**

Only the six user-executed runs identified below were audited. The audit started no experiment Worker, reran no U/R or closed Spike, loaded no SQLite addon and opened no SQLite connection. Original evidence, Harness, Core, Decisions and production acceptance were unchanged. The only new repository document is this report.

U3 and actual COMMIT I/O uncertainty remain **NOT TESTED**. Hidden Owner loss and successful file replacement remain **NOT GUARANTEED**. Production Storage recovery and actual Extension Host integration remain **NOT TESTED**; production implementation remains unauthorized. D-041–D-044 remain Proposed; the full 25 S/P/M acceptance statuses are unchanged.

## 1. Evidence identity, method and limitations

The evidence parent was the user-supplied physical directory `%LOCALAPPDATA%\Temp\apv-sqlite-recovery`. The external CMD capture alias **CMD** means `%LOCALAPPDATA%\Temp\apv-recovery-gate-11cc3dd9-58f1-47ab-9ccf-0fe3d4cc7dfa`. These are exact supplied locations, not paths guessed from the audit sandbox's TEMP.

Each Case alias below expands to its RunId directory under that parent. For example, `R1/raw/writer-2-9.json` identifies that actual retained raw receipt.

| Case      | RunId                                  | Inventory entries | Worker receipts | Commands | Workers | SQL-cut receipts | Reader processes |
| --------- | -------------------------------------- | ----------------: | --------------: | -------: | ------: | ---------------: | ---------------: |
| U1        | `e10cd028-428c-4a32-90d0-a474f1b479d0` |               136 |              47 |       13 |       6 |                3 |                3 |
| U2        | `3a7ae813-b676-4974-ac33-3c02bb86e8aa` |               165 |              60 |       15 |       6 |                3 |                3 |
| U4        | `229ad065-357b-44cf-9fb8-f4c6035219ab` |               597 |             209 |       61 |      26 |                9 |               10 |
| R1        | `aa8238c1-0081-4eb6-93dd-9c8d9d98ff75` |               125 |              42 |       12 |       6 |                3 |                3 |
| R2        | `16f3beb0-2300-4b1c-b45d-2b83c2d21a0e` |               154 |              55 |       14 |       6 |                3 |                3 |
| R3        | `4ebcae06-73f8-48cb-9dca-377d1722f3dc` |               463 |             162 |       47 |      20 |                7 |                8 |
| **Total** | **6 distinct runs**                    |         **1,640** |         **575** |  **162** |  **70** |           **28** |           **30** |

All six `manifest.json`/`execution-start.json`/directory identities match the supplied Case/RunId/root/repository. The manifest's immutable `execution: NOT STARTED` is reservation history; the matching execution-start marker and actual raw Workers establish execution. It is not interpreted as a live execution verdict.

An independent audit parser recomputed SHA256, traversed actual file sets, parsed raw SQL rows and reconstructed complete cuts. It did **not** call the Harness's Oracle, policy, verdict function or built-in audit. The unchanged current Core and typed reference fixture were compiled entirely in memory using installed TypeScript, with no subprocess or generated fixture file, to independently confirm the supplied fixture and stable replay behavior. Trusted manual C1/C2 images remain persistence fixtures, not Correction Engine output.

For every Worker, the audit matched RunId/workerId/nonce/PID/unit/role with spawn intent and lifecycle, verified receipt sequence 1..N, bound each command UUID and every receipt to one parent observation, and checked close/exit relationships. The 70 worker nonces are distinct. These are 70 bound Worker identities, not a claim of globally unique or unrecycled OS PIDs. All 575 parent observations match their raw receipt identity/kind/command. Parent order values, including spawn, commands, kill, exits and publication/ACK, are unique and contiguous within each run: U1 1–72, U2 1–89, U4 1–322, R1 1–67, R2 1–84, R3 1–249.

Key causality uses command/receipt dependency and parent order, **not cross-process wall-clock ordering**. Recorded UTC times are descriptive only. OS termination is supported by the original ChildProcess-bound lifecycle and matching raw handshake/Barrier, rather than a later process list or an independent kernel trace.

Retained database/sidecar bytes were hashed and SQLite headers read without opening a database. Logical results at execution cuts are supported by the original **independent runtime SQL Readers**, not a new audit-time query. Audit-time reopening, fresh integrity_check and logical reconstruction directly from retained database pages are **UNVERIFIED/not performed**, deliberately preserving the original WAL/SHM state.

## 2. SQL authority, receipts and runtime

Each of the 28 SQL-cut receipts includes the exact `PRAGMA integrity_check`, `PRAGMA foreign_key_check` and twelve `SELECT * FROM <table> ORDER BY rowid` queries under the source-bound one-BEGIN read protocol. The tables are control, commits, events, assertions, entity_versions, correction_versions, conclusion_versions, dedup, snapshots, checkpoints, fixture_meta and operation_receipts. The two unreadable Readers instead retain raw SQLITE_NOTADB errors and settlement, and are not counted as SQL cuts.

The independent comparison checks every row of the complete old/new cut: bootstrap and business sequence/base/prior/result links; original immutable Assertions and Provenance; all entity, Correction and Conclusion versions; canonical E1 and stable SRC-A/K1 Dedup; Snapshot body/watermark/vector; UNIT-1 Cursor coverage; project/generation/schema/fingerprint; and transaction receipt operation/intent/original nonce/epoch/result/coverage. Recovery reconstructs all CoreState collections, including acceptedEvents, from authority rows. An intact Snapshot alone never proves recovery.

Recomputed fixture digests, using the pinned JSON property/order convention:

| Value                   | SHA256                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| Complete before state   | `cb28369cb4b70303db3603ffe5c16be9e41ef3b09db29ba16aa8c8954dc70039` |
| Complete after state    | `5a61515f4eea0d0eda013aac5402400ce0093c0b70b0b9208b0edb2767e43cf3` |
| Stable operation intent | `f13ddabc924de9817cb24306e91833719a8c9114c4111def266fdbb036243f17` |

Each manifest's 51 source hashes (32 Harness files and 19 Core source files) matches current source bytes, and its fingerprint matches the recomputed source-hash object. All Worker ready receipts report Node **v24.21.0**, **win32/x64**, better-sqlite3 **13.0.3**. SQL receipts report SQLite **3.53.4**, reached through the pinned actual-connection version guard. All 34 valid retained SQLite headers record writer version **3053004**; the other two intentionally corrupted headers are the unreadable fault copies. No specific Windows edition/build was independently recorded; that detail remains UNVERIFIED.

The installed Native Binary was read and rehashed without loading it. Its SHA256 matches all six manifests: `e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a`.

## 3. U1 — pre-COMMIT confirmed failure: PASS WITH LIMITATION

Original Writer `writer-2`, PID **21704**, worker nonce `e17d6370-03f4-4721-bf15-33c184b3c253`, held the separate Owner and fenced epoch 1. The actual stage command requests constraint injection after Assertions.

|           Parent order | Raw evidence                                            | Observation                                                                                                                                                 |
| ---------------------: | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
|                     31 | `U1/raw/writer-2-9.json`                                | after_assertions Barrier, OP-E1/G1, transaction active; partial business DML executed.                                                                      |
|                     32 | `U1/raw/writer-2-10.json`                               | Original SQLITE_CONSTRAINT_PRIMARYKEY error/stack; inTransaction=true. This exception is not automatic rollback evidence.                                   |
|                     33 | `U1/raw/writer-2-11.json`                               | Explicit ROLLBACK/connection-close settlement: beforeInTransaction=true, inTransaction=false, closeConfirmed=true, Owner retained; PID/nonce/receipt bound. |
|                     38 | `U1/raw/reader-4-2.json`                                | Fresh Reader spawned after settlement; its complete twelve-table cut exactly equals baseline `reader-3-2.json`.                                             |
| 49 → 53 → 54 → 55 → 56 | lifecycle; `U1/raw/recovery-5-2.json` through `-5.json` | Original exits before recovery PID **21168** obtains Owner, reads authority, restores old state and commits fresh epoch 2.                                  |
|                     61 | `U1/raw/reader-6-2.json`                                | Independent post-recovery old cut; only control epoch/token differs from baseline.                                                                          |

No original commit_loss/commit_park command exists. No new Event/Assertions/history/Snapshot/Cursor or business receipt persisted, and no publication/ACK file exists. `known-failure-decision.json` is supported by bound settlement **plus exact complete old authority**, not receipt absence alone. Scope is one after_assertions failure, not a full S02 barrier sweep or an I/O failure.

## 4. U2 — successful COMMIT, controlled response loss: PASS WITH LIMITATION

Original Writer PID **25572** reports SQLite COMMIT returned success in `U2/raw/writer-2-18.json` (order **41**), followed by `raw_simulated_error`, permanent data settlement and normal original process exit. Only after settlement/exit does fresh Reader `reader-4-2.json` (order **53**) observe the exact new cut with OP-E1 receipt and head 2.

Recovery Worker PID **9276**, a new process/nonce/private connection, obtains Owner at **63**, reads authority at **64**, restores at **65**, and commits epoch 2 at **66**. `recovery-5-7.json` records reconciliation at **69**, actual Core stable alias duplicate at **70**, ACK eligibility at **71**, and independent Reader `reader-6-2.json` confirms the unchanged domain cut at **76**. External fixture publication is **83**, ACK is **84**, and recovery Owner release is **87**, afterward.

Receipt execution epoch/nonce remains the original **epoch 1 / acd0953d-b2e6-49c7-acbe-3edbc0078567**. Current authority uses **epoch 2 / b4d1a450-56e4-4fcd-b657-c988393aa658**. The receipt operation, intent, canonical event, result digest and UNIT-1 coverage match independent SQL. Reconciliation does not reuse the old token or reject a historical receipt merely because the current epoch changed.

No recovery business stage/COMMIT command exists. Canonical E1, its original Assertions and acceptedEvents remain unchanged; the new alias is not appended. Reconciliation alone has mayAck/mayReplay/mayPublish=false; the separate active-Owner/source-protocol gate and independent Reader precede publication/ACK.

**U2 is controlled success-response loss, not actual uncertain COMMIT I/O.** The raw receipt explicitly records realIOUncertainty=false. Its result cannot promote U3/S05/M04/P05 production gates.

## 5. U4 — untrusted reconciliation: PASS WITH LIMITATION

The main source first commits the complete stable bundle. Each fault below uses a separate SQLite API backup into a new unit, with a new private binding; the original source is not mutated. Independent comparison confirms the exact specified row mutation and rejects the resulting authority. The Reader result in each failure wrapper is bound to its raw read-command receipt.

All table references below are relative to U4's raw directory. Each row has an actual copy/mutation receipt, independent Reader/error receipt, and **new recovery process** error. Every reconciliation result is unavailable with mayAck/mayReplay/mayPublish=false. No fault recovery emits restored/fence_committed/ack_eligible.

| Variant             | Exact observed fault                                                         | Mutation receipt  | Reader / raw error                | Recovery error receipt                     | Independent result                                         |
| ------------------- | ---------------------------------------------------------------------------- | ----------------- | --------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| receipt_missing     | operation_receipts empty while complete head-2 business records remain       | `fault-5-4.json`  | `reader-6-2.json`                 | `recovery-7-4.json`, RECOVERY_UNAVAILABLE  | PASS WITH LIMITATION; absence is not treated as rollback.  |
| nonce_mismatch      | receipt nonce is wrong-nonce; original commit token unchanged                | `fault-8-4.json`  | `reader-9-2.json`                 | `recovery-10-4.json`, RECOVERY_UNAVAILABLE | PASS WITH LIMITATION                                       |
| epoch_mismatch      | receipt epoch increased by 10, commit epoch unchanged                        | `fault-11-4.json` | `reader-12-2.json`                | `recovery-13-4.json`, RECOVERY_UNAVAILABLE | PASS WITH LIMITATION                                       |
| generation_mismatch | control generation G2 contradicts PA/G1 binding and receipt                  | `fault-14-4.json` | `reader-15-2.json`                | `recovery-16-4.json`, RECOVERY_UNAVAILABLE | PASS WITH LIMITATION; negative mismatch only.              |
| unreadable          | first 100 main-file bytes overwritten with 0x58 in the new copy              | `fault-17-4.json` | `reader-18-2.json`, SQLITE_NOTADB | `recovery-19-3.json`, SQLITE_NOTADB        | PASS WITH LIMITATION; controlled corruption, not disk I/O. |
| ledger_mismatch     | seq-2 commits.result_digest=wrong while receipt/state retain the true digest | `fault-20-4.json` | `reader-21-2.json`                | `recovery-22-4.json`, RECOVERY_UNAVAILABLE | PASS WITH LIMITATION                                       |

The six copies preserve all non-target rows exactly. `U4/raw/reader-23-2.json` at order **279** independently confirms the original source cut still exactly equals its committed pre-copy cut.

The separate **unsettled transaction** subcase is also PASS WITH LIMITATION. In `u4-unsettled`, Writer `writer-25`, PID **9624**, reaches the actual partial after_assertions Barrier (`writer-25-9.json`) at **306**, inTransaction=true. New Reader `reader-26-2.json` observes the old complete cut at **311** while the Writer still has no close/settlement command. Close is only requested at **318**, with explicit settlement at **319**. `failure-decision-unsettled.json` returns unavailable/UNSETTLED and all permissions false. Thus seeing no receipt while a transaction is still live does **not** infer that it failed. The later rollback is teardown, not evidence available to the earlier decision.

U4 never publishes or ACKs, never retries the uncertain business operation, and never overwrites the committed source.

## 6. R1 — real pre-COMMIT process termination: PASS WITH LIMITATION

Original `writer-2` PID **21760**, worker nonce `ba095a83-ffcd-4541-9ad8-f3c5c6baeaec`, reaches `R1/raw/writer-2-9.json`, after_assertions/OP-E1/G1 at parent order **31**, inTransaction=true. The parked stage done receipt follows; no COMMIT command is issued. The lifecycle records the owned ChildProcess SIGKILL request at **33**, then actual exit at **34**, code=null/signal=SIGKILL. This expected exit is not required to be 0.

After exit, fresh Reader `reader-4-2.json` at **38** sees exactly the full baseline head-1 cut. New recovery process PID **21464** obtains Owner at **48**, reads/validates old authority at **49**, restores at **50**, fences epoch 2 at **51**, and new Reader `reader-6-2.json` at **56** confirms the same complete old domain cut. No partial event, Assertion, history, Snapshot, checkpoint or receipt survives. No publication/ACK exists, and no fabricated completion state is restored.

Recorded kill/exit times are 07:49:10.146Z / 07:49:10.151Z on 2026-10-11, but the decisive causal evidence is Barrier → parked done → owned kill → exit → fresh spawn/read/restore. This proves the stated process-termination fixture, not OS power loss.

## 7. R2 — real post-COMMIT/pre-ACK process termination: PASS WITH LIMITATION

Original `writer-2` PID **18920**, worker nonce `c976afca-56c8-4fae-ad7e-c82329f7a6d7`, reaches `R2/raw/writer-2-18.json` at order **41**: after_commit_before_ack, SQLite COMMIT returned success, inTransaction=false, OP-E1/G1. Parent receives the parked done receipt before requesting owned SIGKILL at **43**; exit is recorded at **44**, code=null/signal=SIGKILL. The source-bound COMMIT receipt and independent complete new SQL cut support actual success, rather than expected wall-clock timing alone.

|      Parent order | Evidence / observed action                                                                                                                                        |
| ----------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|                48 | `R2/raw/reader-4-2.json`: fresh post-exit Reader, exact committed head-2 cut.                                                                                     |
| 58 → 59 → 60 → 61 | `R2/raw/recovery-5-2.json` through `-5.json`: new PID **3808**/nonce/connection obtains Owner, reads authority, restores Provenance/history, then fences epoch 2. |
|      64 → 65 → 66 | `R2/raw/recovery-5-7.json` through `-9.json`: receipt reconciliation, actual Core stable duplicate, independent ACK eligibility.                                  |
|                71 | `R2/raw/reader-6-2.json`: another independent process confirms canonical E1, exact full state/history/Cursor and no extra business commit.                        |
|      78 → 79 → 82 | publication.json → fixture-ack.json → recovery Owner release receipt: publication/ACK occurs after verified recovery and before release.                          |

The original business receipt binds **epoch 1 / f8b480f7-26d3-42e3-b2fe-59bc1ebf602d**; current Writer uses **epoch 2 / a61235ea-fe6b-4d1d-bb42-85352d899644**. Same operation/intent/canonical stable source claim is reconciled without reusing old authority. C1/C2 records, original Assertions/Provenance and UNIT-1 Cursor coverage remain exact. No alias event or duplicate business effect is added.

The ACK's recorded order **79** is after the actual original exit **44**, recovery, reconciliation and fresh SQL confirmation. It is an external synthetic fixture ACK file with sqliteAtomic=false, **not real Adapter transport ACK** and not atomic with COMMIT. Recorded kill/exit times 07:49:38.853Z / 07:49:38.858Z are descriptive, not the ordering proof.

## 8. R3 — untrusted recovery data: PASS WITH LIMITATION

Five independently backed-up copies are mutated; their intact source is preserved. The following indexes are under R3/raw. Every attempted recovery returns unavailable before restored/new fence/publication/ACK; all failure decision permissions are false.

| Variant             | Exact observed fault                                                  | Mutation receipt  | Reader / raw error                                   | Recovery error receipt                     | Independent result                                         |
| ------------------- | --------------------------------------------------------------------- | ----------------- | ---------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| event_missing       | events empty, remaining canonical Dedup reference points to absent E1 | `fault-5-4.json`  | `reader-6-2.json`; FK failure dedup → events         | `recovery-7-4.json`, RECOVERY_UNAVAILABLE  | PASS WITH LIMITATION                                       |
| correction_missing  | seq-1 Correction history removed while later images/Snapshots remain  | `fault-8-4.json`  | `reader-9-2.json`                                    | `recovery-10-4.json`, RECOVERY_UNAVAILABLE | PASS WITH LIMITATION; Snapshot does not hide history loss. |
| cursor_ahead        | checkpoints.seq=3 with ledger head 2                                  | `fault-11-4.json` | `reader-12-2.json`; FK failure checkpoints → commits | `recovery-13-4.json`, RECOVERY_UNAVAILABLE | PASS WITH LIMITATION                                       |
| foreign_fingerprint | fixture_meta.fingerprint=unsupported, binding/source unchanged        | `fault-14-4.json` | `reader-15-2.json`                                   | `recovery-16-4.json`, RECOVERY_UNAVAILABLE | PASS WITH LIMITATION                                       |
| unreadable          | first 100 main-file bytes are 0x58 in fresh copy                      | `fault-17-4.json` | `reader-18-2.json`, SQLITE_NOTADB                    | `recovery-19-3.json`, SQLITE_NOTADB        | PASS WITH LIMITATION                                       |

All non-target rows were independently compared with the expected complete committed copy. The event_missing/cursor_ahead Readers preserve the full cut and actual foreign_key_check failure, with healthy=false; these are deliberate failed-authority observations, not healthy recovery claims. Non-FK corruption is still rejected by full semantic/history/binding comparison. `R3/raw/reader-20-2.json` at **243** confirms the original source cut remains unchanged after all faults.

These are **controlled data faults**, not actual disk failure, filesystem IOERR or power loss. Neither Snapshot availability nor SQLite integrity_check=ok overrides missing/contradictory APV authority.

## 9. Inventory, errors, lifecycle and CMD verification

All **1,640/1,640** Inventory entries match actual relative filenames, byte lengths and SHA256. No indexed file is missing, no unindexed in-scope file appears, and evidence paths have no detected link/hardlink alias. Each original Inventory hash matches its seal:

| Case | inventory.json SHA256                                              |
| ---- | ------------------------------------------------------------------ |
| U1   | `c98878214439aca1a130d16f74620f0146e5bf0718ff8cd2b9b2c175221a8754` |
| U2   | `a28e1fd99a23ac9872471e591dcb0aa9bd5ec50090d9cf21645390c21f947820` |
| U4   | `7973779e4772c8373449289ec4696ff89eb38dc53709fc891b4ff473736e5a7a` |
| R1   | `dc67c5d0dee2a11253377eee4bcd1d3f4ee389445532dbc23f0c9bbe45978247` |
| R2   | `6ff06060c407305916563b9768995578f584c9b6481cc27c946a88e46069b908` |
| R3   | `eb407b62ee0543a7c0c46d0d81d9196ab4a718a3416af3fa1f764f36d0ed8d9d` |

Inventory/seal and the late CMD files are explicitly excluded from the first Inventory, not counted as missing. All six separate CMD inventories/seals bind cmd-stdout, cmd-stderr and cmd-exit to that run's original Inventory seal. Including these seven files per run yields **1,682 run-directory files**; the external capture has **33 files**, for **1,715 original files** checked unchanged before/after audit. Reading/hashing the retained DB/WAL/SHM bytes does not open SQLite.

All **68 normal Worker exits** have code 0/signal=null and confirmed data settlement before Owner release and final done/exit. The **two expected crashed Writers** have SIGKILL/code=null, matching their owned Barrier and kill protocol. No captureIncomplete, missing termination, unexpected process failure or missing bound receipt was observed.

Original error-before-settlement records total **14**: U1 1, U4 7, R3 6. Each retains raw error/stack, transaction flags and publication=false/ack=false, followed by bound settlement. U2/U4/R3 additionally retain their clearly labeled simulated post-success errors. Worker and CMD stderr files are empty because expected error paths are retained as structured raw receipts; emptiness does not mean no fault occurred.

| Case | External CMD exit | Internal Node exit | Built-in audit exit | Command/raw output binding |
| ---- | ----------------: | -----------------: | ------------------: | -------------------------- |
| U1   |                 0 |                  0 |                   0 | PASS                       |
| U2   |                 0 |                  0 |                   0 | PASS                       |
| U4   |                 0 |                  0 |                   0 | PASS                       |
| R1   |                 0 |                  0 |                   0 | PASS                       |
| R2   |                 0 |                  0 |                   0 | PASS                       |
| R3   |                 0 |                  0 |                   0 | PASS                       |

For every Case, CMD/Case.command.txt records exactly `call experiments\phase-2-sqlite-recovery-spike\run.cmd Case --execute`; external stdout contains the matching reservation RunId/root, the exact internal Node output, Node/Audit exit markers, and built-in report with the same Case/RunId and recomputed counts. External exit and original cmd-exit are independently read as 0. Both stderr files are empty. External command/output/exit bytes were separately hashed and held unchanged during this audit. This validates the retained declared command and wrapper output attribution, not an independent OS argv/shell-history trace.

The recorded list/preflight/physical capture files are retained. Their three exit files are 0, stderr empty, and preflight metadata agrees with manifests/native bytes; no experiment execution is inferred from those preparation checks.

An exit 0 or built-in PASS was **not used as the protocol Oracle**. The conclusions above come from independent raw SQL, lifecycle, identity, mutation and causal-order comparisons. Hash seals establish retained-byte consistency, not signed protection against coordinated rewriting by the same OS user.

## 10. Acceptance subsets, pending properties and closure recommendation

Mapping uses the unchanged [production Acceptance](../acceptance/phase-2-storage.md), [Proposed design](../storage/phase-2.3-design.md) and [failure contract](../storage/phase-2.3-support-and-failure-contract.md). **These are observed disposable subsets, not production case PASS.**

| Existing clause            | Actual observed disposable subset                                                                                                         | Uncovered scope                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| S01                        | New-process PA/G1 full CoreState/acceptedEvents/Provenance/correction restoration in U1/U2/R1/R2.                                         | Production decoder/state/Host lifecycle.                                                                                            |
| S02                        | U1 after_assertions actual constraint error, confirmed rollback/close, complete old cut.                                                  | Every applicable barrier, control/maintenance and production paths.                                                                 |
| S03                        | R1 actual owned pre-COMMIT kill, fresh Reader and recovery.                                                                               | Other crash barriers; power loss.                                                                                                   |
| S04                        | R2 actual post-COMMIT/pre-fixture-ACK kill, new Owner/epoch, stable canonical retry and covered ACK.                                      | Actual source protocol and production integration.                                                                                  |
| S05                        | U2 known successful response loss, historical receipt under new epoch; U4 rejects untrusted/unsettled evidence.                           | Actual U3 I/O uncertainty, later business-head reconciliation, historical control attribution.                                      |
| S06/S07                    | U2/R2 matching stable alias invokes actual Core duplicate, canonical SQL remains unchanged.                                               | Real conflicting-claim ingestion and full namespace/decoder matrix; pure preparation conflict tests are not promoted here.          |
| S08/S09                    | One stable event, one committed complete UNIT-1 coverage vector retained across recovery/ACK.                                             | Missing identity, shared Cursor multi-event persistence, interrupted batch/gap/prior-position, late input, checkpoint-only commits. |
| S12                        | R3 absent event/history, Cursor ahead and unreadable authority return unavailable; source intact.                                         | Full corruption/provenance/backup/version matrix.                                                                                   |
| M01/M04                    | R3 unsupported fingerprint/unreadable controlled copies; U1 actual constraint and correctly labeled U2 simulation.                        | Schema migration, real permission/BUSY/FULL/IOERR/API/OS release paths.                                                             |
| P02/P08                    | U4 negative generation mismatch only.                                                                                                     | Positive cross-project/generation isolation, retired-generation/deletion/resume and Privacy admission.                              |
| O01-c; F07/F08/F10/F11/F12 | Actual new process/Owner/connection, restore before new epoch, old/new complete cuts, settlement-before-outcome and fail-closed recovery. | Full ownership/platform/control-uncertainty and release-failure gates.                                                              |

No S10/S11 tail replay/cache-repair matrix, new S13 race, quota/SQLITE_FULL P05, Retention/deletion, migration or full Host test was executed. Core/Phase 1 contracts were unchanged.

The following remain explicit:

- **U3 / true COMMIT I/O uncertainty / real native release failure: NOT TESTED.** U2 is controlled known success, and process kill is not a real COMMIT IOERR injection.
- **Hidden Owner loss, successful external replacement and final guard–COMMIT external race: NOT GUARANTEED.** Physical catalog/Driver-handle/lifetime safety is not proven by fixture metadata.
- **Production Storage recovery, Extension Host integration, actual Adapter ACK/resume and full S/P/M: NOT TESTED.** D-041–D-044 remain Proposed.
- **Missing identity, multi-event Cursor, positive generation isolation and conflicting durable claim paths: Partial Coverage / NOT TESTED for the missing runtime paths.** No missing-identity dedup algorithm or exactly-once promise follows.
- **Later business-head receipt reconciliation, old Snapshot plus tail, historical fencing COMMIT attribution, general decoder and control/maintenance crash sweeps: NOT TESTED.**
- **Power loss, physical disk fault and audit-time database reopening: NOT TESTED / UNVERIFIED as stated.**

No protocol violation or evidence mismatch was found in the six supplied runs. Recommend formal **Recovery Spike Closure Review** with the six PASS WITH LIMITATION results and these boundaries. Closure, Decision acceptance and production authorization require separate ChatGPT decisions; this audit does not perform them.

## 11. Change and verification record

Repository change: add `docs/spikes/sqlite-recovery-evidence-audit.md` only. No Harness, Core, Decision, acceptance, original evidence or earlier report was edited. No git add/commit/push, experiment rerun, database reopen or new experiment Worker was performed. The existing 40 pure/64 Core tests were not repeated.

All 1,715 original evidence/capture files and the checked pre-existing source/document bytes remain unchanged. The new report receives document/link/format and git diff whitespace checks separately; those checks do not change experimental results.
