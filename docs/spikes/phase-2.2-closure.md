# Phase 2.2 — SQLite Driver Decision & Closure Preparation

Date: 2026-10-08. Decision: **D-041 Proposed**. Compatibility outcome: **PASS WITH LIMITATION**. User closure review recognizes Compatibility Spike technical verification complete and endorses the sole preferred proposal. Current disposition: **Git compatibility milestone preparation; production Driver acceptance pending**.

## Recommendation and decision boundary

Unique preferred Driver: **better-sqlite3 13.0.3**. Both candidates passed the defined Windows tests, so this preference is a maintenance/transaction API trade-off, not a benchmark result. Keep SQLite, Local-first, Observer positioning and Storage → Core boundaries. No production dependency, schema, framework or implementation is added by this proposal.

Node 24 LTS does not make every built-in API Stable. The exact tested Node v24.21.0 labels `node:sqlite` Stability 1.2 / Release Candidate. Node's stability policy still permits changes at that level. Built-in packaging simplicity is valuable but does not eliminate Host version/API risk. [Pinned SQLite documentation](https://github.com/nodejs/node/blob/v24.21.0/doc/api/sqlite.md), [stability policy](https://nodejs.org/download/release/v24.21.0/docs/api/documentation.html#stability-index).

## Official-document comparison

Documentation researched on 2026-10-08; evidence and inference are distinguished below.

| Dimension | node:sqlite | better-sqlite3 13.0.3 | Decision implication |
| --- | --- | --- | --- |
| Runtime/version | Built into the actual Host Node; cannot independently pin the module or its SQLite version | Package declares Node >=22; APV has tested only the baseline below | Package engines are an upstream requirement, not an APV support matrix. Neither follows the developer's Node installation into VS Code |
| API stability | Tested Node 24 module is RC, distinct from Node LTS | Independently pinned release and established documented JS API, but v13 introduced a new N-API implementation | Prefer a pinned Driver API; neither promises no future regressions |
| VSIX distribution | No separate npm native binary; availability depends on Host build | Native binary and runtime JS must physically survive staging/bundling/install | Accept target-specific resource inventory and installed-artifact hash audits |
| Native maintenance | SQLite/native changes ship with Node/Electron/VS Code | v13 ships N-API prebuilds inside the package; Driver/SQLite updates can be scheduled independently | N-API reduces V8-version coupling, not OS/arch/libc or packaging risk |
| Windows/Linux/macOS | Actual Electron/Node builds must expose the module; Windows x64 passed | Matching package resource/OS/arch/runtime must load; Windows x64 passed | Linux/macOS/ARM64 remain unverified for both; no blanket support claim |
| Errors | SQLite failures surface as ERR_SQLITE_ERROR; observed lock error also retained SQLite numeric code 5 | Documented SqliteError.code uses SQLite extended code names; observed lock error retained SQLITE_BUSY | Preserve original minimal error details; classify busy/constraint/I/O/corruption before recovery. Do not convert failure into empty successful Project State |
| Transactions | SQLite transactions available through SQL exec/prepare and transaction-state inspection | Documented synchronous transaction wrapper, nested savepoints and explicit transaction modes | Prefer explicit exception rollback handling; node:sqlite also supports transactions. Neither API alone validates APV atomic restore |
| Long-term cost | Fewer external resources; Node/VS Code upgrade cadence controls fixes and API changes | Extra dependency/security/native release workload, with independent version control | Prefer control over Driver upgrades, accepting native release work |
| Responsiveness/performance | DatabaseSync is synchronous | Primary query/transaction API is synchronous | Neither has measured APV latency/throughput; bounded work is necessary, placement/performance decisions require later measurements |

Sources: [better-sqlite3 13.0.3 package metadata](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/package.json), [v13 N-API change](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0), [Node-API guarantee boundaries](https://nodejs.org/download/release/v24.21.0/docs/api/n-api.html#implications-of-abi-stability), [Node SQLite API](https://github.com/nodejs/node/blob/v24.21.0/doc/api/sqlite.md), [Node SQLite error](https://nodejs.org/download/release/v24.21.0/docs/api/errors.html#err_sqlite_error), [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/docs/api.md).

Transactions must be synchronous and short; do not use async callbacks or mix a managed transaction with raw COMMIT/ROLLBACK. SQLite can abort a transaction on certain failures, so errors must propagate rather than allowing later writes to appear part of an aborted transaction. This is an implementation constraint from the documented API, not a claim that production behavior exists. Production event/assertion/snapshot/cursor atomicity needs its own tests. [Transaction caveats](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/docs/api.md#transactionfunction---function).

VS Code officially supports platform-specific extension targets. Native resources cannot be assumed to emerge from an esbuild JS bundle; package and audit them explicitly. Source compilation for an unsupported platform is not an accepted end-user installation path without separate approval/verification. [VS Code publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#platform-specific-extensions), [bundling](https://code.visualstudio.com/api/working-with-extensions/bundling-extension).

## Actual evidence and final audit

Original evidence directory: `experiments/phase-2-sqlite-driver-spike/evidence/` (local-only, immutable). JSON links below now lead to the [allowlisted public derivative](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json), whose receipt/input inventories preserve each original filename and SHA-256. They are not public original receipts or independent proof. See [checkpoint/custody manifest](phase-2.2-checkpoint.md) for exclusions and reproduction limits.

- [W1 development Node receipt](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json).
- [W2 internal development Host receipt](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json), bound to [development launcher](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json).
- [Formal W3-G report](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json).

| Identity | Recorded value |
| --- | --- |
| Acceptance ID | f5583c13-ba28-4ff2-8b51-76db2c96f391 |
| Selected Exit Observation ID | b2084492-3737-422f-9b4e-64a06ca4aafd |
| Selected ReadAttempt ID | 750c8a0f-112f-441e-994a-fcfd47461298 |
| Audit ID / runId | 82eeaa9a-112e-4b2e-aa29-4cb68be3f2dc / audit-82eeaa9a-112e-4b2e-aa29-4cb68be3f2dc |
| Audit createdAt / source | 2026-10-08T11:12:07.977Z / ordinary_node_receipt_audit_not_host_execution |
| Audit outcome | User-reported exit code 0; JSON status PASS WITH LIMITATION; decisionAccepted=false |
| Writer / successful reader | Distinct Host identities retained privately; receipt/run/creation-time and marker bindings also checked |

| Gate | node:sqlite | better-sqlite3 13.0.3 | Actual scope |
| --- | --- | --- | --- |
| W1 | PASS | PASS | Real Windows development Node; module load/basic DB probes |
| W2 | PASS | PASS | Real development-source Extension Host internal receipt |
| VSIX integrity / W3-A | PASS | PASS | Isolated installation; original VSIX/runtime/native resources |
| W3-B/C | PASS | PASS | Installed-source Host activation, candidate load and DB probes |
| W3-D | PASS | PASS | Unique GUID record bound to writer run/database |
| W3-E | PASS WITH LIMITATION | PASS WITH LIMITATION | Shared known-process exit proof plus manual test-window closure |
| W3-F | PASS WITH LIMITATION | PASS WITH LIMITATION | Distinct installed Host restores original GUID/writer data |
| W3-G | PASS WITH LIMITATION | PASS WITH LIMITATION | Selected A–F references/hashes, history and persistence bindings audited |

Basic probes include prepare, foreign-key behavior, commit/rollback, WAL, busy timeout, close/reopen and persisted reads. Lock handling is two connections in one process. It is not multi-process contention, a performance measurement or crash testing. No Host/probe/audit stage was rerun for this review; existing receipts were read and their hashes checked locally.

## Required initial environment and release obligations

If approved, start from the **tested tuple**, rather than asserting every version above a nominal minimum works:

- Windows x64, local desktop Host (`remoteName=null`).
- Development Node v24.21.0 / modules 137 / N-API 10; target VS Code 1.140.0 / Electron 43.7.3 / Host Node v24.21.0 / modules 148 / N-API 10.
- Exactly better-sqlite3 13.0.3 and its matching win32-x64 prebuild. Observed SQLite 3.53.4.
- Disposable packaging was CommonJS. Production module format, bundling and engines.vscode range need validation; the spike manifest is not a published APV support promise.
- Driver belongs only in Storage and Host packaging; Core remains Driver/Host independent. Do not require users to replace VS Code's embedded Node.

| Protected artifact | SHA-256 |
| --- | --- |
| Formal audit JSON | f278bfc4d691a63d3fd2cbad1770c11d87a3d48212101e0a4b87961d29b54579 |
| Original win32-x64 VSIX | 58d3ba8ec1d41aa5e351de3e2dd6d8351a61c6142ca33c31fe60bffaf78b0089 |
| better-sqlite3 win32-x64 binary | e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a |

For a new OS/architecture/libc, Host tuple, Driver/SQLite version or packaging path, obtain fresh target-specific development/installed Host/restore evidence before extending support. Include physical binary inventory/hash checks. N-API portability and upstream platform exports justify testing, not skipping it. Linux/macOS and Windows ARM64 remain Technical Verification Pending; Remote/WSL/container/web are not supported by this evidence.

## Historical FAIL / NOT TESTED disposition

The audit's history explicitly includes nonselected attempts with their original hashes/errors. A later valid attempt does not change an earlier verdict:

| Historical record | Original result | Treatment |
| --- | --- | --- |
| Earlier launch receipts without internal Host receipt | NOT TESTED | Launch/harness evidence; no inferred Driver failure or success |
| [Original W3 exit receipt](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json) | NOT TESTED | Independent PID query collector failed; original unchanged. New explicitly selected observation supplies limited proof |
| [Original reader receipt](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json) | Harness FAIL; Driver read NOT TESTED | Snapshot reference path representation mismatch; original unchanged. New explicitly selected ReadAttempt succeeds |
| [Selected exit observation](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json) | PASS WITH LIMITATION | knownSet PASS; automatic whole-instance exit NOT TESTED; manual closure limitation retained |
| [Selected reader attempt](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json) | Harness PASS; both Drivers PASS WITH LIMITATION | Restored original GUID with original VSIX/native hashes; no new writer |

Do not delete or relabel those records, select merely by newest timestamp, or treat the different reader PID alone as proof. Full automatic lifetime coverage remains NOT TESTED; sampled CIM observations cannot exclude every transient/delegated process.

The audit also references ignored `_runtime/` snapshots, Host acknowledgements and lifecycle ledgers, and an ignored VSIX artifact. A Git checkout of evidence JSON alone cannot reconstruct every audit input. Preserve the original hash-bound audit inputs/artifact privately before any future cleanup; do not commit complete profiles, databases, raw process snapshots or user data without a separate privacy review. This review does not delete, export or change them.

## Accepted-risk proposal and outstanding verification

These are risks proposed for acceptance, not already approved guarantees:

1. Native packaging and third-party maintenance: maintain target resources, license/dependency review, Driver/SQLite security updates, and v13 N-API regressions. Pin exact versions and reassess upgrades; do not silently fall back to another Driver after a database error.
2. RC avoidance does not eliminate runtime risk: even better-sqlite3's successful Windows prebuild must be retested for future Host/platform combinations. No Linux/macOS performance or compatibility conclusion exists.
3. Synchronous calls may block the Extension Host. Later Storage work must keep work bounded and measure realistic queries/transactions; this is not authorization to introduce a worker framework now.
4. Limited normal-exit persistence: manual window confirmation remains part of W3 acceptance. Power loss, process crash, multiple writers/windows, disk-full/I/O/corruption recovery and migration failure are unverified.
5. Disposable SQL commit/rollback and GUID restoration do not validate APV provenance/correction retention, replay idempotency, snapshot/cursor atomic recovery, schema or privacy/retention. These remain Phase 2 production prerequisites.

Reevaluate when actual Host node:sqlite reaches Stable and target acceptance passes; Driver maintenance/security/native distribution becomes unacceptable; the runtime/OS/SQLite/packaging baseline changes; or production atomicity/error/latency measurements reveal a mismatch. Keep historical decisions and record any replacement explicitly.

## Closure checklist and specification gate

| Condition | Status |
| --- | --- |
| Defined W1/W2/W3 Windows compatibility gates and formal W3-G audit | Complete, PASS WITH LIMITATION |
| Explicit selected observation/read identity; original VSIX/native hashes | Complete in the selected audit |
| Historical failures/pending attempts preserved and included | Complete in audit history; retained locally |
| Unique recommendation, official rationale, baseline, risks and revisit triggers | Documented; D-041 Proposed |
| User endorsement of sole preferred proposal and compatibility technical completion | Confirmed by closure review; PASS WITH LIMITATION retained |
| Production Driver approval / D-041 Accepted | Pending; decisionAccepted remains false |
| ROADMAP Phase 2 selection prerequisites: atomic recovery and privacy/retention | Technical Verification Pending; not waived |
| Production Local Storage / complete Phase 2 closure | Not complete; not part of this review |
| Hash-bound ignored audit-input archive before future cleanup/handoff | Required preservation obligation; no archive created or portability claim made here |

**Phase 2.2 Compatibility Spike technical verification is complete with PASS WITH LIMITATION per user closure review; production Driver acceptance remains pending.** ROADMAP currently places atomic recovery and privacy/retention before selection. This proposal leaves that rule intact: satisfy it, or obtain an explicit user decision on ordering before accepting the Driver. Compatibility PASS cannot silently override that specification requirement. This document authorizes no next implementation phase.
