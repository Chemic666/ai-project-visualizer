# Disposable SQLite Ownership Spike Harness

**Public-safe publication copy (2026-10-19).** The original private preparation document bytes are retained separately. Original SHA256: `6ac77e9cda974958fa8cffc13b65d9e34f0f070a9456f245cd727d9e66c3d1ce`. Machine prefixes below use `%APV_REPO%` (repository root), `%LOCALAPPDATA%` (original account's local app-data root), `%ProgramFiles%` and `%APV_CLANG_EXE%` (the recorded Clang executable), where applicable. These are publication aliases, not literal historical command bytes or newly observed paths. RunIds, build/binary fingerprints, results and limitations are unchanged. This copy is not a new execution authorization.

Original implementation-preparation statement (historical scope): implementation preparation authorized; **real OP01–OP10 execution was NOT authorized in that task and all real cases were NOT TESTED**. D-041–D-044 remain Proposed. This directory is disposable experiment code, not production Storage, Core, Adapter or Extension.

Protocol: [pre-execution design](../../docs/spikes/sqlite-ownership-protocol.md). Mapping: [25-case Storage acceptance](../../docs/acceptance/phase-2-storage.md).

## OP04 targeted coverage update — 2026-10-09

Only disposable harness changes and pure/static checks are authorized in this update. **All enhanced OP04 real fault scenarios are NOT TESTED; execution needs separate authorization.** The original preparation statements below describe their historical task. Previously audited runs are not validation of this revised source.

Historical OP04 RunId `e39f313b-2e42-4d13-9b1b-fdd0f611627a` remains unchanged: its tested crash cuts passed with limitation, but it did not test B's new business commit or read SQL after the duplicate retry. Historical OP05 RunId `597413fe-87c6-46f2-93e1-d08571492dc5` also remains unchanged. Preserve their complete original roots, inventories and source hashes; never relabel them as enhanced OP04 evidence.

| OP04 variant | Ordered independent Reader checkpoints and exact required history                                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| idle         | `op04.recovery`: e2/head 0/no writes; B commits O1 using e2/new token; `op04.after_new_commit`: e2/head 1, exactly B's O1                                                                                                                           |
| pre          | Same checkpoints as idle: recovery must first prove A's uncommitted O1 absent; final history must contain only B's e2/token O1                                                                                                                      |
| post         | `op04.recovery`: e2/head 1, retained A e1/token O1; B retries O1 as duplicate; `op04.after_duplicate`: identical meta/state/writes and head 1; B commits distinct O2 using e2/new token; `op04.after_new_commit`: head 2, exactly A's O1 and B's O2 |

Every checkpoint starts a fresh independent Reader through the existing read-only SQL transaction path. Its name is retained in the parent read command's `options.checkpoint`; Worker identity/nonce, `command_started.createdAt`, `sql_oracle.createdAt` and parent ordering bind the reading interval and schedule. Receipt time is not claimed to be the exact instant of an individual SELECT.

The OP04 Oracle checks exact operation IDs/count, base/new heads, Project/generation/lifecycle, current epoch/token, each row's author epoch/token, intent digest, result digest and state/head digest. The duplicate read must preserve the complete meta/state/writes cut. A has no publication/fixture ACK; its sole business commit is O1 in post only. B has exactly one new commit, publication and fixture ACK, in that order, matching its final SQL record (O1 for idle/pre, O2 for post). Duplicate handling retains the existing protocol and generates no new publication/fixture ACK. The parent ACK sink still binds the original commit receipt; this is not real Agent ACK integration.

No ownership rule, schema, Driver, Worker runtime, termination mechanism or watchdog is changed. Hidden lock loss and external file/check-COMMIT races remain NOT GUARANTEED. New pure tests exercise the completion schedule and actual JS Writer against in-memory SQL doubles; they never construct Actors or load SQLite and do not establish crash/locking results.

After separate execution authorization, Windows CMD commands for **only enhanced OP04** are:

```bat
cd /d "%APV_REPO%"
"%ProgramFiles%\nodejs\node.exe" "experiments\phase-2-sqlite-ownership-spike\runner.cjs" --preflight
"%ProgramFiles%\nodejs\node.exe" "experiments\phase-2-sqlite-ownership-spike\runner.cjs" --case OP04 --execute
```

Stop if preflight fails; do not bypass it. Each execution creates a new RunId/root and records the revised source hashes in `manifest.json`. Preserve the printed evidence root and audit all recovery/duplicate/final Reader receipts, termination/exit records, B submissions and parent ACKs against `inventory.json`. A prior PASS cannot supply any missing checkpoint. Exit 0 is requested cooperative-scene success only; invariant violations are FAIL, missing/timeout/infrastructure failures are NOT TESTED. D-041–D-044 remain Proposed.

## Structure and isolation

- `runner.cjs`: CLI, read-only preflight, fresh RunId/case roots, scenario aggregation and hash inventory.
- `scenarios.cjs`: OP01–OP10 schedules and expected SQL/transition assertions.
- `actors.cjs`: authenticated independent Node child processes, command receipts, barrier coordination, owned-handle termination and actual exit observation.
- `worker.cjs`: independent Writer/Reader roles. Fixed synchronous barriers, actual SQLite connections and separate parent fixture ACK sink.
- `protocol.cjs`: private disposable Writer lifecycle; Owner lock, Project epoch/token/generation/base checks, guarded commits and explicitly isolated unsafe baseline.
- `oracle.cjs`: independent SQL-cut/reference checks, receipt binding and conservative verdicts.
- `support.cjs`: bounded owned paths/files, physical-file metadata, dependency resolution, fresh fixture schema and evidence storage.
- `protocol.test.cjs`: pure JS tests only; no SQLite constructors, child processes or fault experiments.
- `eslint.config.mjs`, `.gitignore`: local static checks and runtime exclusions; no dependencies installed.

The runner creates a new `%TEMP%\apv-sqlite-ownership\<RunId>\<OP-ID>-<variant>\` root. It takes no existing Project/database path. Within that root are immutable synthetic binding, Owner DB, Project DB, control files and append-only receipts. Owner file remains stable across the synthetic generation. Paths must resolve locally outside APV, without reparse/UNC escape; unknown necessary metadata/permission/identity stops execution. No temporary path fallback or permissions workaround.

Only the parent-created ChildProcess object, authenticated RunId/worker/nonce hello and still-live incarnation authorize termination. PID/process-name searches are never used. Creation time in hello is explicitly an uptime estimate, not kernel identity. Kill requests and actual exit observations are separate records. Only owned children are terminated; no global cleanup or user process termination. Cleanup failure is retained and cannot overwrite a known FAIL. No automatic evidence deletion.

For the pinned Windows runtime, Node's [libuv process implementation](https://github.com/nodejs/node/blob/v24.21.0/deps/uv/src/win/process.c#L1278) performs child termination through its retained process handle. The harness uses ChildProcess.kill, never process.kill(pid); this source review is separate from still-pending real termination/exit evidence.

Driver is resolved read-only from the existing compatibility experiment's installed local `better-sqlite3@13.0.3`. No reads/writes of its evidence, `_runtime` or artifacts occur. Runtime baseline is Windows x64 Node **v24.21.0**; preflight records actual module/N-API versions and native resource hash. It inspects the native file, without loading it or opening SQLite. A resource hash/readiness result is not a native-load or ownership PASS.

## Protocol and schema

Owner `owner_meta`: constant marker/schema/store key; journal mode DELETE. One dedicated connection holds raw BEGIN IMMEDIATE throughout ownership, without renewal/DML.

Project `store_meta`: Project/generation/lifecycle, authoritative epoch/token, fixture head/digest. Project `fixture_state` and `writes`: tiny counter/digest and immutable operation receipts. Project mode WAL/FULL; foreign keys enabled, temp_store MEMORY, busy timeout 250 ms. This is a small test schema, with no Core events/models/progress/correction/timeline schema.

Lock acquisition → HELD_UNFENCED → recovery verification → guarded epoch commit → ACTIVE are distinct events. Every new data transaction checks generation/epoch/token/base. Immediately before data/control COMMIT, a final live Owner acquisition/lifecycle/open/inTransaction check runs on the same thread. No callback/yield follows that guard before COMMIT. Loss disables the instance; stale Project token is independently rejected. The two files are **not atomically committed together**.

Normal release during WRITING is deferred until data completes; then data connection closes before Owner release. Exceptions with uncertain COMMIT or rollback disable the instance. Future takeover requires actual Owner acquisition, verified SQL cut and a new epoch; it is never based on PID/heartbeat expiry.

## Implemented scenario coverage (all real variants NOT TESTED)

| Case | Implemented schedules                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| OP01 | Single acquisition, separate epoch/ACTIVE receipts and independent committed-cut reader                                          |
| OP02 | Owner competition, actual BEGIN attempt/BUSY, loser does not advance epoch/state                                                 |
| OP03 | Normal drain/release, new owner, stale token rejection and new commit                                                            |
| OP04 | Kill owned Writer at idle/pre-COMMIT/post-COMMIT-pre-ACK; independent recovery, post-duplicate read, B new commit and final read |
| OP05 | Closed/lost instance rejection before new epoch; stale epoch/token/generation under current owner                                |
| OP06 | Guarded mid-transaction loss/rollback; separately labeled unsafe baseline; deferred normal release                               |
| OP07 | Ordered handoff and stale request during epoch transaction; old receipt retry does not rewind newer head                         |
| OP08 | Crash at lock acquisition/pre/post epoch; injected control failure/loss and post-commit unknown outcome                          |
| OP09 | Alternate/copied/missing paths, generation conflict, sacrificial live rename/delete attempt and actual deny observation          |
| OP10 | Owner lock timeout with ignored synthetic PID/heartbeat; explicit later reacquisition; parked release anomaly                    |

The immutable parent binding is a fixture, **not production concurrent catalog initialization**. OP09 intentionally refuses unapproved alias/copy references and checks real file metadata; it does not claim every Windows hard-link/TOCTOU/ACL attack is covered. Actual NTFS identity and live mutation denial still require real evidence. These component cases do not complete any of the original 25 full S/P/M cases. Kernel PID recycling, invisible lock failure, power loss, production Host and source ACK/resume remain outside tested claims.

## Unsafe baseline versus guarded protocol

Unsafe mode is accepted by the Worker only for OP06's `unsafe` fixture, never the other schedules. It releases Owner while keeping Project transaction, deliberately skips the final Owner guard, and can commit at the old epoch while B cannot yet update it. Expected result: **EXPECTED COUNTEREXAMPLE**, backed by original Owner-loss/data-commit receipts plus independent SQL evidence. It publishes/ACKs no successful state.

That result is an unsafe-protocol demonstration, not candidate support. Protected mode must instead roll the entire data transaction back. Protected post-loss COMMIT is FAIL; no observed reproduction is NOT REPRODUCED/failed case rather than fabricated evidence. Infrastructure failure or missing required worker/oracle evidence is NOT TESTED. FAIL dominates required missing checks. All case variants must pass their own oracle; timeout never becomes PASS.

Even future complete cooperative case PASS cannot guarantee invisible OS/VFS lock loss or file replacement between final guard and COMMIT. `.inTransaction` is connection state, not kernel lock attestation. Arbitrary SQL writers and hung-owner forced takeover are unsupported. If a required safety property needs those guarantees, change/review the architecture; do not waive it with PASS WITH LIMITATION.

## Evidence and results

Each command/transition/result carries fresh RunId/CaseId/WorkerId/nonce/sequence. Parent verifies receipt files against IPC data before using them. Synchronous entered/release files bind barriers without requiring blocked Worker IPC callbacks. The independent Reader executes SELECTs in one SQL read transaction and verifies body/head/digest, generation and complete fixture receipts. Parent fixture ACK records are outside SQLite and link the preceding commit receipt; they are not real Agent ACKs.

Private run root contains `manifest.json`, worker/config/barrier/command/transition/exit/termination/SQL-oracle/parent-ACK files, variant verdicts, `summary.json` and `inventory.json`. Raw Error/SQL/environment dumps are not saved or echoed; only fixed safe categories. Absolute private evidence root is printed to its owner; publish only reviewed derivatives/relative aliases.

Inventory is taken only after all owned processes close; known unclosed handles block SQLite hashing. File bodies are never read/hash-compared as lock proof while live. All originals remain preserved. Fresh runs never overwrite or borrow prior receipts.

Exit codes: 0 = all **requested** real case variants pass their cooperative oracles; 1 = observed candidate invariant FAIL; 2 = required NOT TESTED or preflight/harness failure. `allTenCoverage` remains NOT TESTED for single-case runs. `decisionAccepted` is always false; hidden lock-loss guarantee remains NOT GUARANTEED. A pure unit-test PASS is not a real OP result.

## Closure gap preparation — 2026-10-09

The earlier preparation/authorization statements below are historical. OP01–OP10 have separately executed, scoped independent audits; see the [closure coverage matrix](../../docs/spikes/sqlite-ownership-closure-coverage.md). They do not complete full O01 or the 25 S/P/M gates. Original receipts, source hashes and verdicts are immutable. The latest original OP10 run `5dc478f9-568c-4c18-b6ee-0c6248d7abb5` covers only `timeout` and `release_anomaly`; its historical CMD exit code remains unverified. Never derive that exit code from runner source or worker exits.

`release_anomaly` parks A after Project connection closure but before Owner rollback/close, then releases it successfully. It is **not actual release failure evidence**. API-level pure tests establish JS fail-closed branches only; real Driver/API injection and OS/VFS release errors remain NOT TESTED. No new filesystem destruction experiment is included.

### P0: `project_busy_watchdog` — implemented, real execution NOT TESTED

This disposable variant adds a third role, `project_blocker`, admitted only for this variant. It opens only the predetermined synthetic Project DB, acquires actual `BEGIN IMMEDIATE`, performs no DML, emits `project_lock_held`, and parks at a bound barrier. It is a sacrificial resource holder, **not a protocol Writer**. No user-supplied DB path or real Project is accepted.

Sequence (Worker IDs are allocated dynamically; role/config/nonce establishes identity, not the A/B label):

1. Candidate actually acquires Owner as HELD_UNFENCED; a fresh Reader records `op10.before_project_block`: epoch 0/token null/head 0/empty writes.
2. Separate blocker holds the Project write resource. After its entered Barrier is observed, parent starts a **distinct 5,000 ms blocked-phase deadline**. Candidate emits `fence_attempt`, calls the unchanged Writer fencing logic, and must receive real SQLITE_BUSY. SQLite `busy_timeout=250 ms` bounds that SQL attempt; it is not the parent watchdog and is not a precise wall-clock guarantee.
3. Candidate must be BLOCKED with Owner retained, never ACTIVE/WRITING and with no epoch/domain/publication/ACK effects. Independent Reader checkpoint `op10.fencing_busy` must match the original persisted cut. There is no automatic fencing retry or revival of that failed instance.
4. `blocked_wait` only holds the already-disabled candidate at `blocked_until_watchdog`. Parent **actually awaits Actor.deadline**; only APV_WATCHDOG at or after the declared monotonic boundary, with matching command/Barrier/run/nonce, can produce `evidence/watchdog-observed.json`. Other timeouts/errors and early completion fail the case. Blocker must remain alive with its hold command pending and no release receipt. This demonstrates a blocked candidate bounded by a real watchdog; it does not pretend that one SQLite call waits five seconds or that Writer implements a retry loop.
5. Following the observed boundary, a separate bounded **5,000 ms cleanup/recovery phase** begins. Resume the disabled candidate solely to complete its wait command, verify it is still BLOCKED, close it normally, then release/rollback and close blocker normally. No forced termination is required on the success path; every command needs a result and every owned process needs a verified exit. An unexpected timeout/cleanup failure is NOT TESTED, not accepted as the expected watchdog.
6. A new Reader checkpoint `op10.after_blocker_release` must be byte-equivalent in SQL data to the original cut. A fresh acquisition instance obtains Owner, fences from persisted epoch 0 to **epoch 1 with a new token**, commits O1, publishes/fixture-ACKs it once. Reader `op10.after_recovery_commit` must show PA/G1, head/value 1, exactly O1 at epoch 1/matching token/base 0/new head 1 and exact digests. The blocked candidate never advanced persisted epoch.

Only this new variant uses a **10,000 ms Worker Barrier failsafe**, so it cannot masquerade as the 5,000 ms parent timer. Original variants retain their 5,000 ms Barrier/watchdog rules. The explicit setup, blocked observation, and cleanup/recovery budgets are separate phases, not silent extension of a failed acquisition. Evidence records parent monotonic timer values, parentOrder, wall time, bound receipts/Barriers and four fresh Reader checkpoints. Recovery/publication cannot occur until the blocked phase is over and resources close. Unexpected Barrier expiration, missing oracle, residual worker, hash/identity error or incomplete command cannot yield PASS.

### Minimal next CMD run — requires separate execution authorization

Do not run this during preparation. In Windows CMD:

```bat
cd /d "%APV_REPO%"
"%ProgramFiles%\nodejs\node.exe" "experiments\phase-2-sqlite-ownership-spike\runner.cjs" --preflight
echo Preflight exit code: %ERRORLEVEL%
```

Stop unless preflight reports READY FOR REVIEW and exit 0. Only after explicit authorization:

```bat
"%ProgramFiles%\nodejs\node.exe" "experiments\phase-2-sqlite-ownership-spike\runner.cjs" --case OP10 --variant project_busy_watchdog --execute
echo OP10 P0 exit code: %ERRORLEVEL%
```

The selector runs **only P0**, not OP01–OP09 or the two historical OP10 variants. Each invocation creates a new RunId/root under `%TEMP%\apv-sqlite-ownership`; preserve complete CMD output, manifest, inventory, watchdog observation, commands/results/exits, blocker receipts, four Reader oracles and verdict. `cases.OP10.status`/overall status describe requested variants; `fullCaseCoverage` and `allTenCoverage` stay NOT TESTED for a selected-variant run. Those two fields count implemented variants/groups only; `formalProtocolCoverage` remains NOT TESTED and cannot be promoted from their aggregate. No future PASS can rewrite the older run or fill its missing exit code. Stop on exit 1/2, FAIL/NOT TESTED, unexpected child termination or missing evidence, and request independent audit; do not automatically retry or clean by process name.

## Allowed checks in this implementation task

Windows CMD, repository root `%APV_REPO%`:

```bat
cd /d "%APV_REPO%"
for %F in (experiments\phase-2-sqlite-ownership-spike\*.cjs) do "%ProgramFiles%\nodejs\node.exe" --check "%F"
"%ProgramFiles%\nodejs\node.exe" --check "experiments\phase-2-sqlite-ownership-spike\eslint.config.mjs"
"%ProgramFiles%\nodejs\node.exe" --test "experiments\phase-2-sqlite-ownership-spike\protocol.test.cjs"
"%ProgramFiles%\nodejs\node.exe" "node_modules\eslint\bin\eslint.js" --config "experiments\phase-2-sqlite-ownership-spike\eslint.config.mjs" "experiments/phase-2-sqlite-ownership-spike/*.cjs" --max-warnings 0
"%ProgramFiles%\nodejs\node.exe" "node_modules\prettier\bin\prettier.cjs" --check "experiments/phase-2-sqlite-ownership-spike/*.{cjs,mjs,md}"
"%ProgramFiles%\nodejs\node.exe" "experiments\phase-2-sqlite-ownership-spike\runner.cjs" --preflight
git diff --check
```

For a saved `.cmd` file use `%%F` instead of `%F`. Preflight is read-only: no new run root, DB or Worker. Permission/native resource/version failure stops with exit 2, status NOT TESTED and safe stage/category; do not modify pnpm, TEMP, permissions or dependency configuration to bypass it. No native-load/SQLite-version PASS is inferred.

## Next Windows acceptance: only after separate execution authorization

These commands are implemented, **not authorized to run in the current task**. Without `--execute`, `--case` prints NOT TESTED plan only and returns 2; it creates no database/process.

```bat
cd /d "%APV_REPO%"
"%ProgramFiles%\nodejs\node.exe" "experiments\phase-2-sqlite-ownership-spike\runner.cjs" --preflight
"%ProgramFiles%\nodejs\node.exe" "experiments\phase-2-sqlite-ownership-spike\runner.cjs" --case OP06 --execute
"%ProgramFiles%\nodejs\node.exe" "experiments\phase-2-sqlite-ownership-spike\runner.cjs" --case all --execute
```

Require preflight exit 0. Review OP06's protected rollback and separately unsafe counterexample first; stop on FAIL/NOT TESTED rather than proceeding or skipping it. The all-case command also starts OP06 first, each invocation using a new RunId. Preserve every printed root/verdict/summary/hash inventory. No manual process-name cleanup. An unclosed owned process is reported with its authenticated identity; do not replace blocked cleanup with user-wide termination.

## Preparation verification record

Real OP01–OP10: **NOT TESTED**. Pure JS regression, syntax, lint/format and read-only preflight results are reported separately in the implementation completion report. Current sandbox preflight encountered EPERM while inspecting temporary-root metadata; it created no root/DB/Worker and does not imply a Driver failure. Recheck in normal Windows only after review; do not treat this preparation as runtime verification.

Preparation checks (2026-10-09): JS/MJS syntax PASS; 19 pure unit tests PASS; local ESLint PASS; Prettier PASS; git diff --check PASS. The no-`--execute` OP06 plan returns NOT TESTED with workerStarted/databaseOpened false. These checks are source/JS-interface evidence, **not SQLite, process competition or crash verification**. All real case variants remain NOT TESTED. Probe watchdog is 5 s per scheduled case, with separate bounded cleanup grace; timing exhaustion cannot become PASS or a silent larger budget. OP06 covers Owner rollback and connection close; OP08 includes a real duplicate-row constraint action for later execution, plus distinctly simulated post-commit caller ACK loss.
