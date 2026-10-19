# U3 Native VFS — G0 Build / G1 No-Fault Preparation

**Public-safe publication copy (2026-10-19).** The original private preparation document bytes are retained separately. Original SHA256: `3c0f2f6c1735882790635be4fef32d4d4fd169a759d8e406dab14806266259e2`. Machine prefixes below use `%APV_REPO%` (repository root), `%LOCALAPPDATA%` (original account's local app-data root), `%ProgramFiles%` and `%APV_CLANG_EXE%` (the recorded Clang executable), where applicable. These are publication aliases, not literal historical command bytes or newly observed paths. RunIds, build/binary fingerprints, results and limitations are unchanged. This copy is not a new execution authorization.

Preparation: 2026-10-11; runtime identity evidence fix: 2026-10-16 (Asia/Shanghai). Disposable ordinary-Node Windows x64 tool only.

| Gate | Current disposition                                                              |
| ---- | -------------------------------------------------------------------------------- |
| G0   | **BUILD PASS**; native DLL compiled and PE metadata inspected without loading it |
| G1   | **PREPARED — NOT TESTED**; execution needs separate ChatGPT/user authorization   |
| G2   | **NOT AUTHORIZED / NOT TESTED**; no injector or G2 execution entry exists        |

The current task builds G0 and prepares G1 only. No database or G1 Worker was created, no extension was loaded, and no G2 fault was injected. Recovery is CLOSED — PASS WITH LIMITATION; its Harness/evidence and all previous Spike conclusions remain unchanged. U3, production Storage/Host/recovery and all S/P/M production gates remain NOT TESTED/unauthorized; D-041–D-044 remain Proposed.

## Current identity-fix build — 2026-10-16

Current BuildId: `12c54b54-7720-4509-9b21-467aaa6201d7`.

Artifact: `build/12c54b54-7720-4509-9b21-467aaa6201d7/apv_vfs.dll`.

SHA256: `15c5945631d2b18b31820e1142315cdcfbc916f773d4224a7f2ad5d0f0d54265`.

G0: **BUILD PASS**. The existing compiler/flags and PE inspection completed with exit 0 without loading the DLL. Six explicit inputs bind this new build. The original BuildId below and all its files remain unchanged; current native source has intentionally changed, so the old build is historical and does not satisfy current-source preflight. Never overwrite/rebuild into that old directory.

The prior execution Gate was BLOCKED because actual VFS name evidence was absent. This fix adds native `info.actualVfsName`, `info.vfsQueryStatus` and `info.databaseFile`, retaining `selectedShim` and `fileControlRc`. `sqlite3_context_db_handle()` supplies the connection executing the SQL function; `sqlite3_file_control(db,"main",SQLITE_FCNTL_VFS_POINTER,...)` supplies its actual top VFS. Only a successful return/non-NULL VFS/usable bounded zName produces a name copied into JSON. A missing/empty/overlong name yields null and a failure status; no constant/default VFS/boolean supplies the actual name. The original defaultShim diagnostic is unchanged. `sqlite3_db_filename(db,"main")` binds the native query to the actual disk file, so a bootstrap memory connection cannot substitute for a target receipt. See [SQLite connection context](https://www.sqlite.org/c3ref/context_db_handle.html) and [file control](https://www.sqlite.org/c3ref/file_control.html).

VFS/name pointers are borrowed only while the SQL callback's connection is live; escaped text is copied into SQLite-owned result memory. There is no cached target pointer/name across close. Pointer validity relies on the documented live SQLite API contract, checked return/pointer/string bounds and the existing synchronous/permanent-extension lifetime; this is not an OS memory-corruption guarantee. A closed connection cannot execute the function; unavailable identity fails the Worker/Audit checks.

The Worker calls info on both target and reopened target, writes the raw info **before** validating, and adds connectionRole/databaseFile binding fields to those existing receipts. Native failures therefore remain available rather than being replaced by expected names. Bootstrap info is a separate diagnostic receipt. Audit independently validates presence/types, status=ok, integer fileControlRc=0, exact actualVfsName=apv_g1_nofault_v1, selectedShim=1, target stage, native/receipt PID, RunId/nonce and native filename against the bound fixture file. It cross-checks API/thread/PID and successful target xOpen against native I/O evidence. Missing legacy fields are rejected; no historical receipt is upgraded or filled from source.

`vfs-identity.test.cjs` provides 21 pure cases, including all required positive/refusal paths and Worker raw-value preservation. It imports only guarded pure Worker helpers and never runs main/loads the Driver. A passing mock receipt is not G1 evidence. Current execution Gate: **PREPARED / NOT TESTED**; this new binary still needs ChatGPT review before any single G1 run. G2 remains NOT AUTHORIZED / NOT TESTED.

## Original G0 build — retained history

BuildId: `3130936b-1739-43aa-abe8-7000204e86fb`.

Artifact: `build/3130936b-1739-43aa-abe8-7000204e86fb/apv_vfs.dll`.

SHA256: `c00c7662af2de3c6b89603592da142e54a2b2ca3e4d3e576753669666adac6c5`.

Existing compiler: `%APV_CLANG_EXE%`, Clang 15.0.0, target x86_64-w64-windows-gnu. Existing MinGW Windows headers/libraries sufficed; no install or system setting change. The same toolchain's llvm-readobj inspected AMD64/DLL headers, exports and imports. Compiler-version, compile and PE-inspection exit codes are 0. Compilation stdout/stderr are empty. The actual G0 host invocation was PowerShell → Node; this is not evidence of a user-executed CMD run.

`build-start.json`, `build.json`, `compiler-version.*`, `compile.*` and `pe.*` retain exact executable/argument arrays, input/header/Driver-config hashes, compiler/inspector hashes, Node/native-binary hashes, raw outputs and individual exits. Source inputs include the native C file and the installed Driver's sqlite3.h/sqlite3ext.h. This records explicit inputs/toolchain identity, not a complete signed SDK/system-DLL supply-chain attestation. Build directories use fresh UUIDs; failures are retained, never deleted or retried automatically.

Optional G0 build entry (already completed; no rebuild is needed for G1):

```cmd
cd /d %APV_REPO%
node experiments\phase-2-sqlite-u3-vfs-spike\build.cjs --build --compiler "%APV_CLANG_EXE%"
```

No arguments leaves G0 disabled. G0 never loads a Driver/DLL or opens SQLite; it compiles and reads metadata only. Special SQLite/Driver builds are not selected as a fallback.

## Native design and ABI boundary

`native/apv_vfs.c` includes sqlite3ext.h and uses the loader-supplied SQLite API table; it does not link SQLite or Node-API. The inspected better-sqlite3 package is 13.0.3, NAPI_VERSION=10, its SQLite header is 3.53.4 and its source opens with a NULL VFS argument. The prebuilt native SHA256 is `e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a`. The DLL uses Windows x64 C ABI, SQLite-owned allocations for returned SQL text, and an 8-byte-aligned embedded WinFile region. MinGW/MSVC compatibility of this actual DLL remains a G1 runtime question; G0 is not an ABI-loading proof.

The extension requires the exact runtime SQLite header version and the default `win32` VFS (versions 1–3); otherwise it refuses initialization. All I/O return values, buffers, flags, original filename pointers, locks, SHM and optional mmap callbacks are forwarded. Version/optional-method support is preserved. Failed xOpen with non-NULL pMethods retains its delegated close path. Trace records contain metadata only; no file contents/SQL bindings. Capacity is 4,096 callbacks and 1,024 bytes per path; overflow, truncation or a different callback thread makes trace incomplete and G1 fail, without changing delegated I/O results. Single synchronous execution thread is the declared scope.

There is no supported explicit VFS option in the inspected public JS constructor, and SQLITE_USE_URI=0 precludes assuming URI vfs= selection. Instead, **only the wrapped disposable child process** creates a memory bootstrap connection, loads the DLL, registers a uniquely named default VFS, and then opens the disk target. Loading after target-open would not change its existing VFS. Native `sqlite3_auto_extension` registers diagnostic SQL functions in subsequent connections; this is implemented in C, not assumed callable from JS.

Initialization returns SQLITE_OK_LOAD_PERMANENTLY. G1 deliberately closes the loading bootstrap before target I/O, and later closes/reopens the target without reloading the DLL. It must prove: unchanged API-table identity, default registration, actual target `SQLITE_FCNTL_VFS_POINTER == &shim`, native call records and durable SQL equivalence. `loadExtension()` success alone is insufficient. Permanent callbacks and auto-extension state remain until the isolated process exits; no unregister/unload race is introduced. The parent, standard Worker and Readers never load this DLL. No machine-global VFS/system DLL/Driver replacement occurs.

References: [SQLite VFS callbacks](https://www.sqlite.org/c3ref/io_methods.html), [VFS structure/versioning](https://www.sqlite.org/c3ref/vfs.html), [loadable extension API/lifetime](https://www.sqlite.org/loadext.html), [automatic extensions](https://www.sqlite.org/c3ref/auto_extension.html), [transaction error semantics](https://www.sqlite.org/lang_transaction.html). These establish interface expectations, not runtime qualification.

## G1 entry, isolation and evidence

`runner.cjs` defaults to help. Only `--run-g1 --execute --build-id UUID` runs four sequential owned processes: standard Writer, wrapped Writer, independent standard Reader, independent wrapped Reader. Stop at the first failure; no automatic retry, failure continuation, process-name cleanup or forced termination. A hung native call requires separate handling; no timer is treated as proof of cancellation. No historical Harness is imported or invoked.

New RunId under the fixed admitted local `%USERPROFILE%\AppData\Local\Temp\apv-u3-vfs-g1\RunId`. There is no caller-supplied DB/root path. TEMP overrides, non-local/non-NTFS roots, reparse ancestors, physical aliases and non-single-link target files are refused. Paths and dev/ino/nlink identities are checked before use; specs bind RunId, role, nonce, parent PID and root identity. Physical metadata-to-Driver-open TOCTOU is not eliminated: this is an owned disposable fixture, not production file-identity proof.

Each Writer uses fresh disk files only. The wrapped Worker closes its bootstrap, runs FULL-synchronous WAL with automatic checkpointing disabled, performs two explicit transactions separated by an explicit checkpoint/close/reopen, and records entry/return/transaction state. Its six tiny synthetic tables cover event_ledger/assertions/history/snapshots/cursors/receipts for complete-cut comparison. **This is a G1 I/O fixture, not the APV production schema or a claim of recovery/identity/fencing/ACK coverage.** No source ACK or business publication is implemented.

Each Reader is a new process/new uninstrumented connection, uses a single BEGIN cut, integrity_check, foreign_key_check and ordered queries of all six tables; it never imports Writer/native code. `oracle.cjs` independently pins every expected row/value and compares both cuts. Ordinary reads of these fresh disposable WAL databases may perform SQLite sidecar handling; no original Recovery database is opened.

Native receipt fields: sequence, fileId, PID, OS thread, phase, main/WAL/journal/other kind, method, full private path, flags, amount, offset and delegated native result. SHM is exposed by xShm* callbacks associated with the main file; it is not falsely counted as a separate xOpen of `-shm`. xOpen, WAL xWrite/xSync in both COMMIT windows, xClose/reopen and SHM calls must be present. Explicit checkpoint and close-time I/O have different phase labels. Standard VFS native telemetry is unavailable; its independent SQL cut supplies the baseline.

Run evidence includes manifest/version/OS/source/build hashes, copied DLL hash, worker specs/commands, stdout/stderr, PID/nonce-bound contiguous receipts and exit records, raw native events, two complete Reader cuts, failure/result file, Inventory and SHA256 seal. Sealing excludes only inventory.json and its own seal. A failed/aborted seal is insufficient evidence, never PASS. Hashes establish consistency, not authenticity against coordinated same-user rewriting. Runner PASS is provisional; `audit.cjs` reads files only and independently checks lifecycle, phases, pointer identity, complete cuts and Inventory. Human evidence review remains required.

### Read-only preflight (no experimental Worker/DB/DLL load)

Run each command separately in CMD; redirect **before echo** when recording an exit code. Use a new capture filename/directory to preserve earlier evidence.

```cmd
cd /d %APV_REPO%
node experiments\phase-2-sqlite-u3-vfs-spike\runner.cjs --list
set "APV_LIST_RC=%ERRORLEVEL%"
echo %APV_LIST_RC%
node experiments\phase-2-sqlite-u3-vfs-spike\runner.cjs --preflight --build-id 12c54b54-7720-4509-9b21-467aaa6201d7
set "APV_PREFLIGHT_RC=%ERRORLEVEL%"
echo %APV_PREFLIGHT_RC%
```

Preflight reads build/source/native hashes and performs the NTFS/reparse/physical-TEMP checks using a metadata-only PowerShell helper. It does not prove actual VFS selection or loadability.

### Future one-shot G1 — NOT AUTHORIZED IN THIS TASK

After separate approval, CMD commands below use the actual prepared entry; do not substitute an earlier Spike runner. Clear capture first so a preflight refusal cannot reuse a previous capture path.

```cmd
cd /d %APV_REPO%
set "APV_G1_CAPTURE="
call experiments\phase-2-sqlite-u3-vfs-spike\run-g1.cmd 12c54b54-7720-4509-9b21-467aaa6201d7 --execute
set "APV_G1_CMD_RC=%ERRORLEVEL%"
if defined APV_G1_CAPTURE (
  > "%APV_G1_CAPTURE%\cmd-exit.txt" echo %APV_G1_CMD_RC%
)
echo %APV_G1_CMD_RC%
```

The wrapper creates a new exclusive TEMP capture directory with declared command, raw Node stdout/stderr and immediately captured **node-exit.txt**. It returns that code; the caller separately records **cmd-exit.txt** after `call`. Preflight failure creates no experiment database; retain the displayed failure/caller exit separately. Do not execute `echo 0>...`, which parses 0 as a redirection descriptor. Commands are declared capture, not kernel argv or interactive shell-history proof.

After the run, use the printed actual RunId for the file-only independent audit; it never opens SQLite:

```cmd
node experiments\phase-2-sqlite-u3-vfs-spike\audit.cjs --audit ACTUAL_RUN_ID > "%APV_G1_CAPTURE%\audit.stdout.txt" 2> "%APV_G1_CAPTURE%\audit.stderr.txt"
set "APV_G1_AUDIT_RC=%ERRORLEVEL%"
> "%APV_G1_CAPTURE%\audit-exit.txt" echo %APV_G1_AUDIT_RC%
```

Do not rerun automatically on failure or edit/delete failed RunId data. No claim of actual runtime VFS attachment is made until this evidence is independently reviewed.

## G2 mapping only — no implementation

- WAL xWrite: callback records exact fileId/path/kind=2, offset/length and original delegated result. Writes during schema/DML (phases 1/3/9) are distinct from COMMIT windows 4/11; cache spills may write earlier.
- WAL xSync: match kind=2 and the COMMIT window under effective FULL configuration. Phases 5 (explicit checkpoint), 6/12 (close) and 7 (reopen) are not COMMIT failure sites. A phase label alone is insufficient: require synchronous same-thread native sequence plus recorded actual COMMIT entry/error/return, effective configuration and disabled autocheckpoint.
- Original extended error: preserve the Driver's actual SqliteError.code immediately; capture db.inTransaction through its native getter before rollback/close. `apv_vfs_info` exposes native autocommit/extendedError, but executing a diagnostic SQL SELECT can reset the prior error: it must **not** substitute for the original COMMIT error. Future native fault receipts need callback result/operation/nonce bindings before cleanup.
- Correlation: future G2 must bind native failure receipt to the same RunId/process/nonce/operation/generation/epoch/intent and a separately recovered complete authority cut after proven settlement. Current G1 simple receipts and all-new-cut Oracle do not implement unknown-outcome reconciliation or rollback fault handling.
- No xWrite/xSync failure is preclassified as COMMIT failure or not_committed. No IOERR is manufactured by JS, no fault-return switch exists in the DLL, and no G2 command is provided. Follow [U3 feasibility](../../docs/storage/phase-2.3-u3-feasibility-review.md) and F11 for any later separately authorized design.

## Current checks / recommendation

Pure tests cover default execution gating, escaping IDs/paths, full-cut mismatch refusal and absence of native injection/direct SQLite linkage. JS syntax, compiler warnings-as-errors, PE imports/exports, documentation links, whitespace, source/build hashes and actual repository file-set are checked. No G1, original Core/Recovery test suite or closed Spike is run here.

**Recommend separate authorization for one G1 Windows no-fault run**, using this exact BuildId after preflight. This is a recommendation, not current execution permission. Any registration/API/lifetime/VFS selection failure becomes BLOCKED; no Driver patch, alternate SQLite build or unsafe process-wide replacement is automatic. G0 success does not verify real VFS behavior, U3 I/O uncertainty, hardware faults or production safety.
