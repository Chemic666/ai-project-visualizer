# Phase 2.2 — Closure Review and Exact Git Checkpoint Manifest

Review date: 2026-10-08. Compatibility technical verification: **complete, PASS WITH LIMITATION**, as recognized by the user. Sole preferred proposal: **better-sqlite3@13.0.3**. D-041 remains **Proposed**, production Driver decision is not Accepted. This checkpoint neither waives Phase 2 prerequisites nor authorizes Phase 2.3/production Storage.

## Exact proposed submission: 27 files

Paths are repository-relative. This is an explicit allowlist, not permission to stage a directory, use git add . / -A, commit or push.

Six formal documents: decisions, roadmap, current stack, historical results/current outcome, closure assessment, and this manifest. Twenty disposable experiment source/configuration/documentation files preserve candidate versions, install/package/audit methods, Host entry points, identity gates, regression fixtures and Windows commands. One separate public JSON derivative preserves allowlisted results and private-original hashes.

```text
DECISIONS.md
ROADMAP.md
docs/TECH_STACK.md
docs/spikes/phase-2.2-closure.md
docs/spikes/sqlite-driver-compatibility-results.md
docs/spikes/phase-2.2-checkpoint.md
experiments/phase-2-sqlite-driver-spike/.gitignore
experiments/phase-2-sqlite-driver-spike/.vscodeignore
experiments/phase-2-sqlite-driver-spike/README.md
experiments/phase-2-sqlite-driver-spike/WINDOWS_ACCEPTANCE.md
experiments/phase-2-sqlite-driver-spike/acceptance-regression.test.cjs
experiments/phase-2-sqlite-driver-spike/acceptance-verdicts.cjs
experiments/phase-2-sqlite-driver-spike/audit-vsix.ps1
experiments/phase-2-sqlite-driver-spike/extension.cjs
experiments/phase-2-sqlite-driver-spike/host-harness/index.cjs
experiments/phase-2-sqlite-driver-spike/host-harness/package.json
experiments/phase-2-sqlite-driver-spike/host-runner.cjs
experiments/phase-2-sqlite-driver-spike/installed-acceptance-runner.cjs
experiments/phase-2-sqlite-driver-spike/package.json
experiments/phase-2-sqlite-driver-spike/pnpm-lock.yaml
experiments/phase-2-sqlite-driver-spike/probe.cjs
experiments/phase-2-sqlite-driver-spike/run-host.ps1
experiments/phase-2-sqlite-driver-spike/run-node.cjs
experiments/phase-2-sqlite-driver-spike/stage-vsix.cjs
experiments/phase-2-sqlite-driver-spike/w3-evidence.cjs
experiments/phase-2-sqlite-driver-spike/w3-session.ps1
experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json
```

No production Core/Storage, root dependency configuration or earlier phase file belongs in this checkpoint.

## Local originals: preserve, exclude from Git

All 22 original JSON receipts under `experiments/phase-2-sqlite-driver-spike/evidence/` remain byte-for-byte unchanged. Even smaller receipts are excluded as a single local-original set to prevent confusing a partly published evidence chain with a complete audit. The experiment .gitignore now excludes this directory; nothing is deleted or relocated.

Exact filenames and SHA-256 are in `localOriginalReceipts` of [the public digest](../../experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json). The 36 original audit-history inputs are separately listed in `originalAuditInputInventory`, with original selection roles and verdicts; historical FAIL/NOT TESTED are not omitted or upgraded. Those inventories are custody references, not download links or newly generated Host evidence.

Original audit:
- ID: `82eeaa9a-112e-4b2e-aa29-4cb68be3f2dc`; status PASS WITH LIMITATION; decisionAccepted=false.
- File: `evidence/w3-f5583c13-ba28-4ff2-8b51-76db2c96f391-summary-82eeaa9a-112e-4b2e-aa29-4cb68be3f2dc.json`.
- SHA-256: `f278bfc4d691a63d3fd2cbad1770c11d87a3d48212101e0a4b87961d29b54579`.
- Bindings: Acceptance `f5583c13-ba28-4ff2-8b51-76db2c96f391`, Exit Observation `b2084492-3737-422f-9b4e-64a06ca4aafd`, ReadAttempt `750c8a0f-112f-441e-994a-fcfd47461298`.

Retain locally:
1. The entire original `evidence/` set, including original exit NOT TESTED and reader harness FAIL, successful supplemental receipts and final audit.
2. `_runtime/w3-cmd-f5583c13-ba28-4ff2-8b51-76db2c96f391/` original snapshots, independent-PID observations, Host acknowledgements, lifecycle ledgers, writer/reader files and per-candidate GUID databases. These are necessary to recompute the historical audit.
3. Original `artifacts/apv-sqlite-driver-spike-win32-x64.vsix` (SHA-256 `58d3ba8ec1d41aa5e351de3e2dd6d8351a61c6142ca33c31fe60bffaf78b0089`) and the installed/staged win32-x64 native binary (SHA-256 `e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a`).
4. Relevant isolated runtime/profile and artifact files while preserving this audit chain. No cleanup is authorized. Preserve a private hash-bound copy before any future cleanup/move; this review creates no independent backup or portable archive.

Do not rerun legacy fixed-name writers in this checkout. In particular `run-node.cjs`, `run-host.ps1` and `host-runner.cjs` can replace receipts. The legacy launcher also uses PID-only timeout termination without a creation-time recheck; it must remain historical inspection material, not a safe cleanup instruction. Any new launch/cleanup procedure needs separately reviewed ownership guards; this checkpoint changes no runtime behavior. Fresh authorized reproduction uses a separate clean checkout and fresh W3 IDs/artifacts, with the current manual W3 guide and no termination of normal VS Code processes.

## Exclusions and privacy assessment

| Exclude | Reason / local disposition |
| --- | --- |
| `experiments/phase-2-sqlite-driver-spike/evidence/**` | Original receipts include machine paths and runtime/process metadata; preserve locally with original hashes |
| `experiments/phase-2-sqlite-driver-spike/_runtime/**` | Process snapshots can reveal unrelated application activity, command lines, executable locations and creation identities; profiles/databases/runtime state must remain private |
| `experiments/phase-2-sqlite-driver-spike/artifacts/**`, all `*.vsix` / `*.node` | Staged dependencies/native and binary build artifacts; retain original audited artifact locally, not as Git source |
| `node_modules/**`, pnpm store/cache/state, generated logs/temp files | Installed dependencies/cache and operational state; neither evidence publication nor source |
| Other files outside the exact allowlist | Not reviewed/authorized for this checkpoint; do not stage implicitly |

The public digest is a **new allowlisted derivative**, not a modified original. It keeps actual version tuples, stage/candidate verdicts, explicit synthetic acceptance IDs, original hashes and limitations. It omits real PIDs, process creation identities, command lines, local absolute paths, environment dumps, profile settings, database contents and raw output/errors. It cannot independently prove the historical execution or replace private inputs.

The source/docs contain recorded non-personal paths `D:\\Projects\\ai-project-visualizer` and `D:\\Apps\\Microsoft VS Code`: explicit reproduction prerequisites, not user profile identifiers. `w3-session.ps1` currently uses the latter Code.exe path; other machines must verify/adapt their separate experiment copy before a newly authorized run. No runtime path-discovery behavior is added here. GitHub repository URLs identify the existing public remote; fixture GUIDs and dates identify synthetic test records, not credentials.

No credential signature, personal user-home path or email address was found in the proposed allowlist by the bounded scan. Dependency names such as secretlint/jsonwebtoken and lockfile integrity strings are package metadata, not credential findings. A pattern scan is not proof that arbitrary future runtime receipts are safe: new publication must repeat field-level review.

README public-summary links use a GitHub absolute URL, avoiding the former missing cross-directory VSIX README link. The original VSIX/native hashes remain unchanged. README and ignore-policy documentation changes mean a future rebuild is a new artifact needing its own audit; do not transfer old installed/restart evidence to that new VSIX.

## Public reproducibility scope

A GitHub checkout contains the exact disposable source/lockfile, candidate probes, package-stage/resource auditor, external installed Host runner, process/receipt validators, regression tests and W3-A–G Windows instructions. It explains successful and unsuccessful attempts, the actual tested tuple and limitations without publishing process inventories.

A public checkout does **not** contain historical private audit inputs or the old VSIX. It can explain and, after separately authorized setup, reproduce the method as a **new run**; it cannot independently recompute the old audit from a digest/hash alone. Preserve this distinction in any release claim. .vscodeignore excludes raw/public evidence from future extension payloads.

## D-041 acceptance gates — unchanged

1. **Event / Snapshot / Cursor atomicity and fault recovery contract:** define one durable transaction boundary for required event/assertion/correction/snapshot/cursor updates, rollback/no-cursor-advance on failure, duplicate/replay behavior and recovery authority. Specify fault cases and subsequent validation for interrupted commits, partial writes and corrupt/incompatible state. Disposable SQL commit/rollback and GUID restore do not validate that APV contract.
2. **Privacy Allowlist / Retention / deletion / storage boundaries:** approve allowed fields, raw-data exclusions and redaction, bounded retention/deletion scope and preservation of explanation/correction provenance; define repo-external app-storage ownership/location and deletion effects on snapshots/cursors/references. No retention duration or deletion semantics is invented by this checkpoint.
3. **Supported platform/runtime boundary:** restrict initial evidence to local Windows x64, VS Code 1.140.0 / Electron 43.7.3 / Host Node v24.21.0 (modules 148 / N-API 10), better-sqlite3 13.0.3. Other Node/VS Code versions, Linux/macOS/ARM64 and remote/WSL/container/web remain unverified. Additional targets need their own gates; exclusion from initial support must be explicit, not a false PASS.
4. **Formal approval after prerequisites:** D-041 remains Proposed. Resolve ROADMAP's atomic-recovery and Privacy/Retention prerequisites before Accepted; compatibility checkpoint approval does not change their order. Full automatic exit, multi-process contention, crash/power-loss recovery, production schema/migrations and performance remain outside the completed compatibility scope.

## Git baseline and suggested checkpoint

Observed branch: `main`. HEAD and locally cached `origin/main`: `7c2455609dc759e2f6715ddb8f9d15fc7033c0cf` (`feat(core): complete phase 1 core foundation`). Local ahead/behind: 0/0. Remote fetch/push URL: `https://github.com/Chemic666/ai-project-visualizer.git`. No fetch or live GitHub-head verification occurred; cached tracking state does not prove the server is unchanged.

No staged changes. This review never runs git add, commit or push. Raw receipts become ignored while staying in place; the exact allowlist above is the proposed future scope.

Suggested commit message:

```text
test(spike): close phase 2.2 sqlite compatibility verification
```

The checkpoint records completed limited compatibility and a Proposed preference; it is not a production Storage implementation or Driver acceptance commit.

## This checkpoint's checks

No W1/W2/W3 Host or Driver acceptance was rerun. Fresh checks:

- `node --test --test-reporter=tap experiments/phase-2-sqlite-driver-spike/acceptance-regression.test.cjs`: exit 0; 64 cases, **63 PASS / 0 FAIL / 1 SKIP**. The skipped temporary PowerShell `-File` configuration test was blocked by environment authorization; no bypass. Windows process-query regression concerns the test/helper process, not the historical W3 Host.
- `node --check`: all 10 disposable JavaScript files passed. PowerShell AST parsing: all 3 scripts passed without execution.
- Public JSON/version/verdict/reference/hash inventories, exact 27-file manifest, Markdown local links, ignore rules, privacy patterns and whitespace checks passed. Git candidate set equals the allowlist: 27 files, no unexpected files. All 22 original receipt hashes and 36 audit-input references match; original VSIX and its archived native binary hashes match. Core/runtime code and original evidence remain unchanged; only the two expected ignore policies changed among the protected non-document references. No audit command or new original receipt was executed/written.
- `git diff --check` passed (only existing Git LF/CRLF notices); untracked allowlist files passed a separate whitespace scan because Git diff alone does not cover them. Passing checks do not change the existing W3 limitations or D-041 status.
