# G2-S — Independent Evidence Audit

**Public-safe publication copy (2026-10-19).** The original private audit/review bytes are retained separately. Original SHA256: `22e20b9bf80a489cf80c84265a07d588e25e934f413d7a51c8563deccae791cc`. Machine prefixes below use `%APV_REPO%` (repository root), `%LOCALAPPDATA%` (original account's local app-data root), `%ProgramFiles%` and `%APV_CLANG_EXE%` (the recorded Clang executable), where applicable. These are publication aliases, not literal historical command bytes or newly observed paths. RunIds, build/binary fingerprints, results and limitations are unchanged. This copy is not a new execution authorization.

2026-10-19. **Overall: PASS WITH LIMITATION. Recommend formal closure of this narrow G2-S run; this report does not register CLOSED or authorize another experiment.**

Scope: controlled, pre-delegation WAL xSync refusal inside the bound COMMIT. Independent standard-library file/JSON checks rehashed the evidence and constructed literal complete SQL-image expectations without importing the Harness Audit/Oracle. No Worker, Driver, extension or SQLite connection was started; database bytes were read only for hashing. Runner success was not used as the protocol oracle.

## 1. Identity, script and CLI evidence

| Identity | Verified value |
| --- | --- |
| RunId | `ce2f0d63-c47e-4624-bc36-b46cf15e3cd8` |
| Native BuildId | `5e2b0f20-b2b6-4d45-afba-0de72a954587` |
| DLL SHA256 | `c9fc51e4863043f1d6313be78a6c719bc1411d275870edca5a7e6d579a25ea5d` |
| JS revision | `0afc00ee-a6b0-4b61-b466-86e7f89be8ad` |
| Worker SHA256 | `eec99a46f7bbd1d5121da8f23a7c7c611a148fe1e44b494bd82e338f850b6d5d` |
| RUN | `%LOCALAPPDATA%\Temp\apv-u3-vfs-g2\ce2f0d63-c47e-4624-bc36-b46cf15e3cd8` |
| CAP | `%LOCALAPPDATA%\Temp\apv-u3-vfs-g2s-cmd-b8904187-bb76-4620-a824-0846316dab44` |

Evidence references below are relative to RUN or CAP. RUN manifest source hashes match **19/19** current files; execution-package bindings match **8/8**; Native inputs match **7/7**. Captured/build DLL hashes agree. Node executable and Driver addon hashes match their manifests without loading either addon or extension. Recorded environment: Windows 11 x64, Node v24.21.0, better-sqlite3 13.0.3, runtime SQLite 3.53.4. Recorded NTFS/no-reparse path proof and current root file identity agree.

CAP preserves the complete 5,284-byte script as `script.source.cmd`; SHA256 **`5e93c94cd538e7602ca3a7f0bc4136a3bf4f04d2d7e29f929ee6486a98617e50`** matches its seal, capture-setup record, current script and RUN manifest. The exclusive lock says `G2-S only`. The script has one G2-S execution entry and no G2-W entry. Recorded invocation:

```cmd
call "%APV_REPO%\experiments\phase-2-sqlite-u3-vfs-g2-spike\run-g2s-once.cmd" --approved-g2s-once "%LOCALAPPDATA%\Temp\apv-u3-vfs-g2s-cmd-b8904187-bb76-4620-a824-0846316dab44"
```

`g2s.command.txt` records the actual Runner command:

```cmd
node experiments\phase-2-sqlite-u3-vfs-g2-spike\runner.cjs --run-g2 --execute --case G2-S --build-id 5e2b0f20-b2b6-4d45-afba-0de72a954587
```

Capture-setup, preflight, package-check, experiment and identity-query each have command/stdout/stderr/raw exit files: **five exits 0**, empty stderr. Preflight binds this exact execution package and build, with databaseOpens=0; package-check says EXPECTED_PACKAGE_OK. Script capture adds a sixth recorded status, `script.cmd-exit.txt`=0, and empty stderr. This is the caller CMD's immediate ERRORLEVEL after CALL; a separate outer CMD.exe process-termination exit was **not separately captured** and must not be counted as another independent status.

All six stdout files decode strictly as UTF-8. Their only non-ASCII character is U+2014 in the experiment result title. No malformed raw UTF-8 or corrupted text was found. Display-decoder mismatch is consistent with the reported garbling; the historical console codepage/display cause remains **UNVERIFIED**. Original bytes were not rewritten.

## 2. Native fault and COMMIT causality

`native-events.json` contains **251 contiguous events**, seq 1–251, overflow=0. The 219-event `native-before-cleanup.json` prefix exactly matches the final trace. Writer PID **20544**, thread **18732**, nonce `7a089aa0-59ce-4f26-a0a8-30c7656429ef`, operation nonce `85837d3d-6454-4c3a-a373-f93e4572d357`, PA/GEN-1/epoch 1 agree across manifest, specs and receipts.

Writer receipt 3 queries the actual target VFS: `apv_g2_fault_v1`, successful native query/file-control result. Effective configuration is WAL, PRAGMA synchronous=2 (**FULL**), wal_autocheckpoint=0. Receipt 9 records successful ARM, target autocommit=0, txn_state=2/WRITE, hitCount=0. The hash-bound BigInt boundary and unchanged Native INTEGER guard were accepted; there is no separate raw per-argument type dump.

| Native sequence | Raw observation |
| --- | --- |
| 1 / 40 | Main fileId=1 and WAL fileId=3 open; neither closes before the hit |
| 201 | Target COMMIT enters, connection `1C66BAEA010`, statement `1C66B9838E0`, serial=1, phase=40, txn_state=WRITE |
| 202–215 | Fourteen same-bound WAL xWrite calls succeed: rc=0, delegated=1, injected=0 |
| **216** | Same-bound WAL **xSync**, flags=2, rc=**1034**, injected=1, delegated=0 |
| 219 | Matching COMMIT PROFILE; txn_state=NONE; sampled extended-error value **0** |
| 220 / 249 / 251 | Target-close trace, WAL close rc=0, main close rc=0 |

The fault is within the target COMMIT trace window and matches connection, statement, serial, WRITE state, WAL/main file identity, PID/thread and one-shot policy. Native source binds SQLite's original WAL filename through `sqlite3_database_file_object()` to the target main object; raw pointer comparison operands are not separately dumped. This is source-plus-runtime evidence, not OS attestation. It excludes an unrelated sync/checkpoint as the injected operation.

Exactly **one** injected event exists; spent=1 and hitCount=1. SQLITE_IOERR_FSYNC is 1034. `ioSync` rejects before calling the underlying xSync: this proves a controlled VFS refusal, **not a failed Windows flush or disk fault**. Callback flags=2 are reported as recorded; they must not be confused with the separate PRAGMA FULL setting.

Totals include xOpen=3, xWrite=68, xSync=15, xClose=3 and SHM map/lock/barrier/unmap activity. Other nonzero returns are three xRead/522 startup short reads and 22 optional xFileControl/12 results. No second injection or unexpected additional fault was found. PROFILE's sampled 0 is preserved as a sampling limitation; it is neither replaced with 1034 nor treated as a successful COMMIT.

## 3. Driver error, settlement and process order

Writer receipt 11 preserves COMMIT's actual **error** return: `SQLITE_IOERR_FSYNC`, `disk I/O error`, complete stack including worker.cjs:339, transactionActive=false. Receipt 12's live target query records extendedError=**1034**, autocommit=**1**, txn_state=**0/NONE**; receipt 13 confirms inactivity. Thus PROFILE sampling and the later Driver/target state are distinct observations.

No explicit ROLLBACK was called: SQLite had already ended the transaction. Receipt 14 records close-return/open=false; Native closes succeed. Receipts 16–17 require process settlement, forbid replay/publish/ACK and finish the Worker. Writer exit is status=0, signal=null, error=null. These prove connection/process settlement; close alone does not prove durable outcome. Active-transaction rollback and secondary rollback/close failures were not exercised.

Parent PID **14848** records the observed Writer exit and completion in `writer-settlement.json`. Only afterward does its sequential spawnSync path preserve present files and create/start Reader PID **18692**, nonce `030b1355-2c8c-49a6-85f9-9779aa7336f6`. Reader spec contains the same settlement and Writer nonce; commands/specs/receipts/exits agree. Reader is a fresh process/connection, extensionLoaded=false, with the same main-file dev/ino identity. Its three receipts are contiguous and exit is status=0, signal=null, error=null. This causal dependency does not rely on cross-process wall-clock ordering. Scoped post-audit PID checks found all three absent; no broader claim about unrelated processes is made.

## 4. Independent complete SQL oracle

`reader.cut.json` has integrity=`ok`, no foreign-key errors, and all seven tables: control, event_ledger, assertions, history, snapshots, cursors, receipts. Independent literal reconstruction matches **every value of the complete seven-row baseline**, including Event/Assertion provenance, initial Correction History, RUNNING/UNVERIFIED snapshot, head/watermark=1 and Cursor unit/coverage=1. No candidate event, correction, snapshot, receipt or head/Cursor advance is present.

The retained seed receipt matches PA/GEN-1/epoch 1, `seed:<RunId>`, source-event-1, expectedBase=0, nonce `9ead5543-8bbc-4a6f-8042-a7eb41a1c5b7`, and independently recomputed digests:

| Digest | Baseline | Intended candidate |
| --- | --- | --- |
| Intent | `fa67bd714577b50311f7a110e5869ea5bba497bfe2e1c8cc462b8a8a35ab3181` | `347f37d91a6113342ab872e346ac4f4bbb334e40b8bfc7d81b397ff6804c968d` |
| Result | `d1cef7d5a640d20e504dec86da9acc8f1ec609255a9052d68dfb9985691bd426` | `e9f63a7078120740bd424554bbd9ed3457abf90ad1958013f705f89eda42e4a6` |
| State | `9045d4d864e3ecfa5eec872f655d77ab72ad2e3dd9a3dffef67fc5c88ccbaf22` | `99411e18d90c70abf5472c9b6737ce2b90277bd9fbf851d67251a282beb1ce5a` |

Candidate digests match the planned identity/image, not a durable candidate receipt. Reader-cut SHA256: `bfa62130c2b0c7654a324ce5a1c0bf34eba2f794d8386b759a94bae1e6b2a861`.

Settled Writer **plus healthy exact full baseline** supports **not_committed for this fixture**. Receipt absence alone and IOERR_FSYNC alone do not. No baseline loss, partial bundle or contradictory state is observed. All raw decisions prohibit replay/publish/ACK; no such operation is recorded. The source Oracle can distinguish exact before/after/unavailable images; only the before image was exercised here.

## 5. Integrity and preservation limits

RUN has **27 files**; Inventory **25/25** matches exact membership, sizes and SHA256, excluding only its own JSON and seal. Inventory seal: `2007ee4d4476a31a4b9650183e52941249b47eb952d494ccd08a11e163b0d326`. CAP has 27 files. All **20 receipts** (Writer 17, Reader 3) are contiguous and identity-bound; Worker commands, specs, exits, Native prefix and final trace agree.

Before Reader, `preserved-files.json` records the 32,768-byte main copy with SHA256 `23faf193bb3f20fdb15531482a5607297aa19d9ba47dce6a4185a2794737f4b1`; current main matches. Current sealed WAL is 0 bytes and SHM 32,768 bytes. Source preserves each present main/WAL/SHM/journal member after Writer exit, but does not emit explicit negative-presence records. Consequently this is not an error-time physical snapshot and does not prove sidecar creation/history independently. No database was reopened for this audit; SQL conclusions use the original runtime Reader cut.

File-level protection covers 154 originals across current evidence/capture, failed and successful W runs, current Harness/build, existing W reports, Decisions and acceptance; final sizes/hashes and seven directory memberships were rechecked unchanged. Audit-local verifier/baseline/results are separate workspace artifacts, not additions to RUN/CAP.

## 6. Verdict and bounded closure recommendation

| Area | Verdict | Boundary |
| --- | --- | --- |
| Native Fault | **PASS** | One bound COMMIT WAL xSync refusal, rc=1034 |
| Driver Error Propagation | **PASS WITH LIMITATION** | Original exception and later extended code agree; PROFILE sampled 0 |
| Transaction Settlement | **PASS WITH LIMITATION** | Auto-ended transaction, close and exit confirmed; explicit/failing rollback not exercised |
| Independent SQL Oracle | **PASS WITH LIMITATION** | Complete healthy baseline; runtime Reader only, this fixture/schedule |
| Evidence Integrity | **PASS WITH LIMITATION** | All hashes, script and identities match; physical-snapshot/outer-CMD/display limitations above |
| G2-S Overall | **PASS WITH LIMITATION** | Recommend narrow formal closure, awaiting ChatGPT approval |

**No actual evidence gap blocks that narrow closure.** The original ARM-failed W remains FAIL. Successful W `37653ca1-d3a7-41d6-87ca-f42a3466b738` remains CLOSED — PASS WITH LIMITATION; its report and original evidence are unchanged.

Together W/S demonstrate two one-shot, identity-bound Native COMMIT fault subcases: refusal before delegated WAL xWrite, and refusal before delegated WAL xSync after 14 successful WAL writes. Both propagate their specified extended errors (778/1034), settle the Writer, and produce an independently readable complete old image without ACK/publication/replay. They do **not** establish all sync errors roll back, partial-write/flush behavior, post-error committed/ambiguous outcomes, power-loss/kernel/disk faults, or production recovery guarantees.

Production P0 remains: real durable COMMIT uncertainty and safe settlement/reconciliation under actual I/O failure **NOT TESTED** (Support F11/B6; relevant S05/M04 conditions); real release failures **NOT TESTED** (B5); hidden Owner loss, successful replacement and Guard–COMMIT external race **NOT GUARANTEED**. Production catalog/open identity, fencing lifecycle, real Host/full Storage recovery/migration, missing identities/multi-event Cursor/generation lifecycle, privacy and retention remain unverified or partial under their existing gates. No production S/P/M item changes status, D-041–D-044 remain Proposed, Production Storage remains NOT AUTHORIZED, and true production U3 COMMIT uncertainty remains NOT TESTED. No further experiment or research is proposed by this audit.


## 7. Formal closure authorization — 2026-10-19

**G2-S — CLOSED — PASS WITH LIMITATION.** ChatGPT explicitly approved formal closure in the user's G2-S Closure & Git Checkpoint Scope Audit instruction. This supersedes only the approval-pending recommendation in this report. Closure applies exclusively to RunId `ce2f0d63-c47e-4624-bc36-b46cf15e3cd8`; sections 1–6, original evidence references and every limitation remain unchanged. No raw evidence, DLL or database was modified for this registration.

The closed observation is one controlled, pre-delegation WAL xSync refusal inside the bound COMMIT (Native seq 216, rc 1034), with Driver error propagation, observed automatic transaction termination/connection closure, Writer exit and subsequent independent complete SQL reconciliation. The fixture's healthy complete old image supports its not_committed result only. PROFILE sampling, absent per-argument type dumps, sidecar preservation, runtime-only Reader, display/outer-CMD provenance and unexercised cleanup-failure limits remain in force. This is not a real physical I/O failure or uncertain durable COMMIT result.

### Bounded conclusion of the controlled VFS branch

| Closed component | Verified scope |
| --- | --- |
| [G1](sqlite-u3-vfs-g1-evidence-audit.md) | Actual custom VFS selection and no-fault WAL write/sync observations, normal commit/reopen and independent SQL comparison, within its retained limitations |
| [G2-W](sqlite-u3-vfs-g2-w-patched-evidence-audit.md), RunId `37653ca1-d3a7-41d6-87ca-f42a3466b738` | One bound COMMIT WAL xWrite denial before delegation, error 778, observed settlement/exit and independent full old-cut reconciliation |
| G2-S, this report | One bound COMMIT WAL xSync denial before delegation after 14 successful WAL writes, error 1034, observed settlement/exit and independent full old-cut reconciliation |

The three components are **CLOSED — PASS WITH LIMITATION** in these controlled scopes. Both fault fixtures observed not_committed, without replay, successful publication or source ACK; this does not prescribe the outcome of other write/sync failures. The [original ARM-failed G2-W](sqlite-u3-vfs-g2-w-failed-writer-forensic-audit.md), RunId `9ea19414-93a0-44f7-b164-4fe4ce3bddbd`, remains permanently **FAIL** and is not replaced by the later runs.

Real disk faults/power loss, uncertain outcomes after partial persistence, true production U3 reconciliation and B5/B6 remain NOT TESTED or otherwise unresolved under the existing Support/Failure Contract. Hidden Owner loss, successful external file replacement and Guard–COMMIT external races remain NOT GUARANTEED. Full production Storage/Extension Host and the other Production P0 gates remain outside this closure. D-041–D-044 remain Proposed; production S/P/M acceptance is unchanged; production implementation is not authorized. This concludes the controlled VFS branch without proposing or authorizing further SQLite fault experiments.

## Public script provenance

The historical `run-g2s-once.cmd` and CAP/script.source.cmd remain private originals, SHA256 `5e93c94cd538e7602ca3a7f0bc4136a3bf4f04d2d7e29f929ee6486a98617e50`. The invocation above uses publication aliases; its exact original bytes remain in CAP. The [public template](../../experiments/phase-2-sqlite-u3-vfs-g2-spike/run-g2s-public-template.cmd.example) is a separately named, never-executed publication artifact. Its hash must not be substituted for the historical script hash, and it is not evidence of another run.
