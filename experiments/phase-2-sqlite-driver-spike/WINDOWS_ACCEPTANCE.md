# W3 Windows 11 CMD acceptance — remediated infrastructure

W1/W2 are already PASS and must not be rerun. Reuse the original audited VSIX unchanged. Human acceptance `f5583c13-ba28-4ff2-8b51-76db2c96f391` has completed W3-A through W3-D. Its original W3-E receipt remains NOT TESTED. Supplemental observation `b2084492-3737-422f-9b4e-64a06ca4aafd` is PASS WITH LIMITATION, with knownSet PASS and automaticStatus NOT TESTED. The original W3-F Host failed its harness before persistence reads because of a `D:`/`d:` reference comparison; its FAIL receipt is immutable. ReadAttempt `750c8a0f-112f-441e-994a-fcfd47461298` records Harness PASS and both Drivers PASS WITH LIMITATION, restoring original GUID records in a distinct installed Host. W3-G Audit `82eeaa9a-112e-4b2e-aa29-4cb68be3f2dc` is PASS WITH LIMITATION, user-reported exit 0. Compatibility technical verification is complete; D-041 remains Proposed. Do not repeat W1/W2 or A–G for this checkpoint.

This guide preserves the actual Windows CMD reproduction procedure, not an instruction to rerun acceptance. Original `evidence/` receipts and `_runtime/` inputs are local-only and immutable. Consult [the public summary](public-evidence/compatibility-summary.json) for results/hash references; a public clone lacks the original VSIX/private inputs and cannot re-audit this historical run from the summary alone. Future authorized reproduction needs a separate clean checkout, new IDs and separately audited artifact; never reuse preserved IDs or overwrite the writer marker. Example project/VS Code installation paths match the recorded environment and must be checked/adapted before such a run.

Use one interactive CMD window throughout. The PowerShell helper is invoked from CMD only for Windows process observation and the human-requested GUI launch; it is not the default terminal. Do not change execution policy, permissions or pnpm settings. If execution is blocked, preserve the error and stop.

Exit evidence is limited: PID + creation time identifies observed processes; repeated snapshots and a Host/CIM handshake record reliably associated processes. Sampling cannot prove every short-lived/delegated process was seen. There is NO automatic whole-instance exit PASS. Human confirmation allows PASS WITH LIMITATION only when all known identities are gone and no ambiguous process, information gap, observation error or timeout remains. The limitation propagates to restart acceptance.

Read every result before the next block. Any error, empty GUID, FAIL or NOT TESTED means STOP. Do not repeat a failed launch with the same ID; exclusive file creation prevents replacing evidence. The helpers never terminate processes or delete data.

## W3-A — isolated environment and VSIX installation

Preconditions: Node, the observed VS Code installation and the audited VSIX exist. Do not close normal VS Code windows. Initialize a fresh namespace, record the process baseline before installation, then install:

```cmd
cd /d D:\Projects\ai-project-visualizer\experiments\phase-2-sqlite-driver-spike
set "APV_ACCEPTANCE_ID="
for /f %G in ('node w3-evidence.cjs init') do set "APV_ACCEPTANCE_ID=%G"
echo Acceptance ID: %APV_ACCEPTANCE_ID%
if not defined APV_ACCEPTANCE_ID echo STOP: initialization failed
set "APV_PROFILE=%CD%\_runtime\w3-cmd-%APV_ACCEPTANCE_ID%\user-data"
set "APV_EXTENSIONS=%CD%\_runtime\w3-cmd-%APV_ACCEPTANCE_ID%\extensions"
set "APV_VSIX=%CD%\artifacts\apv-sqlite-driver-spike-win32-x64.vsix"
powershell -NoProfile -File .\w3-session.ps1 -Action baseline -AcceptanceId "%APV_ACCEPTANCE_ID%"
echo Baseline exit code: %errorlevel%
call "D:\Apps\Microsoft VS Code\bin\code.cmd" --user-data-dir "%APV_PROFILE%" --extensions-dir "%APV_EXTENSIONS%" --install-extension "%APV_VSIX%" --force
echo Installation exit code: %errorlevel%
call "D:\Apps\Microsoft VS Code\bin\code.cmd" --user-data-dir "%APV_PROFILE%" --extensions-dir "%APV_EXTENSIONS%" --list-extensions --show-versions
node w3-evidence.cjs check-install "%APV_ACCEPTANCE_ID%"
echo Installation audit exit code: %errorlevel%
```

Success: a nonempty new GUID; baseline exit 0; installation/list includes apv-disposable-spike.apv-sqlite-driver-spike@0.0.0; audit exit 0 says Installation integrity PASS; Host not tested. Init verifies the original VSIX hash. Audit checks installed identity/version, extension/probe bytes and Windows x64 native hash. Review unexpected CLI errors even if files exist. Installation is not Host PASS.

Evidence: evidence\w3-<GUID>-baseline.json and -install.json; setup in _runtime\w3-cmd-<GUID>\session.json. All profile/extensions/database paths are under this GUID directory. If any command fails, do not continue.

## W3-B — actual Installed Extension Host

Preconditions: W3-A succeeded; no earlier probe attempt/receipt for this ID. The helper records another baseline before launch, captures the owned launch process identity and repeatedly observes processes. The Host waits for its actual CIM identity. Only an empty harness with a DIFFERENT extension ID is developed; the probe must load from the installed directory.

```cmd
powershell -NoProfile -File .\w3-session.ps1 -Action launch -AcceptanceId "%APV_ACCEPTANCE_ID%" -Mode probe
echo Installed Host launch/check exit code: %errorlevel%
```

Human action: observe the disposable Extension Development Host window opening; allow tests to finish and normally close it. Do not run terminals or unrelated work in that window. The helper uses a 120-second monotonic observation budget and short CIM operation timeout; a blocked Windows API can delay return, which is not acceptance evidence. It never force-closes processes. If it times out/fails, stop and preserve evidence; use File -> Exit only in the test window if needed. Do not close normal windows.

Success requires W3-C internal evidence, not window visibility or a returned CLI code. Missing Host receipt, unreadable baseline or failed handshake leaves Driver conclusions NOT TESTED. A launch failure alone is not Driver FAIL.

Evidence: _runtime\w3-cmd-<GUID>\probe-lifecycle.json, probe-host-start.json, probe-host-ack.json, probe.stdout.txt/probe.stderr.txt; internal receipt evidence\w3-<GUID>-probe.json.

## W3-C — both Drivers from internal Host receipts

Precondition: W3-B produced a current receipt. This reads JSON; ordinary Node does not run the database probe.

```cmd
node w3-evidence.cjs check "%APV_ACCEPTANCE_ID%" probe
echo Driver receipt audit exit code: %errorlevel%
type "evidence\w3-%APV_ACCEPTANCE_ID%-probe.json"
```

Success: exit 0; source=vscode_extension_host; matching GUID and runId=probe-<GUID>; actual VS Code/Node/Electron/ABI/N-API/Windows x64; loadedFromInstalledDirectory=true; harness PASS; both candidate checks PASS. Inspect SQLite versions, better-sqlite3 13.0.3, native hash and lock-test limitation. An executed FAIL dominates later NOT TESTED checks; original errors and independent statuses remain in the receipt. Stop on any failed/pending required check or missing current receipt.

## W3-D — write the GUID SQL record

Preconditions: W3-C passed and probe test windows exited. The helper repeats the baseline and refuses a still-running matching profile or opaque Code baseline.

```cmd
powershell -NoProfile -File .\w3-session.ps1 -Action launch -AcceptanceId "%APV_ACCEPTANCE_ID%" -Mode write
echo Writer launch/check exit code: %errorlevel%
node w3-evidence.cjs check "%APV_ACCEPTANCE_ID%" write
echo Writer receipt audit exit code: %errorlevel%
type "evidence\w3-%APV_ACCEPTANCE_ID%-write.json"
```

Success: current write receipt PASS. Each candidate writes the exact GUID, writer Host PID, write-<GUID> run ID and VSIX hash. The per-driver database under _runtime\w3-cmd-<GUID>\restart-data is retained for W3-F. Duplicate writes fail instead of replacing the row. Any error means stop.

Evidence: evidence\w3-<GUID>-write.json; writer lifecycle, handshake and logs under the same runtime directory. Keep this CMD open and keep the same GUID.

## W3-E — safe exit with explicitly limited human confirmation

Preconditions: writer command returned and its receipt passed. HUMAN ACTION: verify ALL disposable test-profile windows are closed. If one remains, use File -> Exit in that window. Never use taskkill /IM Code.exe, terminate by process name, or close normal VS Code windows. If window/process ownership is unclear, stop instead of guessing.

Only after that action:

```cmd
powershell -NoProfile -File .\w3-session.ps1 -Action exit -AcceptanceId "%APV_ACCEPTANCE_ID%"
echo Final observation exit code: %errorlevel%
node w3-evidence.cjs review-exit "%APV_ACCEPTANCE_ID%" --confirm-test-windows-closed
echo Exit evidence audit code: %errorlevel%
type "evidence\w3-%APV_ACCEPTANCE_ID%-exit.json"
```

The flag records YOUR confirmation, not an automatic claim. Success: exit 0; knownSet.status=PASS for the OBSERVED known process set only; whole-instance status=PASS WITH LIMITATION; automaticStatus=NOT TESTED; method=manual_confirmation_with_sampled_process_tracking; limitations recorded. The audit combines baseline, repeated observations, launch/Host PID+creation identities, a final CIM snapshot and independent Process-handle PID/creation checks. Absence from CIM alone does not prove exit. A known live process, PID reuse/mismatch, unreadable metadata, ambiguous process/ancestry, timeout or observation failure blocks this step. Manual confirmation cannot override these conditions. Empty command lines are retained, not silently discarded.

Evidence: evidence\w3-<GUID>-exit.json; _runtime\w3-cmd-<GUID>\exit-snapshot.json and writer lifecycle. Without a valid LIMITED exit receipt, DO NOT start W3-F. If unqualified automatic whole-instance proof is required, stop for a separate verification method.

### W3-E supplement after the PowerShell 5 array defect

Root cause in the recorded run: `@($taskIdentityText | ConvertFrom-Json)` yielded one nested array on Windows PowerShell 5.1. The original snapshot saved ONE independent record containing arrays of 18 PIDs and 18 creation times, `state=unreadable`, `errorType=RuntimeException`. Casting that array to one integer failed before `GetProcessById` ran. The Node reader correctly found no matching scalar record for each known identity. This is a collector parsing defect, not evidence that any process exited or that a Driver failed. No original evidence is repaired or promoted.

The collector now assigns the parsed JSON array directly, validates each scalar identity, and records query execution, source, result code, observation/completion times and available error type. `alive` means the original identity is still present (FAIL); `gone` requires an actual PID lookup reporting not found; `pid_reused` means a different creation identity and remains blocked; `unreadable`/missing query evidence remains NOT TESTED. CIM absence alone is insufficient.

Preconditions: the original writer receipt/lifecycle, databases, session and VSIX are retained unchanged; no new Host has been started. Manually verify that all windows belonging to the isolated test profile are closed. Do not close normal windows. If ownership is uncertain, STOP. These commands ONLY collect fresh exit observations; they do not install, write databases, launch or kill a process. Use interactive Windows CMD, not a batch file (which would require `%%G`).

```cmd
cd /d D:\Projects\ai-project-visualizer\experiments\phase-2-sqlite-driver-spike
set "APV_ACCEPTANCE_ID=f5583c13-ba28-4ff2-8b51-76db2c96f391"
set "APV_EXIT_OBSERVATION_ID="
for /f %G in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString()"') do set "APV_EXIT_OBSERVATION_ID=%G"
echo Observation ID: %APV_EXIT_OBSERVATION_ID%
if not defined APV_EXIT_OBSERVATION_ID echo STOP: observation identity generation failed
if defined APV_EXIT_OBSERVATION_ID powershell -NoProfile -File .\w3-session.ps1 -Action exit -AcceptanceId "%APV_ACCEPTANCE_ID%" -ObservationId "%APV_EXIT_OBSERVATION_ID%"
echo Observation exit code: %errorlevel%
```

STOP on an empty identity, script/policy/permission error, or nonzero exit code. Do not change execution policy or permissions. Exit 0 means fresh observations were saved, NOT acceptance PASS. Only if this block succeeds and your test-window closure confirmation is accurate, run:

```cmd
node w3-evidence.cjs review-exit "%APV_ACCEPTANCE_ID%" --confirm-test-windows-closed "%APV_EXIT_OBSERVATION_ID%"
echo Supplemental review exit code: %errorlevel%
type "evidence\w3-%APV_ACCEPTANCE_ID%-exit-%APV_EXIT_OBSERVATION_ID%.json"
```

New observations: `_runtime\w3-cmd-<AcceptanceID>\exit-<ObservationID>-snapshot.json`. New receipt: `evidence\w3-<AcceptanceID>-exit-<ObservationID>.json`, with separate `runId=exit-<ObservationID>`, original Acceptance ID, writer identity and SHA-256 references to writer/lifecycle/new snapshot/previous receipt. The snapshot records observer PID, PowerShell version, execution identity and creation time. All files use exclusive creation; reuse of an attempt ID stops before collecting or writing over evidence.

Review exit 0 is possible only for `knownSet.status=PASS`, overall `PASS WITH LIMITATION`, `automaticStatus=NOT TESTED` and explicit human confirmation. Missing information, live known processes, PID reuse or query failure blocks success. PID reuse in a later supplement can therefore leave W3-E unresolved. A later observation describes its actual later time; it cannot prove the earlier failed attempt succeeded or that no unobserved process existed in between.

STOP after this supplemental review and submit the new receipt/snapshot for review. The original `-exit.json` remains NOT TESTED. W3-F now requires an explicit Observation ID, validates its complete reference chain, and binds that exact receipt path/hash into the external Installed Host runner. It never selects a receipt by file time. Sampling/manual confirmation limitations remain; no automatic whole-instance PASS is introduced.

## W3-F — new Host and persisted data read

### Confirmed drive-letter mismatch and safe retry

The original error is in `w3-evidence.cjs` reference validation, called by the external runner, not the installed extension. Snapshot actual path begins `D:\Projects\ai-project-visualizer\...`; Host-derived expected path begins `d:\Projects\ai-project-visualizer\...`. Host logs locate the runner under lowercase `d:`. Loading the same controller with that directory reproduces the exact assertion. CLI loads it under uppercase `D:` and passes. Remaining path components identify the same snapshot, and the selected evidence hashes validate unchanged.

The shared comparison now requires absolute volume/share paths, resolves separators/dot segments and canonicalizes ONLY the Windows drive letter. Directory/file case remains exact. The Host's selected receipt path uses the same comparison; all reference/receipt SHA-256, namespace, Writer and recomputed exit checks remain. The VSIX does not contain the external runner/controller. Installed extension/probe/native bytes match their VSIX entries, so no repackaging or reinstall is needed.

The existing `-read.json`, `read-lifecycle.json`, handshake and logs prevent repeating that namespace. Use a new ReadAttempt ID; receipt, lifecycle, handshake and logs get that ID. The Acceptance ID, approved exit Observation ID, databases and writer evidence stay unchanged. Do not rename, delete or overwrite the failed attempt.

Preconditions: W3-E limited manual proof is acceptable for this explicitly limited experiment. Do not change GUID, database, VSIX or writer evidence. Explicitly select the accepted Observation ID. First perform a read-only gate check; it validates Acceptance/Observation/Writer IDs, writer identity, source/status/method, confirmation time, exact reference paths and SHA-256 hashes, and recomputes the sampled known-set verdict from the linked snapshot/lifecycle. It does not write evidence or start a Host:

```cmd
cd /d D:\Projects\ai-project-visualizer\experiments\phase-2-sqlite-driver-spike
set "APV_ACCEPTANCE_ID=f5583c13-ba28-4ff2-8b51-76db2c96f391"
set "APV_EXIT_OBSERVATION_ID=b2084492-3737-422f-9b4e-64a06ca4aafd"
set "APV_READ_ATTEMPT_ID="
for /f %G in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString()"') do set "APV_READ_ATTEMPT_ID=%G"
echo ReadAttempt ID: %APV_READ_ATTEMPT_ID%
node w3-evidence.cjs check-exit "%APV_ACCEPTANCE_ID%" "%APV_EXIT_OBSERVATION_ID%"
echo Read gate exit code: %errorlevel%
```

STOP if the attempt ID is empty, the gate returns nonzero, evidence is missing/corrupted, or any binding fails. Do not regenerate or edit old receipts. First manually confirm all test-profile windows from the failed attempt have closed (File -> Exit only in a reliably identified test window); the launcher also refuses an active profile or opaque process baseline. Never terminate normal VS Code processes. Only after gate exit 0, with the displayed Observation ID matching your explicit selection, manually run:

```cmd
if defined APV_READ_ATTEMPT_ID powershell -NoProfile -File .\w3-session.ps1 -Action launch -AcceptanceId "%APV_ACCEPTANCE_ID%" -Mode read -ObservationId "%APV_EXIT_OBSERVATION_ID%" -ReadAttemptId "%APV_READ_ATTEMPT_ID%"
echo Reader launch/check exit code: %errorlevel%
```

STOP on a nonzero launch/check code. Inspect the NEW receipt for a failure; do not repeat an attempt ID. After launch/check exit 0:

```cmd
node w3-evidence.cjs check-read "%APV_ACCEPTANCE_ID%" "%APV_READ_ATTEMPT_ID%"
echo Reader receipt audit exit code: %errorlevel%
type "evidence\w3-%APV_ACCEPTANCE_ID%-read-%APV_READ_ATTEMPT_ID%.json"
```

Success: actual current installed Host, different Host PID/creation identity/run ID, and both databases yield the exact GUID, prior writer identity/run ID and VSIX hash. The Host repeats the shared exit gate and checks the selected receipt path/hash against pre-launch values; `writerExitReceipt` records Acceptance/Observation/exit run IDs, path and hash. PID difference alone is insufficient. Missing databases/rows are not recreated. Driver capability checks remain separate from harness/exit/persistence prerequisites. Root read status is PASS WITH LIMITATION, carrying W3-E limitations; not unqualified restart PASS. Any mismatch or missing prerequisite stops acceptance.

Retry evidence: `evidence\w3-<AcceptanceID>-read-<ReadAttemptID>.json`, with `runId=read-<ReadAttemptID>`, `readAttemptId`, original Acceptance ID and selected exit binding. Lifecycle, handshake, stdout/stderr use prefix `read-<ReadAttemptID>` under the original ignored runtime namespace. `check-read` only audits this explicit attempt, never the original FAIL or the latest file.

Stop after W3-F and submit the new read receipt for review. The subsequent real Host harness failure occurred before the GUID persistence queries; it does not require repeating the writer. All existing A–E evidence and the original W3-F FAIL are immutable. These launcher/controller/external-runner changes are outside the packaged VSIX; no repackage is required.

## W3-G — current evidence audit and summary

Preconditions: A–F evidence, ignored runtime lifecycle/handshake/snapshot files, session, original installed files and VSIX remain present and unchanged. Select the exact approved Exit Observation ID and successful ReadAttempt ID. The audit never scans timestamps to pick a winning attempt. Ordinary Node only reads/hashes files: it does not launch a Host, load a SQLite driver, open a database, reinstall, rewrite a GUID row or repeat an acceptance stage.

```cmd
cd /d D:\Projects\ai-project-visualizer\experiments\phase-2-sqlite-driver-spike
set "APV_ACCEPTANCE_ID=f5583c13-ba28-4ff2-8b51-76db2c96f391"
set "APV_EXIT_OBSERVATION_ID=b2084492-3737-422f-9b4e-64a06ca4aafd"
set "APV_READ_ATTEMPT_ID=750c8a0f-112f-441e-994a-fcfd47461298"
node w3-evidence.cjs audit "%APV_ACCEPTANCE_ID%" "%APV_EXIT_OBSERVATION_ID%" "%APV_READ_ATTEMPT_ID%"
echo Final evidence audit exit code: %errorlevel%
```

The CLI automatically generates a fresh Audit ID and prints `reportPath`: `evidence\w3-<AcceptanceID>-summary-<AuditID>.json`. Output uses exclusive creation; another audit creates another report and retains prior reports in history. Source is `ordinary_node_receipt_audit_not_host_execution`. Do not look for or replace a canonical `-summary.json`.

Audit checks: A baseline/source/profile/time and installation identity/current runtime/native hashes; B/C actual installed Host receipt and probe checks; D writer record; E the explicitly selected limited exit proof and its full hash/recomputed-known-set chain; F the selected reader receipt plus lifecycle and Host/CIM handshake. Cross-checks include Acceptance/Observation/ReadAttempt/Writer run IDs, exit receipt path/hash, exact writer identity, different reader PID AND creation identity, reader timing after the approved exit, per-driver restored GUID/writer PID/run ID, common VSIX/native hashes and preserved limitations. PID difference alone is insufficient.

Success is exit 0 with overall **PASS WITH LIMITATION**, both driver restart acceptance statuses PASS WITH LIMITATION, `decisionAccepted=false`, and full limitation/scope fields. Automatic whole-instance exit stays NOT TESTED. Missing/corrupt/mismatched evidence stays NOT TESTED; an executed failure in a selected Host/driver receipt dominates pending checks. A failed Host/harness alone does not fabricate a Driver FAIL.

`history.entries` inventories all existing experiment evidence JSON and the current Acceptance runtime JSON, with file hashes, reported statuses, sources, errors, driver statuses and `selectionRole`. The original `-exit.json` NOT TESTED and `-read.json` FAIL remain `historical_nonselected`, explicitly visible; they do not satisfy the selected chain or disappear from history. Prior summaries and unrelated earlier spike attempts are retained as historical context. Unreadable history blocks an otherwise successful final summary. Historical failures are not retroactively promoted and do not prevent a fully validated later retry from being reported with its limitations.

Stop on nonzero exit, FAIL or NOT TESTED; submit the diagnostic report and original evidence for review. On limited success, submit the path shown by `reportPath` for formal review. No final audit was executed during tool preparation. Do not change a Driver Decision or begin production Storage.

Stop after successful limited acceptance or any blocker. Submit evidence for review. Do not select a Driver, rebuild VSIX, start production Storage, change permissions/settings or commit/push.

## Source boundary and unverified behavior

Microsoft notes ParentProcessId can refer to a reused PID; CreationDate helps identify the relationship. Recording those fields does not make polling a complete lifecycle trace: [Win32_Process documentation](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process).

Regression fixtures validate verdicts, sampled-ledger handling, explicit read-gate/final-audit selection, mismatched IDs, damaged/missing references, selected failure precedence and historical failures. Windows PowerShell 5.1 tests exercise actual collector parsing/PID queries; they do not constitute Host acceptance. Real W3-F now has an internal limited-success receipt; formal W3-G remains pending. Installed extension bytes and the original VSIX are unchanged.

Verified coverage is the recorded Windows x64 environment: development Node 24.21.0 (ABI 137), development-source and installed VS Code 1.140.0 Hosts using Node 24.21.0/Electron 43.7.3 (ABI 148, N-API 10), better-sqlite3 13.0.3 and SQLite 3.53.4. W1 covers development Node operations; W2 covers the development-source Host; W3 covers installed runtime and the GUID record restored by a distinct Host, subject to sampled/manual exit limitations. Two-connection locking tests run in one process. Multi-process contention, crash/power-loss recovery, other versions/platforms/architectures, Remote SSH/WSL/container/web Hosts, production schema/migrations and snapshot/cursor atomic recovery are NOT VERIFIED by these experiments.
