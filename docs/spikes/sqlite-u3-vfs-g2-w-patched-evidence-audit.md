# G2-W Patched Run — Independent Evidence Audit

**Public-safe publication copy (2026-10-19).** The original private audit/review bytes are retained separately. Original SHA256: `0cd4fd5454035d943e64e93984418467bc1fa3d4b3c5bb720fa2dc299323f4e7`. Machine prefixes below use `%APV_REPO%` (repository root), `%LOCALAPPDATA%` (original account's local app-data root), `%ProgramFiles%` and `%APV_CLANG_EXE%` (the recorded Clang executable), where applicable. These are publication aliases, not literal historical command bytes or newly observed paths. RunIds, build/binary fingerprints, results and limitations are unchanged. This copy is not a new execution authorization.

2026-10-19. **Overall: PASS WITH LIMITATION. Closure recommendation only; not a CLOSED registration or G2-S execution authorization.**

Scope: one controlled Native VFS denial of the first matching WAL xWrite in the bound candidate COMMIT. This audit used independent standard-library file/JSON checks and literal SQL-image expectations. It did not call the Harness Audit/Oracle, load a Driver/DLL, start Workers, rerun tests, or open any SQLite database. Binary files were read only for hashes.

## 1. Identity, CMD and file integrity

| Identity | Verified value |
| --- | --- |
| RunId | `37653ca1-d3a7-41d6-87ca-f42a3466b738` |
| JS revision | `0afc00ee-a6b0-4b61-b466-86e7f89be8ad` |
| Worker SHA256 | `eec99a46f7bbd1d5121da8f23a7c7c611a148fe1e44b494bd82e338f850b6d5d` |
| Native BuildId | `5e2b0f20-b2b6-4d45-afba-0de72a954587` |
| DLL SHA256 | `c9fc51e4863043f1d6313be78a6c719bc1411d275870edca5a7e6d579a25ea5d` |
| RUN | `%LOCALAPPDATA%\Temp\apv-u3-vfs-g2\37653ca1-d3a7-41d6-87ca-f42a3466b738` |
| CMD | `%LOCALAPPDATA%\Temp\apv-u3-vfs-g2-cmd-a8315e5f-c308-495e-8d1a-a6ea6d4c9b86` |

RUN has **27 files**, including the pre-Reader preserved copy. Inventory **25/25** entries match membership, lengths and SHA256; the two exclusions are inventory.json and inventory.sha256. Inventory seal: `4694b95b0c085547685b082db25a4fe25ad079c712587f18d8a94dbcfcde9a3f`. All **18** Manifest source hashes, **8** execution-package source hashes and **7** Native inputs match. Captured and build DLLs match the authorized hash. Build object, copied package, Manifest, preflight and both Worker specs/start receipts agree. Package file SHA256 is `7768f648f4b27ba290a47611ac51257ba06d38d42f02ee73947fd5367913a7fd`.

Recorded environment: Windows 11/x64, Node v24.21.0, better-sqlite3 13.0.3, SQLite 3.53.4. Node executable/addon hashes and package version match the bound build; runtime Native receipts report SQLite 3.53.4. NTFS/non-reparse path proof and root dev/ino/link identity agree with current metadata.

CMD has **17 files**. preflight, package-check, g2w and identity-query each have command/stdout/stderr/exit captures: all four exit **0**, all four stderr files empty. preflight reports databaseOpens=0 and the correct package/build; package-check output is `EXPECTED_PACKAGE_OK`. G2 command is exactly the G2-W entry with the supplied BuildId. Its stdout's startup identity and final result match RUN files. Raw `script.cmd-exit.txt` is also **0**. No separate script.command/stdout/stderr or batch source was captured: complete outer-script provenance is **not independently verified**. Direct Node captures are not replaced by an inferred shell history. Runner result is corroboration, not this audit's Oracle.

## 2. Successful ARM and target COMMIT fault

Writer receipts are contiguous **1–17**; Reader receipts **1–3** (20 total). All bind RunId, role, PID, parent PID, nonce and the captured package.

- Writer seq 3 records the real target VFS `apv_g2_fault_v1`, successful native name query, exact target filename, PID/thread and API instance. Seq 6 records WAL, synchronous=2/FULL, wal_autocheckpoint=0.
- Seq 8 records an active candidate transaction; seq 9 records **armed=1, spent=0, hitCount=0, targetAutocommit=0, targetTxnState=2/WRITE**. The epoch is 1 within PA/GEN-1.
- The hash-bound Worker converts the validated safe Number at argument 7 to BigInt. The hash-bound Native arm returns success only after its unchanged `SQLITE_INTEGER` and value=1 guard, real target VFS/file-pointer and WRITE checks. This jointly demonstrates acceptance of INTEGER 1 through the BigInt path. There is no separate raw per-argument typeof/JS-type dump; JSON epoch 1 alone is not treated as type proof.

| Native seq | Actual observation |
| --- | --- |
| 1 / 40 | Successful main xOpen fileId=1 / WAL xOpen fileId=3; WAL flag present; neither file closed before injection. |
| 201 | STMT COMMIT entry, connection `21AFC4EEA10`, statement `21AFC5AE640`, serial=1, WRITE=2. |
| 202 | **Exactly one injected WAL xWrite**, fileId=3/mainFileId=1, phase=40, same connection/statement/serial, WRITE=2, 24 bytes at offset 86552, **rc=778**, injected=1/delegated=0. |
| 205 | Matching COMMIT PROFILE; transaction NONE=0. Its error sample is **0**, retained without substitution. |
| 206 / 235 / 237 | Target CLOSE trace / WAL xClose=0 / main xClose=0; final retained target pointer cleared. |

All **237 Native events** have contiguous sequence and Writer PID **13880**/thread **6384**, overflow=0. The pre-cleanup 205-event export exactly equals the final trace's first 205 events and the raw error-time state. Native hitCount=spent=1; no second injected event exists. Runtime file-object linkage is supported by mainFileId=1 and the bound native predicate that compares `sqlite3_database_file_object(originalWalFilename)` to the target's main file pointer; raw operand addresses are not separately exported. This is not attribution by callback count, filename or wall-clock order alone.

Observed totals: xOpen 3, xWrite 55, xSync 14, xClose 3. Besides the single 778, nonzero callback results are three startup/short xRead results 522 and 22 optional xFileControl results 12, matching bundled SQLite SHORT_READ/NOTFOUND definitions. No other nonzero callback result was found. SHM coordination is recorded through xShmMap/Lock/Barrier/Unmap, not fabricated as a separate SHM xWrite stream.

There is **no xSync inside this COMMIT window**. WAL sync at seq 210 occurs in close/cleanup at phase 0 after PROFILE; it is not G2-S or another COMMIT fault observation. The injected xWrite was denied before delegation: this is not evidence of a failed OS write, partial physical write or real disk fault.

## 3. Error propagation, settlement and lifecycle

Writer seq 11 preserves the actual COMMIT exception **SQLITE_IOERR_WRITE / disk I/O error**, full stack including worker.cjs:339, and transactionActive=false before cleanup. Seq 12's live-target diagnostic, queried through the separate monitor, records **extended error 778, autocommit=1, txn_state=NONE/0**, hitCount=spent=1. PROFILE sampled 0 earlier; that sample is not a COMMIT success result or a replacement for the later target error and Driver exception. Its differing observation time remains a diagnostic limitation.

**Explicit ROLLBACK was not called.** The conditional was skipped because SQLite had already ended the transaction; no rollback-enter/return is fabricated. Seq 13 confirms inactive/NONE, seq 14 records close returning open=false, and native WAL/main close callbacks return 0. These observations establish this connection's settlement; they do not alone establish durable business contents. Active-transaction explicit rollback and secondary cleanup-failure paths were not exercised in this run.

Parent PID **6288**; Writer **13880**, nonce `4f6059d9-83b7-49df-be5f-213b44ab6443`; Reader **10392**, nonce `d306e3cc-f689-4c28-a8ca-f74cecdcc1bc`. Both original exit records have status=0/signal=null/error=null and matching worker-complete receipts. Writer-settlement binds the actual Writer exit and nonce; Reader spec contains that same settlement and writerNonce. The source-pinned parent waits in spawnSync, records the Writer exit, preserves files, then creates/spawns Reader. This data dependency and process records establish ordering without cross-process wall-clock assumptions. All three recorded PIDs were absent in a scoped current check; no global process-census claim is made.

## 4. Independent Reader and complete persistence reconciliation

Reader is a distinct process/new connection with extensionLoaded=false. Its receipt, exit, command/spec and target dev/ino identity agree with Writer's final database identity. The source-pinned Reader takes BEGIN, integrity/FK checks and ordered SELECTs of all seven tables, commits/closes, then saves the cut. No reader-unavailable or close-error receipt exists. This audit parsed that runtime cut; it did not execute post-hoc SQL.

**All seven tables and all seven baseline rows match an independently constructed literal fixture image byte-for-byte:** control head=1; event-1; assertion-1 RUNNING/UNVERIFIED with provenance; initial history; Snapshot watermark 1 with matching state/digest; Cursor unit-1 covering event-1; original baseline receipt. Integrity is `["ok"]`, FK errors `[]`. Candidate event/assertion/history/snapshot/receipt and head/Cursor advancement are absent across the complete cut, not merely absent from receipt lookup.

Baseline nonce `0e571933-8962-4832-8757-55f9d0438d86`, PA/GEN-1/epoch 1, seed operationId and expectedBase=0 match Manifest. Independent JSON/SHA256 recomputation matches:

| Digest | Baseline receipt |
| --- | --- |
| Intent | `19b6da65ed39031c50143ec30361400780d4966b53c54ccc8fe82769f7b3ee7b` |
| Result over the six non-receipt tables | `c6a66c3cd355cf263a07099ee491c250332bfffa02dd5e2cebabf42aab7bf60e` |
| State | `9045d4d864e3ecfa5eec872f655d77ab72ad2e3dd9a3dffef67fc5c88ccbaf22` |

The intended candidate nonce `7d54e3ad-3488-4717-b9dd-58fb002908d0` and full intended identity/intent/result/state digests also match independent construction of the second event/correction image. They remain intended-operation metadata, not a persisted candidate receipt. Reader cut SHA256: `8a18f9343534f0fa0794bb4cddb91303169a8c2e4a28f5f56d355f5b479f68ca`.

**Fixture reconciliation: not_committed, based on settled Writer plus healthy exact complete baseline.** No mixed/partial bundle is observed. This is not a rule that missing receipt alone proves non-commit. Worker permissions receipt and result explicitly retain ack=false/publish=false/replay=false; source has no source-ACK/publication/replay operation. No duplicate application, successful candidate publication or blind replay is evidenced.

Pre-Reader preservation lists only the main file, 32,768 bytes. Its hash equals both the preserved copy and current main file: `efd2da6f98d5edb6d053b7adbb7952fcfcd8e0454b0757c91fc17a49e7090a4f`. The parent copies all members present after Writer exit; absent members are skipped without explicit negative-presence records. Current sealed RUN also contains a 0-byte WAL and 32,768-byte SHM after Reader. This is consistent with normal close/reopen coordination, but no separate Reader-native creation trace proves each sidecar's creation instant. No full pre-cleanup disk snapshot, physical-crash preservation or independently observed absence of every pre-Reader sidecar is claimed. All present main/WAL/SHM and preserved-copy bytes were hashed without SQLite opening them.

## 5. Verdicts, limitations and recommendation

| Area | Independent verdict |
| --- | --- |
| Native fault hit | **PASS** — one bound COMMIT WAL xWrite denial, native rc=778. |
| Error propagation | **PASS WITH LIMITATION** — original Driver error and live target 778 agree; PROFILE sample 0 is separately retained. |
| Transaction settlement | **PASS WITH LIMITATION** — automatic transaction termination, close and process exit observed; explicit rollback/failing cleanup not exercised. |
| Independent Reader | **PASS WITH LIMITATION** — full runtime seven-table baseline verified; no post-hoc reopen or physical-fault proof. |
| Evidence integrity | **PASS WITH LIMITATION** — Inventory/identities/sequences/hashes agree; full outer-script capture and explicit absent-sidecar records are missing. |
| G2-W overall | **PASS WITH LIMITATION** within this single controlled VFS-denial fixture. |

**Recommend formal closure of this narrow G2-W observation as PASS WITH LIMITATION, subject to ChatGPT approval.** The original RunId `9ea19414-93a0-44f7-b164-4fe4ce3bddbd` remains FAIL at ARM, with its own unchanged 10/10 Inventory/seal. This new run does not repair or replace old evidence.

The shared repaired ARM path has now succeeded, so **there is evidence to request a separate G2-S single-execution Gate/authorization**. G2-S remains BLOCKED / NOT TESTED until that approval; this audit does not establish xSync injection behavior or authorize execution.

Real U3 COMMIT I/O uncertainty, partial underlying writes, real disk/power/OS failure, active-transaction rollback after COMMIT error, cleanup API failures, hidden owner loss/replacement/Guard–COMMIT races, missing identities/multi-event Cursor/generation recovery paths, real Host and full production recovery remain unverified. Production Storage is unauthorized; D-041–D-044 and S/P/M statuses are unchanged. Passing this pre-delegation VFS denial must not be relabeled as resolving true unknown durable COMMIT results.

Only this audit report is added to the repository. Original evidence, closed-Spike data, Harness, Native build and acceptance/Decision files were not edited. Before/after size/hash and file-membership checks cover 98 guarded original files; report whitespace and git diff checks are separate from experiments. No rerun, DLL load, database connection, test, checkpoint, cleanup, add, commit or push occurred.

## 6. Formal closure authorization — 2026-10-19

**G2-W — CLOSED — PASS WITH LIMITATION.** ChatGPT explicitly approved formal closure in this conversation. This supersedes only the approval-pending recommendation above; the original audit findings and evidence references remain historical and unchanged.

Closure applies exclusively to RunId `37653ca1-d3a7-41d6-87ca-f42a3466b738`: one controlled Native VFS WAL xWrite denial before delegation, inside the bound candidate COMMIT. The original ARM-failed RunId `9ea19414-93a0-44f7-b164-4fe4ce3bddbd` remains permanently **FAIL**; it is neither replaced nor relabeled.

All limitations in sections 1–5 remain in force, including the PROFILE error-sample difference; absence of raw per-argument type dumps; fixture-only not_committed result; missing complete outer-CMD script capture; pre-Reader sidecar/preservation limits; unexercised explicit rollback/cleanup-failure paths; and the distinction between controlled pre-delegation denial and real disk/power/OS failure or genuine uncertain COMMIT I/O.

This authorization closes G2-W only. It neither closes U3 nor authorizes G2-S execution. A separate focused G2-S gate may be prepared, with committed/not_committed/unavailable decided from its own complete evidence. Production Storage remains unauthorized; D-041–D-044 stay Proposed and S/P/M production acceptance is unchanged. No raw evidence was changed or experiment repeated for closure.
