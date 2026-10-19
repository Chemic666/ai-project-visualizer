# U3 G2 — Minimal Controlled Native VFS Fault Preparation

**Public-safe publication copy (2026-10-19).** The original private preparation document bytes are retained separately. Original SHA256: `bb6eb14edd3ff8bdca6556aac5cde531906917cfd20cc42a0addcf9251ee812a`. Machine prefixes below use `%APV_REPO%` (repository root), `%LOCALAPPDATA%` (original account's local app-data root), `%ProgramFiles%` and `%APV_CLANG_EXE%` (the recorded Clang executable), where applicable. These are publication aliases, not literal historical command bytes or newly observed paths. RunIds, build/binary fingerprints, results and limitations are unchanged. This copy is not a new execution authorization.

Status after the recorded Windows run: **G2-W FAIL — ARM admission; targeted I/O injection NOT TESTED. G2-S BLOCKED. Execution READY REVOKED.** The 2026-10-19 JS fix below is prepared for review; no new Windows G2 execution is authorized. G1 is CLOSED — PASS WITH LIMITATION; its original DLL, run, evidence and audit-time limits are retained. No G1 code or evidence is imported/executed by G2.

This separate disposable Harness prepares only **G2-W** and **G2-S**. It is not production Storage and does not qualify real disk faults or U3 production unknown-COMMIT handling. No actual outcome is preselected; a healthy complete old or new cut can be legitimate evidence after a controlled fault. Mixed/unreadable authority is unavailable, never assumed not committed.

## Build identity and preparation evidence

G0 native build: **BUILD PASS** (2026-10-16). BuildId: `5e2b0f20-b2b6-4d45-afba-0de72a954587`. DLL: `build/5e2b0f20-b2b6-4d45-afba-0de72a954587/apv_g2_vfs.dll`. SHA256: `c9fc51e4863043f1d6313be78a6c719bc1411d275870edca5a7e6d579a25ea5d`. Seven native inputs and successful compiler/PE exits are retained in that build directory. Historical preparation checks were JS **54/54 PASS** and native policy **20/20 PASS**; they did not exercise the Driver/ARM type boundary. The later run failed before arming. This task neither reruns those checks nor rebuilds/loads the DLL.

### JS ARM-boundary revision (2026-10-19)

The failed RunId `9ea19414-93a0-44f7-b164-4fe4ce3bddbd` remains unchanged. See `docs/spikes/sqlite-u3-vfs-g2-w-failed-writer-forensic-audit.md` for its original evidence. It must never be replayed or relabeled as an injected fault.

Runner supplies JSON Number epoch 1; `makeCuts` preserves that identity in business bodies/digests. Only the Worker ARM-call argument is converted to BigInt, after safe-integer validation. Current Native scope permits **only 1 / 1n**, not arbitrary nonnegative or signed-64-bit epochs. Unsafe/fractional/negative/nonnumeric values, 0 and other epochs are refused before preparing native SQL. Native's strict INTEGER/value guard is unchanged.

An ARM exception is recorded before diagnostic SQL/cleanup; available Driver transaction/autocommit observations, native status/info and before/after native trace exports are retained best-effort. Unconfigured native status does not establish the target's txn_state; Driver inTransaction cannot distinguish NONE/READ/WRITE. Diagnostic reads do not substitute for the original error/extended error. An active or unobserved transaction triggers one explicit rollback attempt; target and monitor closes are separately attempted. All secondary errors remain separate from the original thrown exception. Failed receipt writes cannot guarantee complete diagnostics, but never suppress cleanup or replace the original exception.

ARM failure remains `unavailable`, with ACK/publication/replay false and a failed Writer exit. No successful ARM, fault hit, worker-complete or Reader is manufactured. Successful rollback/close API observations do not prove persistent contents.

`execution-package.json` pins a **new JS revision** and the eight runtime source hashes, Worker SHA256 and unchanged Native BuildId/DLL SHA256. Preflight checks current JS hashes; Runner captures this package exclusively in each fresh run and binds it in Manifest/specs. Worker checks it before opening SQLite and records it in worker-start; file-only Audit compares the captured package and identities, never today's code against an old run. Original build manifests are untouched. Older evidence requires its original recorded Harness; no current package identity is inserted into old records.

Targeted tests use the installed better-sqlite3 13.0.3 / SQLite 3.53.4 in **memory only**, without loadExtension or a Runner/Worker process. `typeof(?)` independently observes Number 1 = real and BigInt 1n = integer. Full native arming and G2-W/G2-S fault behavior remain **NOT TESTED** for this revision. Rollback/close failure branches use explicit unit doubles, not physical failures or VFS injection. The staged fix must be applied and its identities reviewed before requesting a new execution gate; all execution commands below remain unauthorized templates.

Build identity is recorded after the actual native build below. Never reuse either historical G1 BuildId in this directory. Native forwarding was copied from G1 source SHA256 `f797b2f7584610872fd5a60dc2817fbb0343ed816c601b4f50e7064e40d070c9`; only this separate copy adds faults/trace/state functions. No Driver source or system installation changes.

The build uses existing Clang/MinGW and llvm-readobj, warnings-as-errors. Seven hashed native inputs are C source, fault_policy.h, sqlite3.h, sqlite3ext.h, binding.gyp, defines.gypi and package.json. Build records also bind compiler/inspector/Node/addon SHA256, flags, raw stdout/stderr/exits and PE AMD64/import/export data. Compilation/PE inspection do not load the DLL. Default build invocation prints help; actual build requires explicit `--build --compiler ABSOLUTE_CLANG_EXE`.

## Exact fault admission

Both modes are disabled until a target-connection SQL `apv_g2_arm(...)` validates the exact fresh RunId/Worker nonce/operation nonce/operationId/intent digest, fixed PA/GEN-1/epoch 1 scope, target filename and active WRITE transaction. Native path must equal `%USERPROFILE%\AppData\Local\Temp\apv-u3-vfs-g2\<RunId>\target.sqlite`; arbitrary DB paths, malformed IDs, wrong SQLite VFS/file objects and re-arming are refused. Parent/Worker additionally enforce physical NTFS/reparse/alias/single-link admission and hashes before opening/arming.

The real target connection installs `sqlite3_trace_v2(STMT|PROFILE|CLOSE)`. A real STMT callback whose native sqlite3_sql text is exactly COMMIT (optional whitespace/semicolon) sets the active native statement pointer/serial. PROFILE for that same statement ends its window; CLOSE clears the retained connection pointer fail-closed. A CLOSE notification is not itself proof of successful handle release; targetPointerRetained describes our pointer, not physical connection closure. No JS phase flag or absolute callback count can authorize injection.

Within that first native COMMIT only, every additional condition must hold: correct case/method; SQLITE_OPEN_WAL file kind; original WAL filename's database path matches the target; `sqlite3_database_file_object(originalWalFilename)` equals the main sqlite3_file obtained from **that connection** through SQLITE_FCNTL_FILE_POINTER; native sqlite3_txn_state is WRITE; PID/thread match; armed and not spent. Calling database_file_object is confined to original WAL filenames from xOpen, its documented valid input. No copied/plain path string is passed to that API.

| Scenario | First precisely matching callback                | Injected native result    | Delegation on hit               |
| -------- | ------------------------------------------------ | ------------------------- | ------------------------------- |
| G2-W     | WAL xWrite inside the bound native COMMIT window | SQLITE_IOERR_WRITE = 778  | denied before underlying xWrite |
| G2-S     | WAL xSync inside the bound native COMMIT window  | SQLITE_IOERR_FSYNC = 1034 | denied before underlying xSync  |

The spent bit is set before returning the fault. All other callbacks transparently delegate; rollback/close never re-arm it. Native events mark injected=1/delegated=0 and carry callback/file/main-file/connection/statement identity, SQL text, native rc, transaction state, phase/commit serial, PID/thread, offset/length/flags. Failure to hit exactly once yields NOT TESTED or rejection, never a successful injection claim. Trace overflow, missing PROFILE, wrong connection/name/phase or error mismatch rejects the evidence. Cache spill, schema commits, checkpoint and close I/O cannot qualify. Automatic checkpointing is explicitly disabled; WAL/FULL/auto-checkpoint settings are read back and recorded.

These are **controlled native VFS denials before delegation**, exercising SQLite's actual COMMIT error path. They do not claim partial OS writes, a failed Windows FlushFileBuffers, physical disk faults, or durable-result uncertainty under real hardware failure. No arbitrary JS error is recoded as IOERR. The new callback/trace/file-object binding is compiled/prepared, not yet demonstrated at runtime; if it cannot match, stop as NOT TESTED/BLOCKED rather than weaken admission.

## Error, settlement and recovery protocol

1. Isolated Writer loads the exact copied new DLL on an in-memory bootstrap; native target-VFS query verifies the real target, then bootstrap closes **after target open**. A separate in-memory monitor remains for diagnostic queries in the same SQLite instance. No Driver/SQLite replacement occurs.
2. Create seven synthetic tables and commit the baseline bundle without arming faults. Begin candidate WRITE transaction; insert its complete Event/Assertions/History/Snapshot/Cursor/receipt changes and control head; record active transaction and candidate identity; arm once.
3. Record COMMIT entry, call actual `db.exec("COMMIT")`, immediately preserve original SqliteError code/message/stack and `db.inTransaction` before target SQL cleanup. No transaction helper can replace the original error.
4. Query native diagnostics on the **separate in-memory monitor**, not the suspect target. Native getters observe the live target's sqlite3_extended_errcode, get_autocommit and txn_state without preparing another target statement. Preserve that numeric error and the pre-cleanup trace. PROFILE's observed error is separately labeled; it never substitutes for the original JS error or monitor getter.
5. If still active, attempt one explicit ROLLBACK, recording its outcome/activity/error separately. Inactive means activity ended, not that the business operation committed. Attempt close; preserve any close failure and quarantine from all further business writes. A JS open=false flag or receipt alone is not native release proof.
6. Writer finishes and the parent waits for the actual owned spawnSync process exit. Only bound PID/nonce, successful returned lifecycle and worker-complete authorize the next stage. An active/hung/unbound Writer blocks the Reader; no timeout, forced kill or retry pretends to settle it. Process exit prevents that process's later COMMIT but does not determine persisted outcome.
7. After confirmed exit, exclusively copy **all present** target DB/WAL/SHM/journal files to preserved-before-reader, record present membership/identity/bytes/hashes, then start a new uninjected Reader process/connection. This settled full file set preserves pre-Reader bytes; it is not a main-file-only backup or an atomic copy of an active transaction. Error-time trace precedes rollback/close, but no claim is made of a physical DB snapshot before SQLite's own automatic error cleanup.
8. Reader takes one BEGIN cut, integrity/FK checks and ordered full seven-table rows. Reader failures remain raw unavailable evidence. No original closed-Spike DB is opened. The new working disposable DB's sidecars may change during recovery; preserved files are never reopened.

## Complete-cut Oracle and permissions

`fixture.cjs` pins old and new images from manifest-bound PA/GEN-1/epoch, RunId and nonces. The synthetic schema contains control, event_ledger, assertions, history, snapshots, cursors and receipts. JSON bodies preserve stable source identity, previous Assertion/correction references and Provenance; Snapshot state/digest/watermark and Cursor complete coverage match the ledger. COMPLETED remains verification UNVERIFIED. These are synthetic records, not the Phase 1 Core or production storage schema.

Candidate receipt carries operationId, operation nonce, original epoch/generation/project, stable input/expected base, intent digest, result digest over all business tables, and state digest. The Oracle compares every table/row/value including unchanged baseline history, plus integrity/FK results. Only **settled healthy exact old cut** confirms not_committed; receipt absence by itself does not. Exact full new cut confirms committed in this fixture; contradictory nonce/epoch/intent/state/result/body/cursor/snapshot or missing authority gives unavailable. Unsettled or unreadable also gives unavailable. Expected images are source-pinned, not reconstructed from the Writer's returned business result. A later independent original-evidence audit is still required.

`decision` always records replay=false, publish=false, ack=false. A proven old cut may support a later separately reviewed retry decision, but this Harness never retries. This synthetic source has no transport ACK protocol or production owner capability, so neither a receipt nor even a proven committed cut authorizes a real source ACK/publication. External ACK cannot be atomic with SQLite COMMIT.

## Evidence and execution gates

`runner.cjs` defaults to help. One explicit invocation runs exactly one case, fresh RunId, sequential Writer then Reader. No aggregate execution, automatic retry, deletion or evidence overwrite exists. All evidence uses wx/COPYFILE_EXCL/mkdir exclusion in a new local NTFS TEMP root. Original failure logs are retained; first Worker/identity failure stops. Two Worker identities do not count compiler or physical-path helper processes.

Records include source/build/addon hashes, manifest, commands/specs, PID/nonces/receipts/exits, actual target VFS query, effective configuration, native before-cleanup and final traces, original/cleanup errors, actual settlement, pre-Reader full file set, independent SQL cut, reconciliation, recursive Inventory with SHA256 seal and failure/result. `audit.cjs` has a file-only CLI checking Inventory and fault/identity/full-cut evidence; it does not import a Driver or spawn Workers. Runner output is provisional, never final acceptance.

### Safe inspection now — no experiment/DLL/DB

```cmd
cd /d %APV_REPO%
node experiments\phase-2-sqlite-u3-vfs-g2-spike\runner.cjs --list
set "APV_LIST_RC=%ERRORLEVEL%"
echo %APV_LIST_RC%
```

Read-only preflight, after substituting the actual new BuildId recorded below, may also be used during the future Gate Review:

```cmd
node experiments\phase-2-sqlite-u3-vfs-g2-spike\runner.cjs --preflight --build-id 5e2b0f20-b2b6-4d45-afba-0de72a954587
set "APV_PREFLIGHT_RC=%ERRORLEVEL%"
echo %APV_PREFLIGHT_RC%
```

### Future Windows execution — requires separate authorization

Do **not** execute this block during preparation. Select one approved case per top-level command; use another new capture directory for the other case if separately authorized. Stop if preflight is nonzero. These commands run directly in CMD, not inside an enclosing parenthesized block, so ERRORLEVEL expansion is current.

```cmd
cd /d %APV_REPO%
set "APV_G2_CAPTURE="
for /f %I in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString()"') do set "APV_G2_CAPTURE=%USERPROFILE%\AppData\Local\Temp\apv-u3-vfs-g2-cmd-%I"
mkdir "%APV_G2_CAPTURE%"
if errorlevel 1 exit /b 1
set "APV_G2_CASE=G2-W"
> "%APV_G2_CAPTURE%\preflight.command.txt" echo node experiments\phase-2-sqlite-u3-vfs-g2-spike\runner.cjs --preflight --build-id 5e2b0f20-b2b6-4d45-afba-0de72a954587
node experiments\phase-2-sqlite-u3-vfs-g2-spike\runner.cjs --preflight --build-id 5e2b0f20-b2b6-4d45-afba-0de72a954587 > "%APV_G2_CAPTURE%\preflight.stdout.txt" 2> "%APV_G2_CAPTURE%\preflight.stderr.txt"
set "APV_PREFLIGHT_RC=%ERRORLEVEL%"
> "%APV_G2_CAPTURE%\preflight.cmd-exit.txt" echo %APV_PREFLIGHT_RC%
```

Only after separately authorized execution and successful preflight, run once with APV_G2_CASE=G2-W **or** G2-S:

```cmd
if not "%APV_PREFLIGHT_RC%"=="0" exit /b %APV_PREFLIGHT_RC%
if exist "%APV_G2_CAPTURE%\g2.command.txt" exit /b 1
> "%APV_G2_CAPTURE%\g2.command.txt" echo node experiments\phase-2-sqlite-u3-vfs-g2-spike\runner.cjs --run-g2 --execute --case %APV_G2_CASE% --build-id 5e2b0f20-b2b6-4d45-afba-0de72a954587
node experiments\phase-2-sqlite-u3-vfs-g2-spike\runner.cjs --run-g2 --execute --case %APV_G2_CASE% --build-id 5e2b0f20-b2b6-4d45-afba-0de72a954587 > "%APV_G2_CAPTURE%\g2.stdout.txt" 2> "%APV_G2_CAPTURE%\g2.stderr.txt"
set "APV_G2_RC=%ERRORLEVEL%"
> "%APV_G2_CAPTURE%\g2.cmd-exit.txt" echo %APV_G2_RC%
findstr /c:"runId" /c:"evidenceRoot" "%APV_G2_CAPTURE%\g2.stdout.txt" > "%APV_G2_CAPTURE%\identity-query.txt"
```

The direct Node process exit is this top-level CMD command's captured code. No separate wrapper code is inferred. Keep original output even if failure; do not retry. After the run, `node experiments\phase-2-sqlite-u3-vfs-g2-spike\audit.cjs --audit ACTUAL_RUN_ID` is file-only; redirect command/stdout/stderr and immediately save its ERRORLEVEL with redirection **before echo** in this separate CMD capture directory. Do not add files inside the sealed RUN directory.

## Targeted preparation checks and remaining limits

JS pure tests cover exact disabled/admission flags, native evidence identity/window/method/one-shot rejection, actual fixture full-cut/digest/receipt mismatch and unsettled/unreadable refusal. Native policy pure checks use a separate tiny executable with **no SQLite/Driver/DLL**, exercising all admission booleans, spent state and exact COMMIT text. Native compilation/PE, JS/PowerShell syntax, formatting, links, file sets and preserved-history hashes are separate from runtime qualification. No Core/Recovery/G1 tests or experiments need rerun.

Native trace delivery on a failed COMMIT, WAL-to-main file object equality, one-shot runtime hit, error propagation/extended getters, auto-rollback/close, full-cut reconciliation and preservation under actual G2 failure are **NOT TESTED**. If runtime identity/PROFILE/error evidence cannot be obtained, stop and request review; never weaken native admission or replace missing raw evidence with constants.

Production F11/B5/B6, actual COMMIT I/O uncertainty, hidden lock loss/replacement/Guard–COMMIT races, real Host, migration, Privacy/Retention, identity/Cursor paths and full S/P/M remain unverified. Related production subconditions are S02 (rollback), S05 (outcome reconciliation), S12 (untrusted authority), M04 (injected vs actual faults), P05 (capacity/unknown outcome separately) and O01/O02 (ownership/support); no status changes. D-041–D-044 remain Proposed; production Storage remains unauthorized.

Official API basis: [trace callback registration](https://www.sqlite.org/c3ref/trace_v2.html), [STMT/PROFILE/CLOSE timing](https://www.sqlite.org/c3ref/c_trace.html), [WAL-to-main file identity and valid pointer inputs](https://www.sqlite.org/c3ref/database_file_object.html), [autocommit after errors](https://www.sqlite.org/c3ref/get_autocommit.html), [transaction error handling](https://www.sqlite.org/lang_transaction.html). This is an implementation inference from official contracts; the unexecuted new integration is not an observed runtime result.

## Public checkpoint and historical script

The executed `run-g2s-once.cmd` remains a private excluded original (SHA256 `5e93c94cd538e7602ca3a7f0bc4136a3bf4f04d2d7e29f929ee6486a98617e50`). [run-g2s-public-template.cmd.example](run-g2s-public-template.cmd.example) is a separately named, never-executed template; it derives the repository root from its location and does not inherit that historical hash or execution authorization. Do not rerun the closed Spikes.

This README is a public-safe revision of the historical preparation text. Historical RUN manifests keep their original README/source hashes; publication changes do not update them. The eight bound runtime sources and Native inputs are unchanged. G1/G2-W/G2-S closure and limits are recorded in the [audits and bounded conclusion](../../docs/spikes/sqlite-u3-vfs-g2-s-evidence-audit.md#7-formal-closure-authorization--2026-10-19); true production U3 remains NOT TESTED.
