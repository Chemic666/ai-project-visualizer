# Phase 2 disposable SQLite driver compatibility spike

Date: 2026-10-08. Current unique preferred proposal: **better-sqlite3 13.0.3 / D-041 Proposed**; production selection is not Accepted. Earlier recommendations below are historical.

**Current acceptance status:** User closure review recognizes W1/W2/W3 Compatibility Spike technical verification complete, **PASS WITH LIMITATION**, formal Audit `82eeaa9a-112e-4b2e-aa29-4cb68be3f2dc`. Atomic recovery and Privacy/Retention prerequisites remain pending. See [public evidence digest](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json) and [checkpoint/custody manifest](phase-2.2-checkpoint.md). Original receipt filenames in this report are local-only references; JSON hyperlinks lead to the allowlisted public derivative, not the private originals.

The following initial report is historical through its original Recommendation section. External Windows acceptance replaced the development probe/launch JSON before this review; initial missing-package and failed-launch results are recorded in `command-observations.json`, not inferred from the current Host receipt. Historical pending entries below are superseded only by the explicit latest review, not silently rewritten into passing results.

Phase 1 passed external Closure Review according to the user. Phase 2.0/2.1 review outcomes are likewise user-provided context, not tests executed by this spike. SQLite remains the accepted direction; the concrete driver remains unselected. Codex passive observation stays **Technical Verification Pending** and is unrelated to this experiment.

Only executable material in [the disposable experiment](../../experiments/phase-2-sqlite-driver-spike/README.md) and this report were added. No production package, Core change, schema/migration, snapshot/recovery architecture, ORM, Engine or production extension was implemented. Synthetic SQL here tests driver capabilities only.

## Official basis

Researched 2026-10-08; source inspection is distinct from runtime verification:

- [Node v24.21.0 SQLite documentation source](https://github.com/nodejs/node/blob/v24.21.0/doc/api/sqlite.md): version-matched documentation describes DatabaseSync, prepared statements and configurable timeout. That version labels node:sqlite **Stability 1.2 — Release candidate**, not fully stable. Unversioned Node documentation was not used to claim the installed API is identical.
- [better-sqlite3 v13.0.3 release](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.3) and [versioned package manifest](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/package.json): current 13.x candidate configured for this spike is **13.0.3**; its manifest declares Node >=22, includes `prebuilds/**`, and exports platform entry points including win32-x64. This is a researched/pinned version, **not an installed/resolved version** here.
- [v13.0.3 binding loader](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/lib/binding.js) prefers the matching platform/architecture prebuild, then native build directories. [Versioned binding.gyp](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/binding.gyp) declares NAPI_VERSION=10 and conditional native compilation. Old-driver claims about mandatory per-Node-ABI binaries or install-time downloading are not assumed for 13.x. Local prebuild selection/compilation is still **Technical Verification Pending**.
- [Official Extension testing API](https://code.visualstudio.com/api/working-with-extensions/testing-extension): supports --extensionDevelopmentPath and --extensionTestsPath with a runner exporting run(). A development Node process is a different runtime from an actual Extension Host.
- [Official packaging guidance](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) and [bundling guidance](https://code.visualstudio.com/api/working-with-extensions/bundling-extension): vsce packages extensions; native resources must be inspected separately. This spike does not assume esbuild packages `.node` files.

## Environment actually observed

| Field | Development process | Actual Extension Host |
| --- | --- | --- |
| Node | v24.21.0 | NOT TESTED — Technical Verification Pending |
| OS/platform | Windows / win32 | NOT TESTED |
| Architecture | x64 | NOT TESTED |
| Node module ABI | 137 | NOT TESTED |
| N-API | 10 | NOT TESTED |
| Electron | Not an Electron process | NOT TESTED |
| SQLite, query result | 3.53.4 | NOT TESTED |
| VS Code CLI | 1.140.0 / 07f806f999227108933c2e30515b26eecc1fda74 / x64 | CLI metadata does not establish host runtime |
| better-sqlite3 installed version | None; MODULE_NOT_FOUND | NOT TESTED |
| vsce / test-electron installed in project | Neither found | NOT TESTED |

Initial repository HEAD: `7c24556` (`feat(core): complete phase 1 core foundation`); working tree was clean. No package-manager setting, root manifest/workspace/lockfile or accepted decision was modified.

## Candidate A / Candidate B — development Node capability matrix

Evidence: [development-node.json](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json). Each B NOT TESTED entry is **Technical Verification Pending**, not a conclusion that the driver fails on Windows.

| Test | node:sqlite | better-sqlite3 13.0.3 | Observed evidence / limit |
| --- | --- | --- | --- |
| Module available / loading | PASS | NOT TESTED | A loaded built-in DatabaseSync; B local package missing |
| Exact runtime/driver version | PASS | NOT TESTED | A Node v24.21.0; B expected 13.0.3, observed null |
| SQLite version | PASS | NOT TESTED | SQL query returned 3.53.4 |
| File-backed open | PASS | NOT TESTED | Synthetic file exists after open |
| Create schema | PASS | NOT TESTED | Two synthetic probe tables found |
| Prepared statements | PASS | NOT TESTED | Parameter-bound insert/select matched fixture |
| Foreign keys | PASS | NOT TESTED | Enabled; invalid parent rejected, valid child accepted |
| Transaction commit | PASS | NOT TESTED | Committed row read back |
| Transaction rollback | PASS | NOT TESTED | Rolled-back row absent |
| WAL enablement | PASS | NOT TESTED | PRAGMA returned wal |
| Busy timeout configuration | PASS | NOT TESTED | Constructor value 100 ms; changed/read back 150 ms |
| Lock handling | PASS WITH LIMITATION | NOT TESTED | Second connection received SQLITE_BUSY-equivalent errcode 5; insertion succeeded after unlock |
| Close | PASS | NOT TESTED | Close returned normally |
| Reopen | PASS | NOT TESTED | Same file opened again |
| Persisted data | PASS | NOT TESTED | Parent/child counts 3/1; original marker retained |
| Node 24 / Windows x64 viability | PASS WITH LIMITATION | NOT TESTED | A development runtime only; no platform-general or Extension Host guarantee |
| Packaged prebuild vs local compilation | Not applicable to built-in import | NOT TESTED | B installation never executed; metadata inspection is not install evidence |

The JSON has **14 PASS checks for A**. The report narrows the lock result to PASS WITH LIMITATION: same-process two connections, no concurrent multi-process/crash scenario, no calibrated timing assertion. The captured elapsed value is an observation, not a performance promise.

`run-node.cjs` returned 0 because no executed check failed; B's skipped checks do not make it a passing candidate. File reopen is not a VS Code restart test. No production atomic-commit/snapshot/recovery capability is claimed.

## VS Code Extension Host results

The smallest disposable extension and official runner were created. Both candidates share synthetic driver tests; actual host fields are obtained only from the running extension.

Actual invocation: `& ./experiments/phase-2-sqlite-driver-spike/run-host.ps1`. It used the installed Code.exe, an isolated profile/extensions directory, and official development/test arguments. See [launch evidence](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json).

| Check | Result | Evidence |
| --- | --- | --- |
| Create isolated Code process | PASS | Child PID was returned |
| Startup completes / runner evidence | FAIL | Child exit -2147483645 (0x80000003); no host JSON; stdout/stderr empty |
| Actual VS Code/Node/Electron/ABI/N-API from extension | NOT TESTED | Technical Verification Pending |
| Extension activates | NOT TESTED | No activation receipt |
| Host loads node:sqlite | NOT TESTED | No host candidate receipt |
| Host loads better-sqlite3 | NOT TESTED | Driver absent and no host receipt |
| Host database operations | NOT TESTED | Technical Verification Pending |

The startup failure is a launch result, **not a SQLite candidate failure**. Its root cause was not established. No sandbox-disabling flags, pnpm adjustments, unrelated process termination or permission bypass were attempted. The launcher process returned 0 to emit structured limitation evidence; that exit code is not a passing Host test.

## VSIX results

| Required check | Status | Reason |
| --- | --- | --- |
| Package disposable VSIX | NOT TESTED | vsce unavailable; pnpm execution restricted |
| Install VSIX | NOT TESTED | No VSIX produced |
| Activate installed extension | NOT TESTED | Technical Verification Pending |
| Candidate loads from installed VSIX | NOT TESTED | Technical Verification Pending |
| Create/write database from VSIX | NOT TESTED | Technical Verification Pending |
| Restart isolated VS Code | NOT TESTED | Technical Verification Pending |
| Read persisted data after restart | NOT TESTED | Technical Verification Pending |
| Correct `.node` exists in archive and loads | NOT TESTED | No local B installation or package archive |

Prepared material: physical-file staging, archive inventory/SHA-256 audit, installed-host probe, and write/read modes recording writer/reader PIDs. These scripts have **not** established VSIX success. Installed testing develops only an empty harness with a different ID; the real probe must load from the installed directory. This prevents the development copy from masquerading as installed-VSIX evidence.

## Native packaging findings

- A adds no npm native binary to the VSIX, but its built-in module depends on the **actual host's Node build**. Development success cannot supply it to another host.
- B's official 13.0.3 sources expose a Windows x64 prebuild and N-API 10 build configuration. Its local binary, SQLite version, installation route and host loading remain **Technical Verification Pending**.
- Staging must resolve pnpm symlinks to physical package files. The VSIX audit requires the Windows x64 `.node` path and matching hash. A complete archive still needs an installed-host load/operation test.
- No esbuild output was created. Retaining native resources beside unbundled CommonJS is an **experiment strategy**, not an accepted production packaging policy.
- [vsce file collection source](https://github.com/microsoft/vscode-vsce/blob/main/src/package.ts) excludes nested node_modules from each package glob and gathers dependency packages separately. The prepared command therefore keeps dependency collection enabled; `--no-dependencies` must not be used for this native dependency layout. The actual installed vsce version and resulting inventory remain Technical Verification Pending.

## Commands executed and exact results

CWD unless noted: `D:\Projects\ai-project-visualizer`. [Command evidence](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json) retains the main observations; source/file reads and official-document research were read-only.

| Command | Exit / result |
| --- | --- |
| `git status --short --untracked-files=all` (initial) | 0; clean |
| `git log -5 --oneline` | 0; HEAD 7c24556 |
| `node -p 'JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,modules:process.versions.modules,napi:process.versions.napi,sqlite:process.versions.sqlite,electron:process.versions.electron??null})'` | 0; v24.21.0 / win32 / x64 / 137 / 10 / 3.53.4 / null |
| `code --version` | 0; 1.140.0 / stated commit / x64 |
| `code --help` | 0; CLI options inspected |
| `pnpm --version` | 1; canonicalizing --dir, OS error 5 |
| `pnpm --dir experiments/phase-2-sqlite-driver-spike install --ignore-workspace` | 1; same OS error 5; no candidate install/lockfile |
| `node experiments/phase-2-sqlite-driver-spike/run-node.cjs` | 0; A 14 PASS, B NOT TESTED |
| `& ./experiments/phase-2-sqlite-driver-spike/run-host.ps1` | Launcher 0; Code child -2147483645; host probe NOT TESTED |
| `pnpm --dir experiments/phase-2-sqlite-driver-spike exec vsce --version` | 1; same OS error 5; no packaging tool run |

Final source validation:

| Check / command | Result and boundary |
| --- | --- |
| `node --check` on six `.cjs` files | PASS; JavaScript syntax only, not execution of the untested Host/packaging paths |
| PowerShell `Parser.ParseFile` on `run-host.ps1` and `audit-vsix.ps1` | PASS; syntax only |
| `git diff --check` | PASS; no tracked changes; supplemented by an explicit whitespace scan of new text files |
| New-file trailing-whitespace/blank-EOF and conflict-marker scan | PASS; includes ignored-by-diff untracked text files, excludes disposable runtime databases/profiles |
| Scope audit with `git status --short --untracked-files=all` and `git diff --name-only` | Only the new report and experiment files; no tracked production changes |

See [final validation evidence](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json). A preliminary `git diff --no-index --check NUL <new-file>` returned 1 for new-file differences without whitespace diagnostics, so the separate explicit scan establishes the new-file whitespace result. No dependency install with another package manager, production regression run, commit or push was performed.

The Host launcher now tags evidence with a per-invocation run ID to reject stale receipts. That final source adjustment was syntax-checked; no new successful Host run is claimed. The captured failed launch predates this adjustment and remains the actual launch evidence.

## Known limitations and unverified items

All of the following remain **Technical Verification Pending**:

1. B exact installed resolution/lockfile, Node 24 Windows x64 load, prebuild vs local compilation, and every database probe.
2. Actual Extension Host version matrix and candidate loading/operations. CLI version does not establish Electron/Node/ABI/N-API values.
3. VSIX creation/install/activation, included native resources, loadability and persistent read after a genuine restart.
4. Other Node/VS Code versions, macOS/Linux/ARM64, Remote SSH/WSL/container/web host behavior.

Multi-process contention/crash recovery, APV production schema, migrations, retention, snapshot/cursor atomic recovery, Engines and production surfaces are intentionally outside this spike. The README provides Windows acceptance commands rather than fabricated passing results.

## Recommendation

**More verification required.** A has concrete development Node evidence, but the required Extension Host/VSIX gate has not passed. B cannot be compared fairly without installation and native runtime evidence. Complete the normal Windows acceptance sequence and review results before selecting a driver through a separate explicit decision.

No accepted driver decision was added or altered. Stop here; do not begin production Local Storage implementation.

## Latest W1 / W2 / W3 Windows acceptance review

This review read all existing experiment scripts, the installed VSIX/archive audit, launch receipts and internal probe receipts before attempting W3. New evidence is `experiments/phase-2-sqlite-driver-spike/evidence/w2w3-acceptance-review.json`. Original JSON receipts and the audited VSIX were preserved.

### W2 internal evidence accepted without repeating the experiment

`development-host-probe.json` contains activation PASS, real Electron Host fields, and both drivers' 14 checks PASS. Its run ID `71899f60-6f3a-4a07-9c6e-39d12c2b2c6d` matches `development-launch-probe.json`, which explicitly records current-run evidence. This is not acceptance based on launch exit, an old file merely existing, or ordinary Node output.

| Observed Host field | Value |
| --- | --- |
| Recorded at | 2026-10-08T04:38:04.528Z |
| VS Code | 1.140.0 |
| Host Node | v24.21.0 |
| Electron | 43.7.3 |
| Node module ABI | 148; development Node ABI was 137 |
| N-API | 10 |
| OS / architecture | win32 / x64 |
| Host PID | Retained privately |
| Source mode | test_extension_host, development source, loadedFromInstalledDirectory=false |
| Remote name | null |
| Both SQLite versions | 3.53.4 |

The official extension-test flow labels the source extension Test mode. W2 validates this development-source Host, not installed VSIX provenance. better-sqlite3 reports exactly 13.0.3 and loads win32-x64.node with SHA-256 `e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a`, matching the archive/native-stage evidence. The lock result is still PASS WITH LIMITATION: same-process two connections, not a multi-process contention or crash guarantee.

### W3 attempt in this execution environment

Created a fresh GUID-scoped profile/extensions directory under ignored `_runtime/w3-8e754501-a80b-43cd-96f0-d9716a059696/`. The installed artifact hash is the audited VSIX hash `58d3ba8ec1d41aa5e351de3e2dd6d8351a61c6142ca33c31fe60bffaf78b0089`.

| Action | Actual result |
| --- | --- |
| `code --user-data-dir <isolated profile> --extensions-dir <isolated extensions> --install-extension <audited VSIX> --force` | Exit 0, successful-install message; also emitted EPERM chdir to the Code application directory |
| Inspect isolated installed files | Manifest identity/version match; extension.cjs, probe.cjs and Windows x64 binary hashes match the VSIX |
| Start installed-source official Host test once, with fresh evidence path/run ID | Code PID (retained privately) exited -2147483645 (0x80000003); no internal Host receipt; stdout/stderr empty |
| Installed activation / driver operations / unique write / restart read | NOT TESTED — Technical Verification Pending |

Installation is PASS WITH LIMITATION because the CLI warning is retained and Host activation did not occur. The startup failure is a launch failure, not evidence that either SQLite driver fails in Electron. Its cause is unestablished. Older W3 logs also contain `Disposable extension not found`; those attempts produced no installed receipts and cannot count as a W3 pass. This task did not retry the same failing GUI path or change permissions/settings to work around it.

### Driver comparison and recommendation

| Gate | node:sqlite | better-sqlite3 13.0.3 |
| --- | --- | --- |
| W1 development Node | PASS | PASS |
| W2 development-source Host | PASS | PASS |
| Lock contention scope | PASS WITH LIMITATION | PASS WITH LIMITATION |
| Audited VSIX resources | PASS; no added npm binary | PASS; matching win32-x64 prebuild included |
| W3 installed-source Host | NOT TESTED | NOT TESTED |
| Unique-marker, full test-instance restart persistence | NOT TESTED | NOT TESTED |

**More verification required** remains the recommendation. Both candidates now have concrete W1/W2 evidence; neither has the required W3 installed/restart evidence. Built-in availability and native packaging are separate concerns, not a basis for selecting a driver before that remaining gate. Coverage is this local Windows x64/version combination only; other platforms/architectures/remote hosts remain Technical Verification Pending. No recommendation is recorded as Accepted.

### Accurate Windows CMD fallback

See [WINDOWS_ACCEPTANCE.md](../../experiments/phase-2-sqlite-driver-spike/WINDOWS_ACCEPTANCE.md). It specifies every command and parameter: new isolated namespace, install, actual GUI test launch, installed-path verification, per-driver GUID SQL record, writer exit receipt, new Host and exact persisted record comparison. It explains safe closure and PASS/FAIL/NOT TESTED interpretation.

The added `installed-acceptance-runner.cjs` is disposable test code invoked through the official Extension Host test entry point. It activates the existing installed extension API, validates the original audited artifact/runtime/native hashes, and loads candidate dependencies from that installed directory. It uses separate synthetic GUID records for restart verification; no VSIX or production code is changed. Only syntax/source checks have run on this new fallback runner; its Host execution and four new acceptance receipts remain Technical Verification Pending. The ordinary Node process is used only for source/receipt validation, not as Host acceptance.

Final checks passed: new runner JavaScript syntax, the CMD guide's embedded PowerShell syntax, changed text whitespace/JSON validation and `git diff --check`. All 11 pre-existing evidence JSON hashes and the VSIX hash remain unchanged. The guide's GUI commands have not been executed successfully in this environment; syntax validation does not mark W3 PASS.

Scope remains unchanged: no Core, production Storage, Engines, driver Decision, pnpm configuration, dependency installation, commit or push. Stop for review; do not proceed into implementation.

## W3 static-review blocker remediation

The preceding CMD fallback and its validation record are historical preparation results. Static review found that FAIL could be hidden by later NOT TESTED checks, and a single profile/PID lookup could not prove complete instance exit. The remediated W3-A through W3-G guide supersedes that procedure. No W1/W2 rerun or W3 GUI launch was performed during remediation.

### Verdict correction

`acceptance-verdicts.cjs` is a small pure-data helper imported by the external installed test runner. Any executed FAIL dominates pending checks; without FAIL, missing required checks remain NOT TESTED; all required checks must pass for PASS. Every original check object/error/limitation remains in the internal receipt. Harness failures are recorded separately, with Driver conclusions NOT TESTED when no usable internal driver evidence exists. Diagnostic audit also retains executed failures instead of replacing them with pending prerequisite results.

### Exit correction and honest limits

`w3-session.ps1` captures a pre-install baseline, a separate pre-launch baseline, the owned launch handle's PID/creation time, repeated CIM observations, and a Host-start/CIM handshake. The ledger records creation identity, available parent relationships and the isolated profile. Parent PID alone is not attribution: a simultaneous observed parent creation identity is required for child association. Empty command lines are retained; suspicious new candidates are not discarded by name, path appearance or missing information. PID reuse, failed/incomplete observations, timeout, unavailable identity and uncertain ownership block exit acceptance. No helper terminates processes or changes normal profiles/settings.

Polling does **not** establish complete lifecycle coverage. Accordingly the automatic whole-instance exit verdict remains NOT TESTED even when the known observed set has exited. As explicitly authorized, the fallback records the human's confirmation that all test windows are closed and returns **PASS WITH LIMITATION** only after the known set is gone and all required attribution information is available. Confirmation cannot override a failure or information gap. Read/restart acceptance carries this limitation; there is no unqualified automatic restart PASS. If that stronger proof is required, this procedure must stop for a separate verification method. This is an evidence-scope distinction, not a relaxed automatic PASS rule.

Microsoft's [Win32_Process documentation](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process) documents CreationDate and warns about ParentProcessId reuse. That supports the identity fields; it does not certify this collector's actual Windows execution. The new GUI/CIM handshake remains **Technical Verification Pending**.

### Regression and source validation

The initial 18-case regression reproduced 10 failures in the extracted old verdict behavior. After correction, all 18 passed. Six additional ledger/error-preservation cases then exposed two issues in the new implementation (observation history reset and timeout not retained); both were fixed. Two further cases cover independent PID checks so a CIM omission cannot silently prove a known process gone. Final regression: **26 tests PASS / 0 failures**, using built-in `node:test` and synthetic process/check fixtures only. Coverage includes FAIL followed by NOT TESTED, missing Host receipt, all known processes gone, live processes, PID/creation mismatch, unreadable observations, ambiguous empty-command-line candidates, prior missing/failed evidence, manual confirmation limits, repeated history, parent PID reuse, monitor timeout and independently live/unreadable identities.

Static validation covers the new JavaScript, PowerShell AST, exact guide/action parameters and changed-file whitespace. These checks do not execute the GUI, SQLite driver probes or W3 lifecycle collector. The remediation evidence records a fresh run ID, creation time and ordinary Node/static-test origin separately from actual Host evidence.

All pre-existing 12 evidence JSON files, installed extension/probe/harness source hashes and the original VSIX hash are protected. The changed runner is the external `--extensionTestsPath` entry point; the new pure helper/controller/observer also stay outside the VSIX. The packaged `extension.cjs` and `probe.cjs` are unchanged, so no new package or integrity claim is required. W1/W2 PASS conclusions are unchanged; W3 remains NOT TESTED and the Driver remains NOT SELECTED. See `evidence/w3-blocker-remediation.json` for the final checks and protected hashes.

## W3-G final audit preparation — 2026-10-08

Earlier W3 status paragraphs are historical experiment results. The subsequent real Windows acceptance uses Acceptance ID `f5583c13-ba28-4ff2-8b51-76db2c96f391`, Exit Observation ID `b2084492-3737-422f-9b4e-64a06ca4aafd`, and ReadAttempt ID `750c8a0f-112f-441e-994a-fcfd47461298`. The selected internal reader receipt records Harness PASS, both Drivers PASS WITH LIMITATION, writer PID (retained privately) and reader PID (retained privately), matching restored GUID/writer run references and original VSIX/native hashes. The original NOT TESTED exit and FAIL reader receipts remain unchanged.

The disposable `audit` entry now requires all three explicit IDs. It validates A–F receipt/installation/collection/exit/persistence bindings, retains historical evidence with statuses and hashes, and writes a fresh Audit-ID report by exclusive creation. It preserves selected FAIL before pending checks and never upgrades sampled/manual exit or restart to unconditional PASS. No formal W3-G report was generated during preparation; formal audit and review are pending. No Driver Decision is Accepted.

The evidence covers W1 development Node and W2 development-source Host operations, plus the reported W3 installed Host and distinct-Host GUID restoration with limitations, in this Windows x64/VS Code 1.140.0/Node 24.21.0/Electron 43.7.3 combination. Development Node ABI is 137; Host ABI is 148, N-API 10. Both reported SQLite versions are 3.53.4; better-sqlite3 is 13.0.3. The locking probe uses two connections in one process. Multi-process contention, crash/power-loss recovery, other versions/OS/architectures, remote/web Hosts, production schema/migrations and snapshot/cursor atomic recovery remain unverified. Neither successful GUID restoration nor VSIX packaging establishes those capabilities.

Use only W3-G in [WINDOWS_ACCEPTANCE.md](../../experiments/phase-2-sqlite-driver-spike/WINDOWS_ACCEPTANCE.md). Do not repeat W1/W2 or A–F, replace the VSIX, rewrite the database marker or modify historical JSON to make an audit pass. All preparation changes are outside the VSIX and production Core/Storage.

## Formal W3-G audit and Phase 2.2 decision preparation — 2026-10-08

This is the current outcome. All earlier pending/recommendation paragraphs remain historical records; no prior receipt or status has been rewritten.

The user completed formal audit with exit code 0. [Audit 82eeaa9a-112e-4b2e-aa29-4cb68be3f2dc](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json) records **PASS WITH LIMITATION**, createdAt `2026-10-08T11:12:07.977Z`, source `ordinary_node_receipt_audit_not_host_execution`, and `decisionAccepted: false`. Receipt auditing is not a new Host execution. Acceptance/Exit Observation/ReadAttempt remain the three explicit IDs recorded above.

| Gate | node:sqlite | better-sqlite3 13.0.3 |
| --- | --- | --- |
| W1 development Node | PASS | PASS |
| W2 development-source Extension Host | PASS | PASS |
| W3-A installation / packaged resources | PASS | PASS |
| W3-B/C installed-source Host operations | PASS | PASS |
| W3-D GUID writer | PASS | PASS |
| W3-E exit proof | PASS WITH LIMITATION, shared test-instance evidence | PASS WITH LIMITATION, shared test-instance evidence |
| W3-F distinct installed Host GUID restoration | PASS WITH LIMITATION | PASS WITH LIMITATION |
| W3-G formal audit | PASS WITH LIMITATION | PASS WITH LIMITATION |

Writer and reader identity values are retained in local original receipts. Acceptance binds run IDs, creation identities, original marker/database, explicit exit observation, snapshot references and hashes; different PIDs alone are not persistence proof. Automatic whole-instance exit remains NOT TESTED because process sampling is supplemented by manual test-window closure. The lock test uses two connections in one process, not multi-process competition or crash recovery.

Historical `...-exit.json` remains NOT TESTED (independent PID collector failure); historical `...-read.json` remains FAIL (harness snapshot path representation mismatch), with Driver persistence NOT TESTED. New observation/attempt IDs supplied fresh evidence, not retroactive PASS. Earlier launch failures without internal Host receipts are harness/launch results, not Driver incompatibility. The final audit includes these as `historical_nonselected`, retaining status, errors and hashes.

Current unique recommendation is **better-sqlite3 13.0.3**, recorded in **D-041 Proposed**, for independently pinned API/SQLite maintenance and documented synchronous transaction handling, accepting native distribution obligations. No performance or untested-platform superiority is claimed. Node 24's node:sqlite is still RC; both Drivers have the same measured Windows compatibility scope.

See [Phase 2.2 decision and closure preparation](phase-2.2-closure.md) for official sources, exact runtime/resource baselines, remaining risks, ROADMAP's outstanding selection prerequisites and review checklist. The compatibility sub-spike has sufficient limited evidence for closure review; formal approval and the entire Phase 2 production gates remain outstanding. No production code, Driver installation, Host rerun or historical evidence modification occurred during this documentation review.
