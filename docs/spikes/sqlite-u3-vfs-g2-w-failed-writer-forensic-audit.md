# G2-W Failed Writer — Read-only Forensic Audit

**Public-safe publication copy (2026-10-19).** The original private preparation document bytes are retained separately. Original SHA256: `1f41e82c51cb78822e4087437d586afbbe3d3d34c9c583f1c24feb22b51207a5`. Machine prefixes below use `%APV_REPO%` (repository root), `%LOCALAPPDATA%` (original account's local app-data root), `%ProgramFiles%` and `%APV_CLANG_EXE%` (the recorded Clang executable), where applicable. These are publication aliases, not literal historical command bytes or newly observed paths. RunIds, build/binary fingerprints, results and limitations are unchanged. This copy is not a new execution authorization.

**2026-10-16. Recommended G2-W disposition: FAIL. G2-S: BLOCKED.** This was a real executed run that failed before fault arming completed. It must not be recorded as an unstarted experiment or a successful injected COMMIT failure. No rerun is recommended or authorized.

This audit loaded no DLL/addon, opened no SQLite connection, ran no Harness or tests, and changed no original evidence. File bytes were read only for hashing; no database pages were interpreted. Independent standard-library parsing checked raw files rather than calling the Harness Audit/Oracle. Systematic debugging followed the recorded error to the Driver/native parameter boundary.

## 1. Identity and evidence integrity

| Item | Verified value |
| --- | --- |
| BuildId | `5e2b0f20-b2b6-4d45-afba-0de72a954587` |
| RunId | `9ea19414-93a0-44f7-b164-4fe4ce3bddbd` |
| RUN | `%LOCALAPPDATA%\Temp\apv-u3-vfs-g2\9ea19414-93a0-44f7-b164-4fe4ce3bddbd` |
| CMD | `%LOCALAPPDATA%\Temp\apv-u3-vfs-g2-cmd-934a92c3-59c3-44a5-ab5e-cf2649783179` |
| Parent / Writer PID | `9072` / `14476` |
| Writer nonce | `610b42bd-de96-4df5-aabf-df2cc03015ad` |
| Candidate operation nonce | `91d07b6b-2b7c-4a19-9f40-887cd1701180` |
| DLL SHA256 | `c9fc51e4863043f1d6313be78a6c719bc1411d275870edca5a7e6d579a25ea5d` |

RUN exists and has **12 files**. Its **10/10 Inventory entries** match actual membership, byte lengths and independently recomputed SHA256; only inventory.json and inventory.sha256 exclude themselves. Seal: `e324e8770aebf0c96ae4df23ef98a8e8eeb0ef618701e847487ee5779288a26f`. The failure bundle is correctly sealed; this does not make the intended experiment protocol complete.

Actual RUN members: `apv_g2_vfs.dll`, `failure.json`, `inventory.json`, `inventory.sha256`, `manifest.json`, `target.sqlite`, `writer.command.json`, `writer.exit.json`, `writer.receipts.jsonl`, `writer.spec.json`, `writer.stderr.txt`, `writer.stdout.txt`. Writer stdout is 0 bytes; stderr is 711 bytes. The exit record is `{pid:14476,status:1,signal:null,error:null}`.

Manifest/build/spec/command/receipt/exit identities agree. All **16** manifest source hashes and **7** native input hashes match current files. The RUN DLL and original build DLL match the authorized binary; Driver addon hash matches the build. Runtime receipts report Node v24.21.0/x64 and SQLite 3.53.4. The build manifest's preparation-time NOT TESTED wording is historical metadata, not evidence that this run never started.

CMD contains **9 files**. Preflight exit is raw `0\r\n`, stderr empty; G2-W exit is `1\r\n`. G2 stdout contains only the actual RunId/evidenceRoot startup JSON, with no final result. External G2 stderr points to Runner line 192. Worker stdout is empty; Worker stderr contains the original G2_ARM_REJECTED stack. Captured command text agrees with manifest argv and identifies G2-W/the supplied BuildId; it is shell capture, not a kernel-history attestation.

## 2. Exact failure stage and A–J findings

The nine Writer receipts are contiguous, PID/parent/nonce-bound, and end in **worker-error**, not worker-complete:

1. worker-start.
2. extension-loaded.
3. target-vfs-selected: actualVfsName=apv_g2_fault_v1, query status ok, fileControlRc=0, selectedShim=1; exact RUN target.sqlite.
4. bootstrap-closed-after-target-open.
5. diagnostic-monitor-selected: same API table `7FFD25140720`, PID 14476/thread 10528.
6. effective-config: WAL, synchronous=2/FULL, walAutoCheckpoint=0.
7. baseline-commit-return: transactionActive=false.
8. pre-injection-transaction: transactionActive=true, candidate identity/nonce/digests.
9. worker-error: code=SQLITE_ERROR, message=G2_ARM_REJECTED; stack at worker.cjs:206.

Thus baseline COMMIT returned; candidate DML reached the pre-arm boundary. The native arm call raised an error before Worker could record native-armed or call the candidate COMMIT. Sequence continuity proves the retained error stream is intact, not that successful completion occurred.

| Question | Evidence-based answer |
| --- | --- |
| A — COMMIT WAL xWrite hit? | **No target COMMIT reached.** Worker failed in the preceding SELECT apv_g2_arm call; the source enables the gate only on successful arm. This is not an injected COMMIT observation. |
| B — exactly one native 778? | **Not demonstrated; no injection receipt exists.** The source-bound pre-arm failure path does not enable the one-shot gate. No full Native Event export survives, so an independently enumerated callback/error count cannot be supplied. |
| C — Driver exception/extended error? | Raw SqliteError code is **SQLITE_ERROR**, message G2_ARM_REJECTED. No post-error numeric extended_errcode snapshot exists. Earlier native info extendedError=0 predates the failure and is not substituted for it. No SQLITE_IOERR_WRITE is recorded. |
| D — COMMIT return? | Baseline COMMIT returned with inactive transaction. **Candidate COMMIT was not invoked**, so it has no return/error result. The arm SELECT error is not a COMMIT error. |
| E — post-failure state? | Last observed candidate transactionActive=true is **before** arm. Post-error autocommit/txn_state are **UNVERIFIED**; no such receipt was emitted. |
| F — rollback/close? | The explicit Worker rollback/close block was not reached. Finalizer/process cleanup may have closed/rolled back resources, but no corresponding native release/rollback receipt exists. SQL outcome cannot be inferred from exit or missing sidecars. |
| G — expected injection exit or other exception? | The outer Worker catch preserved an **unexpected Harness/native admission error**, logged its stack and set process.exitCode=1. This is not normal completion of the expected injected-fault protocol. No native crash/forced-termination record is present. |
| H — Runner failure condition? | runner.cjs:191–192 throws when `r.error || r.status !== 0`. Here status=1, error=null, signal=null: the nonzero exit alone triggered the wrapper error. It is not an SQLite transaction verdict or a mistaken rejection of a successful fault test. |
| I — Reader/reconciliation? | **Not executed.** There is no reader spec/command/receipt/exit/cut, settlement file, preserved-before-reader copy or runner-result. No persistence reconciliation is claimed. |
| J — process lifecycle settled? | Worker-start PID/nonce plus original spawnSync exit record support **actual process exit with code 1**. Both recorded Writer and parent PIDs were absent in a scoped read-only process check. That corroborates current absence, not global absence of every unrelated process or proof of database contents. |

Runner writes the exit record before throwing, then writes failure.json and seals inventory in finally. It stops before the writer-settlement branch and before the Reader iteration. A missing writer-settlement.json therefore does not mean the OS process is still running; it means successful protocol settlement was not recorded. Process termination prevents this Writer from submitting later work, but does not independently prove its persisted cut.

## 3. Root cause: parameter storage-class mismatch before arming

**Classification: category 3 — injection not reached; Worker failed for another reason.** The raw rejection is directly observed. The specific storage-class mismatch below is a source-backed diagnosis, not an additional experiment or a recorded per-predicate native diagnostic.

Harness source locations below are under `experiments/phase-2-sqlite-u3-vfs-g2-spike/`; native source is `native/apv_vfs.c`. Driver/SQLite locations are under the installed `experiments/phase-2-sqlite-driver-spike/node_modules/.pnpm/better-sqlite3@13.0.3/node_modules/better-sqlite3/`.

- `worker.cjs:204–217` passes `candidate.epoch` directly as argument index 7 to `apv_g2_arm(?,?,?,?,?,?,?,?,?,?)`. The manifest/fixture epoch is the JS Number **1**, not BigInt. The candidate receipt in raw seq 8 agrees.
- better-sqlite3 `src/util/binder.cpp:74–75` routes through Data::BindValueFromJS. In `src/util/data.cpp:1–11,124–125`, **Number uses sqlite3_bind_double; BigInt uses sqlite3_bind_int64**. There is no CAST or numeric-affinity expression around this function argument.
- Native `apv_vfs.c:245–246` reads arguments and requires `sqlite3_value_type(a[7]) == SQLITE_INTEGER` as well as int64 value 1. A bound Number 1 is REAL/FLOAT, so numeric equality does not satisfy that storage-class check.
- The bundled SQLite 3.53.4 implementation preserves numeric flags during value-to-text conversion (`sqlite3.c:86086–86109,87137–87158`); `sqlite3_value_type` reports FLOAT also for FLOAT+TEXT (`93934–93946`). The preceding text-read loop does not turn this Number binding into INTEGER.
- Rejection occurs before setting g2Db/g2Main, installing COMMIT trace or setting armed=1 (`apv_vfs.c:254–259`). No candidate COMMIT or native injection can be attributed to this path.

This deterministic source-level incompatibility explains the observed G2_ARM_REJECTED. Native code emits the same message for several guards and did not record the exact rejected predicate/argument types; the subtype was not directly logged. It is not evidence that later path/file-object/transaction guards would pass after a correction.

**Review correction:** the previous READY recommendation missed this Driver/native binding boundary. Its pure policy checks did not exercise it. That recommendation is superseded for this Harness state by the observed failure and **G2-S BLOCKED**; G1's separate closed no-fault result is unchanged. No earlier report, build receipt or original run was rewritten.

There is also an evidence-retention gap: native trace export and post-error transaction observations are reached only after arm succeeds and COMMIT returns. The outer error catch records the arm error but does not export the existing in-memory VFS ring or capture post-arm-failure activity. Those lost observations cannot be manufactured retrospectively from text after process exit.

## 4. Persistence limits and file preservation

Only **target.sqlite**, 32,768 bytes, is present in the sealed RUN. SHA256: `b7f479d2642a7227e89dd3281ce8cb5bcd99e2c42ab32c1c889a695f6e3fdab6`. WAL, SHM and journal are absent both from the sealed listing and current directory. Their absence does not prove they never existed or establish rollback/checkpoint success.

Neither native-before-cleanup.json nor native-events.json exists. Early native info receipts contain traceCount 0/10/10 at bootstrap/target/monitor setup, not a final trace. Native callback bodies, a 778 hit, candidate COMMIT outcome, explicit rollback/close observations, full SQL Cut and receipt reconciliation are all missing/not reached. The pre-injection candidate object is intended-operation metadata, **not a queried durable receipt**; only its intent digest was independently checked against the pinned intent fields.

**Actual data consistency: UNVERIFIED.** There is no positive evidence of a partial/mixed business cut, but no independent SQL result proves consistency either. A correctly hashed 32-KiB file is not a logical Oracle. No physical backup/clone or SQL read was created in this audit; the original bytes and full file membership were preserved in place and rechecked.

If later SQL inspection is desired, obtain separate authorization: confirm quiescence and file identity; exclusively archive the entire RUN and CMD capture, recording all present/absent DB/WAL/SHM/journal members and matching hashes before/after copy; create a **second working copy** of that archived DB file set; run a new uninjected Reader against the working copy only, recording any recovery/sidecar changes there. Never open the original or the preserved archive through SQLite. Do not treat readonly/immutable flags or a main-file-only copy as protection against WAL-state changes. Compare seven-table authority and receipts on that copy; unreadable/mixed results remain unavailable. Even a healthy copy cannot turn this failed, unarmed run into an injected G2-W success.

## 5. Minimal repair recommendation and stopping point

No repair was implemented. A separately approved minimal change can validate candidate.epoch as the supported safe integer and bind **BigInt(candidate.epoch) only at the native call boundary**, retaining the existing JSON fixture/receipt format and strict native integer check. Do not fix this by blindly truncating numbers, dropping epoch validation or relabeling the error IOERR.

A bounded failure-path improvement should preserve the original arm error, available transaction state and existing native trace before cleanup where possible, and explicitly report unavailable observations. Record a safe refusal category/argument type if native diagnostics are later changed. Native changes would require a separate new build; nothing here rebuilds or loads a DLL.

These suggestions do **not** authorize G2-W to run again, G2-S to run, or a same-run retry. Existing evidence can be catalogued/archived and retained without any rerun; unrecorded historical state cannot be recovered by pretending a new run is the old one.

**Final recommendation: G2-W FAIL; targeted COMMIT I/O injection NOT TESTED in this executed run; G2-S BLOCKED by the shared arm boundary.** U3 real COMMIT I/O uncertainty remains NOT TESTED. Production Storage is unauthorized, D-041–D-044 remain Proposed, and S/P/M production statuses are unchanged.

Only this forensic report was added to the repository. Before/after hash and membership checks preserved all **55** guarded original RUN/CMD/source/build/Driver/acceptance files. No original evidence, database, Harness, production code or prior conclusion was edited; no tests, builds, Worker or database operations were run. Report structure/whitespace and git diff checks are separate from experiment execution.
