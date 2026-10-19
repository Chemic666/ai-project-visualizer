# Native VFS G1 — Independent Evidence Audit

**Public-safe publication copy (2026-10-19).** The original private audit/review bytes are retained separately. Original SHA256: `b319e650ebe8ac23b293315acab0857cd0c0e36a684f38a9849768ab5308ae51`. Machine prefixes below use `%APV_REPO%` (repository root), `%LOCALAPPDATA%` (original account's local app-data root), `%ProgramFiles%` and `%APV_CLANG_EXE%` (the recorded Clang executable), where applicable. These are publication aliases, not literal historical command bytes or newly observed paths. RunIds, build/binary fingerprints, results and limitations are unchanged. This copy is not a new execution authorization.

**Formal disposition — 2026-10-16: CLOSED — PASS WITH LIMITATION.** ChatGPT explicitly approved closure of this narrow G1 no-fault integration gate after the independent evidence audit. The audit-time recommendation below is retained as history, together with all original evidence references and limitations (including bootstrap receipt wording and missing reopened configuration readback). G2 execution is not authorized; U3 and production acceptance remain NOT TESTED, production Storage remains unauthorized, and D-041–D-044 remain Proposed. This closure annotation changes no original run, DLL or build record.

**Audit date: 2026-10-16. G1 overall: PASS WITH LIMITATION.** This is an evidence audit and closure recommendation, not a final closure registration or G2 authorization.

Only the one user-executed Windows no-fault run below was audited. This audit loaded no DLL/addon, opened no SQLite connection, ran no Harness Audit/Oracle or experimental Worker, and changed no original evidence. An independent file-only parser used Node standard-library file, hash and assertion functions; expected SQL rows were declared separately from the Harness Oracle. Source inspection explains the raw records; Runner PASS is corroboration only.

| Identity | Verified value |
| --- | --- |
| RunId | `b5ea3791-49e4-43fb-9796-9affc8e5108b` |
| BuildId | `12c54b54-7720-4509-9b21-467aaa6201d7` |
| DLL SHA256 | `15c5945631d2b18b31820e1142315cdcfbc916f773d4224a7f2ad5d0f0d54265` |
| RUN | `%LOCALAPPDATA%\Temp\apv-u3-vfs-g1\b5ea3791-49e4-43fb-9796-9affc8e5108b` |
| CMD | `%LOCALAPPDATA%\Temp\apv-u3-vfs-cmd-731aaba9-489b-4b3a-93fd-211d13eba683` |

Below, RUN/CMD filenames refer to these exact retained directories. Native `#N` means `native-events.json.events[].seq`; Worker `seq N` means the named `*.receipts.jsonl` record. Build records are under `experiments/phase-2-sqlite-u3-vfs-spike/build/<BuildId>/`.

## A. Build Identity Verdict — PASS

The original new-build DLL and RUN copy both hash to the authorized SHA256. RUN `manifest.json.build` equals the original `build.json`, including BuildId, command, six input hashes and binary hash. All six current input bytes and 13 manifest-bound Harness source hashes match. The Worker specs reference only the RUN copy; inspected Worker code hashes that file before `loadExtension(spec.dll, "sqlite3_apvvfs_init")`.

Retained compiler-version, compile and PE inspection exit records are all status 0, signal/error null. Retained PE output reports x86-64/AMD64, `sqlite3_apvvfs_init`, and only `msvcrt.dll`/`KERNEL32.dll` imports; independent byte inspection also confirms PE AMD64. No rebuild or PE tool execution occurred during this audit.

The recorded Node `v24.21.0`, better-sqlite3 `13.0.3`, SQLite header `3.53.4`, Node executable hash and Driver native binary hash match current bytes and manifest/preflight records. Runtime native info independently reports SQLite `3.53.4`; all four Worker-start receipts report Node `v24.21.0`, x64. Manifest OS is Windows 11 Home China, release `10.0.26200`, win32/x64. These are recorded runtime/version identities, not an independent OS certification.

Original BuildId `3130936b-1739-43aa-abe8-7000204e86fb` retains **12/12 unchanged files**, compared with the retained pre-identity-fix hash baseline. Its DLL remains `c00c7662af2de3c6b89603592da142e54a2b2ca3e4d3e576753669666adac6c5`; it is distinct from the loaded RUN copy. This verifies retained bytes, not a claim that no transient historical write ever occurred.

## B. Runtime VFS Selection Verdict — PASS

The decisive evidence is wrapped Worker PID **17436**, nonce `74e070ca-4e19-4aab-a77f-100b463a20ab`, not a name supplied by the audit:

| Raw receipt | Connection | actualVfsName | vfsQueryStatus / fileControlRc | selectedShim | Native traceCount |
| --- | --- | --- | --- | ---: | ---: |
| `wrapped.receipts.jsonl` seq 2 | loading bootstrap | `win32` | `ok` / 0 | 0 | 0 |
| seq 3 | `target` | `apv_g1_nofault_v1` | `ok` / 0 | 1 | 10 |
| seq 17 | `reopened-target` | `apv_g1_nofault_v1` | `ok` / 0 | 1 | 261 |

Both target receipts contain the exact native `databaseFile` RUN `wrapped.sqlite`, matching their outer filename, role, RunId, nonce and PID. Both bind to API table `7FFD19190720` and OS thread **25536**, also present in bootstrap/extracted state and Native Events. Native successful main-file opens are #1/fileId 1 and #228/fileId 4; the first is before traceCount 10, the second before traceCount 261. Later callbacks close both exact file identities.

The source-hash-bound native `infoFn` uses `sqlite3_context_db_handle(c)` and `sqlite3_file_control(db, "main", SQLITE_FCNTL_VFS_POINTER, &selected)`, checks return/pointer/string bounds, and copies `selected->zName`. Worker queries `apv_vfs_info()` on each actual target connection and preserves that JSON. Audit code requires the raw string/status/code and compares against the expected name; it does not fill missing evidence from the constant, `selectedShim`, or default VFS lookup. The final monitoring connection has `databaseFile: null` and is **not** substituted for either target identity.

Registration precedes target open. `defaultShim=1`, subsequent target selection, same API table, real wrapped I/O and later reopen jointly support registration in the Driver's SQLite instance. `SQLITE_OK_LOAD_PERMANENTLY` and automatic function registration explain continued operation after bootstrap/first-target close; actual later callbacks/reopen provide runtime corroboration. No explicit unload or module-address trace was captured.

**Receipt wording limitation:** seq 4 is named `bootstrap-closed-before-target-io`, but seq 3 already has traceCount 10. The target opens before bootstrap closes; bootstrap closes before configuration and the business transactions. Do not interpret the receipt/README wording as closure before the first target xOpen. Later transactions and reopen still test callback lifetime after bootstrap closure. A future authorized documentation/label correction should describe this actual order; no source or receipt was rewritten here.

## C. Native I/O Observation Verdict — PASS WITH LIMITATION

All **335** records have contiguous sequence 1–335, PID 17436/thread 25536, admitted RUN paths and consistent phase/file identities; overflow=0. These comprise **322 callbacks plus 13 phase markers**, not 335 OS I/O calls. Non-marker kinds contain 233 main-file, 82 WAL and 7 rollback-journal callbacks. Every one of five successful opens has one later successful close, and no callback follows its fileId's close.

| Method | Count | Method | Count |
| --- | ---: | --- | ---: |
| xOpen | 5 | xClose | 5 |
| xWrite | 66 | xSync | 17 |
| xRead | 27 | xFileControl | 42 |
| xLock | 8 | xUnlock | 5 |
| xFileSize | 12 | xTruncate | 3 |
| xShmMap | 4 | xShmLock | 90 |
| xShmBarrier | 36 | xShmUnmap | 2 |
| phase | 13 | Total | 335 |

| File domain | xOpen / xClose | xWrite / xSync | Exact lifetime |
| --- | --- | --- | --- |
| main `wrapped.sqlite` | 2 / 2 | 14 / 3 | fileId 1: #1–226; fileId 4: #228–335 |
| WAL `wrapped.sqlite-wal` | 2 / 2 | 50 / 12 | fileId 3: #40–224; fileId 5: #238–333 |
| rollback journal `wrapped.sqlite-journal` | 1 / 1 | 2 / 2 | fileId 2: #18–28, configuration/schema phase |

SHM coordination is observed through the four xShm* callback kinds, attached to the main-file identity. A separate `-shm` xOpen/xWrite/xSync is **NOT OBSERVED** and is not expected from this wrapper: underlying win32 handles the mapped SHM file internally. This does not trace every physical SHM operation. xFetch/xUnfetch and xCheckReservedLock are **NOT OBSERVED**; unlogged delegated VFS methods have no per-call proof here.

| Explicit COMMIT | Native interval between phase markers | WAL writes | WAL syncs | Worker entry / return / outside receipts |
| --- | --- | --- | --- | --- |
| first, phase 4 | after #163, before #181 | 12, #164–175 | 1, #176 | wrapped seq 9 / 10 / 11 |
| second, phase 11 | after #283, before #308 | 13, #289 and #291–302 | 2, #290 and #303 | wrapped seq 20 / 21 / 22 |

All these writes/syncs returned 0; sync flags are recorded as 2. Phase markers exactly match the Worker boundary sequence. Inspected synchronous same-thread code executes COMMIT between entry and return, then clears phase; this supports call-window attribution without cross-process wall-clock inference. Schema phase 1, explicit checkpoint phase 5 and close phases 6/12 remain separate; their main-file/checkpoint writes do not count as COMMIT-window WAL evidence.

There are **33 nonzero callback returns**, preserved and reviewed rather than hidden:

- 30 xFileControl returns are `SQLITE_NOTFOUND` (12): opcodes 14×10, 15×2, 20×2, 21×1, 22×9, 30×2, 37×2, 39×2. The bundled SQLite header defines 12 as an unsupported file-control opcode return. These optional controls are not failed WAL writes/syncs.
- #4 main-header read (100 bytes at 0), #14 main-version read (16 at 24), and #20 journal-next-header probe (8 at 512) return `SQLITE_IOERR_SHORT_READ` (522). The bundled `sqlite3.c` read-file-header, database-version and journal-header-probe paths explicitly accept short reads at these sites. Their locations, fresh-file/configuration phase and continued successful execution are consistent with expected EOF probing. This is a source-backed interpretation, not a captured native call stack.

No other nonzero return exists; **every xWrite/xSync returned 0**. Native source directly delegates buffer/offset/flags/result to win32 callbacks, contains no injection switch, and its hash binds this build/run. Observed normal behavior and SQL equivalence support transparency for this schedule; they do not prove every delegation path or physical media durability. The normal EOF short-read extended IOERRs are not U3 COMMIT fault injection.

## D. Transaction & SQL Oracle Verdict — PASS WITH LIMITATION

Both Writer `effective-config` receipts report WAL, `synchronous=2` (FULL), `walAutoCheckpoint=0`. Both record two COMMIT returns with `transactionActive=false`, preceded by COMMIT-entry `true`, first close, reopen path and final close. Wrapped native boundaries and file lifetimes independently corroborate the recorded close/reopen schedule. Reopened configuration is explicitly set in the source, but is not independently re-read into a second effective-config receipt: that particular runtime configuration readback is **UNVERIFIED**.

Each Reader is a different OS process from either Writer, opens an uninstrumented read-only/file-must-exist connection, and records a closed complete-cut read against the same dev/ino/nlink as its Writer. The source-bound Reader protocol uses one BEGIN, integrity_check, foreign_key_check and all six ordered table queries, then COMMIT/close. Raw cut JSONs retain query results, not a per-statement SQL trace. The audit did not rely on Writer-reported table values or invoke the Harness Oracle.

Both `reader-standard.cut.json` and `reader-wrapped.cut.json` independently match these **12 exact rows per cut**:

| Table | id 1 value | id 2 value |
| --- | --- | --- |
| event_ledger | `event-1` | `event-2` |
| assertions | `assertion-1` | `assertion-2` |
| history | `history-1` | `history-2` |
| snapshots | `{"head":1}` | `{"head":2}` |
| cursors | `unit-1` | `unit-2` |
| receipts | `operation-1` | `operation-2` |

Each has integrity `["ok"]`, no foreign-key errors, exactly those six tables, and SHA256 `c8b2e77c5ff06458d0d715171ac9c72495a5d0cd7d5c347b3dd9acc18ee83967`. No extra/partial bundle appears in these final cuts. This is final no-fault equality, not concurrent atomic-visibility, crash recovery, real APV Provenance/Correction History or unknown-outcome reconciliation testing. Retained databases were byte-hashed only; post-audit-open SQL results are **UNVERIFIED/not performed** to preserve WAL/SHM.

## E. Worker & Evidence Integrity Verdict — PASS WITH LIMITATION

All four specs, commands, raw receipts and exit records agree on RunId, BuildId, parent PID **25520**, root identity, copied DLL, unique nonce and owned PID. Sequence starts at 1 without gaps; each stream ends worker-complete, with no worker/COMMIT error receipt. All Worker stdout/stderr files are empty; status=0, signal=null, error=null.

| Sequential role | PID | Nonce | Raw receipts |
| --- | ---: | --- | ---: |
| standard | 10660 | `5c8d1057-8449-4846-a3bb-c432a6f6db6d` | 21 |
| wrapped | 17436 | `74e070ca-4e19-4aab-a77f-100b463a20ab` | 27 |
| reader-standard | 9812 | `34977be1-a22f-42c0-af15-41fc9194b13b` | 3 |
| reader-wrapped | 8824 | `b78e4102-29f3-47a1-a1d6-e7689f000ad4` | 3 |
| Total | 4 Workers | 4 distinct nonces | 54 |

Hashed Runner source uses blocking spawnSync in this order, writes the returned exit record before proceeding, and stops on failure without retry/kill/cleanup. All four recorded executions completed. Ordering derives from that control flow plus bound commands/exits/receipts, not timestamps or a kernel scheduler trace. No unexpected experiment Worker or failure/cleanup artifact appears in retained evidence. This is not a global process census: physical-path PowerShell helpers also run and are outside the four experiment-Worker count.

A separate read-only Get-Process check at `2026-10-16T06:09:03.8096503Z` found all four recorded PIDs absent. An earlier CIM query was unavailable and is not treated as an absence result. The successful PID check corroborates current absence only; historic exit identity comes from original spawnSync records, not PID reuse assumptions.

Inventory independently matches **36/36 entries**, with no duplicate/missing/extra covered file, correct byte lengths and all SHA256 values. RUN has 38 files: only `inventory.json` and `inventory.sha256` are excluded from their own listing. The seal independently matches inventory SHA256 `dbdbc74d49368a15a86630d85f647fbf04d855b589e84b103f9ce0ed97ea67e2`. Native Events hash is `9b3c5f8e26f38e7fac0738392cc31875975e218959b47d07e645bf4b35e2f47f`.

CMD contains 11 capture files outside RUN Inventory; all were separately read/hashed. Manifest physical-path proof records the exact owned NTFS root, no reparse ancestors and a single-link root identity; Reader/Writer DB file identities match current filesystem metadata. Native paths stay within wrapped main/WAL/journal domains. Metadata-to-open TOCTOU, adversarial file replacement and authenticity against coordinated same-user rewriting are not proved by these hashes.

Before/after byte/hash and evidence-directory membership checks preserved **236 existing files**, including all supplied RUN/CMD evidence, both builds and guarded existing project files. No original database/sidecar/evidence or Harness file changed during audit.

## F. CLI Exit Code Verification — PASS WITH LIMITATION

CMD raw `preflight.cmd-exit.txt`, `g1.cmd-exit.txt` and `top.cmd-exit.txt` each contain exactly `0` plus CRLF. Preflight and G1 stderr are both zero bytes. The actual captured declared commands are:

```text
node "%APV_REPO%\experiments\phase-2-sqlite-u3-vfs-spike\runner.cjs" --preflight --build-id "12c54b54-7720-4509-9b21-467aaa6201d7"
node "%APV_REPO%\experiments\phase-2-sqlite-u3-vfs-spike\runner.cjs" --run-g1 --execute --build-id "12c54b54-7720-4509-9b21-467aaa6201d7"
```

Preflight stdout binds the correct build/DLL and `databaseOpens=0`; its identity file says NOT_STARTED/NOT_CREATED. G1 stdout's first JSON identifies the authorized RunId/root, agreeing with manifest argv, specs and `g1.identity-query.txt`. Its later result equals `runner-result.json` and reports 4/2/335. These counts were independently recomputed above. No separate audit CLI invocation/exit is asserted from the inline built-in audit result.

Command text/exit files are retained shell capture, not tamper-proof CMD history or kernel argv. Manifest argv adds runtime corroboration for G1. No newly repeated preflight or G1 was used as proof.

## G. G1 Overall Verdict — PASS WITH LIMITATION

This exact Windows/Node/Driver/SQLite/build/run demonstrates no-fault DLL loading, same-instance VFS registration and actual target/reopen selection, observed main/WAL/SHM coordination, two explicit COMMIT-window successful WAL write/sync sequences, continued callbacks after bootstrap closure, closed/reopened target operation, and complete final-cut equality with the standard VFS fixture.

The independent parser completed **3,445 assertions** over original file data/metadata; this count is an audit implementation detail, not a substitute for the evidence and limits above. No protocol failure requiring repair or rerun was identified within this G1 scope.

## H. Remaining Limitations

- **G2: NOT AUTHORIZED / NOT TESTED. U3 real COMMIT I/O uncertainty: NOT TESTED.** No COMMIT error, uncertain outcome, rollback failure, fail-closed recovery, crash or power loss occurred in this run. Successful callback counts do not test their failure handling.
- One isolated synchronous thread/process and two tiny fixture transactions are covered. Concurrency, overflow/error paths, arbitrary workloads and full VFS method coverage remain untested. Native records are wrapper-level returns, not kernel/storage-device traces.
- SHM physical operations, unobserved callbacks, reopened configuration readback, audit-time database reopen and explicit OS module unload tracing have the limited/unverified scope stated above. The bootstrap receipt/README wording overstates how early closure happens; actual ordering is preserved in this report.
- The fixture's six table names do not establish production event identity, Dedup, multi-event Cursor, missing identity, cross-generation isolation, receipt/nonce reconciliation, Provenance, Correction History, Writer ownership/fencing, or external source ACK safety.
- Hidden Owner loss, successful file replacement, Guard–COMMIT races and genuine Owner release failures remain outside production guarantees. Actual Host integration, complete production recovery/migration, Privacy/Retention and all 25 production S/P/M gates remain unchanged/NOT TESTED. Production Storage implementation remains unauthorized; D-041–D-044 remain Proposed.

## I. Recommendation and authorized stopping point

**Recommend closing this narrow G1 integration gate as PASS WITH LIMITATION**, subject to ChatGPT's final review. This report does not itself register closure or change README/build history, Decision or production acceptance states.

The observed WAL fileIds and COMMIT windows justify seeking separate approval to **prepare** a minimal G2 design: bind a single native WAL xWrite or xSync injection to an explicit COMMIT window and operation identity; preserve the original error and active-transaction state; prove connection settlement before fresh-process/full-cut reconciliation. Schema/checkpoint/close callbacks must stay excluded, and ambiguous/absent evidence must not authorize replay/publication/ACK. This is a bounded next-step recommendation, not implementation or execution authorization; no G2 plan/Harness was added.

Repository change: this report only, `docs/spikes/sqlite-u3-vfs-g1-evidence-audit.md`. Local parser, derived results and preservation snapshots are audit working files in the separate Codex workspace. No tests, builds or closed Spikes were rerun. Report links/structure/whitespace, final file-set comparison, preservation checks and `git diff --check` were checked separately from experimental execution.
