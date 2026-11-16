# Phase 10 — VS Code surface first slice

## Scope and implementation plan

**Goal:** Deliver a locally installable VS Code surface with an honest disconnected overview and an explicit synthetic walkthrough of the existing Core.

**Architecture:** `packages/vscode-surface` owns only command activation, one Webview panel, own packaged assets and a closed navigation/health bridge. Reuse the current browser walkthrough without changing Core calculations. The default overview shows unavailable project/session/plan/progress. A separate explicit action opens the clearly labelled fixed synthetic case. No Agent or SQLite composition is added.

**Spec:** ROADMAP Phase10, docs/UX.md, D-036/D-038, existing experiments/core-preview.

**Reason for order:** Real Adapter intake remains gated by D-038. Independent surface implementation can use the already validated VS Code1.144.0 runtime/packaging path and current synthetic Core output without representing Phase7/11 acceptance as passed. This first slice does not close Phase10 or make synthetic data a real Project.

**Constraints:** No private Session or real workspace reads; no Hook/trust settings; no network/server/model/Storage startup; no new dependency/download; no global installation/publish/commit/push. Own-media localResourceRoots, nonce CSP, command URIs disabled. Existing approved preview colors/layout stay unchanged. Install/smoke only in a fresh TEMP profile and extensions directory with the existing local VS Code. Keep original stdout/stderr/exit, archive/runtime source digests. Current source checkout is reused to preserve the existing continuous work.

**Review focus:** delayed messages after panel navigation; malicious/extra bridge fields; repeated open/dispose; missing assets; disconnected UI showing a false zero/completion. Readiness proves asset/client startup only, not human UX acceptance or real observation.

- [x] Task1: RED renderer/controller/bridge-contract tests; implement own-media rendering, strict CSP, single-panel lifecycle, generation-bound allowlisted messages. Verify GREEN.
- [x] Task2: Add the real extension commands, disconnected overview, packaged navigation bridge and build output, reusing the exact existing Core preview assets. Build from current source with no new dependency; inspect manifest and own-file inventory.
- [x] Task3: Package a VSIX with the installed toolchain, install only into fresh synthetic profile, and execute commands against the actually installed extension. Verify default disconnected state, explicit synthetic client startup, return navigation, repeated command reuse and panel close. Preserve failures and raw process exit before the final inventory.
- [x] Task4: Relevant Core/preview regressions, static checks, current archive/installed/runtime audit and one independent final review. Report exact completed scope and missing real Adapter/full persistence/production gates.

Pre-flight: Renderer output and controller nonce/generation fields must match bridge parsing. Controller inspect API returns only mode/health for integration checks, never state/paths/IDs. Build asset names must match renderer allowlist and VSIX inventory. No conflict with existing Core or Storage ownership: neither is changed or started by the extension.

Ruling: Keep this plan and execution outcomes in the existing phase-doc convention, use inline execution and one final reviewer, and do not run commit/worktree/cleanup steps that conflict with current user authorization.


## Execution record

Renderer/controller actual RED: 12 failures because implementation was absent, then 12/12 GREEN. Output build actual RED: two failures before build existed, then complete surface14/14 GREEN. Current standalone build produces exactly nine own files plus a separate local build receipt. The new workspace adds no dependency version; pnpm's first workspace synchronization did verify its existing lock and rerun the already allowed esbuild postinstall. This was not a zero-install-action operation. Lock diff only adds the empty surface importer.

Actual package failures are retained: Run b26bcc15-763f-45f4-898a-bce7399f38fd failed because an installable README linked outside its package to a source-only document; the link was removed rather than bypassing validation. Run61221354-0d7c-494d-8e9b-add3222330b5 packaged successfully but failed the exact archive-name oracle: vsce4 normalizes README.md to readme.md. The explicit known mapping now applies only to that file; all other names and nonmanifest bytes remain exact.

First installed smoke cc8d1eac-1f21-4203-a6fc-4c9bd1344928 passed with limitation, with actual client-ready messages in the real Webview. Review72954388-d4b1-4094-9460-b231366dd4d4 passed smoke but visual review was marked skipped because the hidden launch window was not returned by Windows automation. Review-only visible startup made the next own window discoverable; unattended startup remains hidden. Run89fce9bc-4e5b-454d-a092-317258fdbad4 retains a FAIL because its bounded review wait expired; it is not reclassified as success. Before timeout, Windows automation actually clicked into the demo, opened Task Weight, entered5 and observed76.2% /32 of42. These are UI observations in that earlier artifact, not a completed review of it.

That real UI inspection exposed inherited VS Code body color/padding and initial page focus/scroll issues. Surface-only CSS now pins the existing light demo palette while the disconnected overview follows host theme; new-page heading focus/scroll is set explicitly. Core algorithms and the preview app are unchanged. Final Run2fcce982-6485-41b0-8433-35c8a39ca693 completed **PASS WITH LIMITATION**, with automated Windows review of the actual installed Webview: disconnected unknown values, visible overview heading, corrected demo text contrast, default64%, entry by button and return to the unknown overview. The record and original Code-process exit are preserved in its fresh `%TEMP%\apv-surface-host-<RunId>` directory. This is assistant-operated UI verification, not human five-second acceptance.

The Webview can retain a document scroll position during mode replacement; return navigation is at the top of the synthetic document and was verified after scrolling back. No saved real Project state or cross-restart preview state is claimed. Whole-product Phase10/11, true Codex capture, B1/Local/SHM, full ProjectEngineState persistence and production gates remain open. No commit/push, global install or real-project access.


## Final verified outcome — 2026-11-09

Current standard `pnpm test` now includes the new dependency-free surface suite: **Core277/277 + preview7/7 + surface14/14**, all passed after integration. Core/Storage/preview typechecks, root lint, formatting and diff whitespace checks passed. SQLite/Native/Hook experiments and unrelated accepted storage suites were not rerun for this surface-only change.

Final actual installed artifact: **2fcce982-6485-41b0-8433-35c8a39ca693**, **PASS WITH LIMITATION**. Runtime: VS Code1.144.0, Nodev24.22.1, Electron43.8.3, modules148, Windowsx64. VSIX filename `ai-project-visualizer-win32-x64.vsix`; SHA256 **06e7d9032c062d275a2ac87151328af9f388c3d587319fd47f000710ebfa46bd**. It remains in that run's private TEMP evidence directory for local review; no normal-profile installation or publishing occurred.

Parent independent-standard-library audit `%TEMP%\apv-surface-audit-e92ec85f-a8e9-4b1c-a992-0344c93eb0ed` rehashed **168/168** frozen inventory files, **44/44** current build-source inputs, **3/3** execution inputs, **9/9** staged own files and the actual **11-entry** VSIX. Eight nonmanifest files, including README with only the known filename mapping, match stage/archive/installed bytes; all **14 manifest fields** match semantically, with only installer `__metadata` added. Package, installation and original Code validation-process exits are all0. This is not a proof that all possible descendant processes on Windows have individually been observed exiting.

One final independent read-only reviewer rechecked these same bytes, command/result records, boundary/lifecycle code and documentation. No important residual was found within the declared first-slice scope. The reviewer did not rerun tests or Windows UI. The actual UI observations were performed by this assistant using Windows automation against the uniquely identified isolated window; no screenshot artifact path was returned, so no saved-screenshot file is claimed. Earlier UI trial5→76.2% occurred before the surface-only CSS/focus fix; the current unchanged app.js is byte-identical and final UI review confirms64% and both navigation directions, not a second trial5 interaction.

Remaining: full real-project Surface composition, Activity/association UI, real Codex observation, full ProjectEngineState persistence, production storage/privacy gates, broader runtime support and human five-second usability acceptance. Current scroll restoration behavior remains the bounded note above. No commit, push, tag, Release, global extension installation, Hook configuration or permission marker changes.

## Recovered synthetic history in the VS Code development surface — 2026-11-15

The explicit `--recovered-demo-driver` build uses the reviewed synthetic recovery flow and packages the verified display data as `media/recovered.js`. The optional command and overview entry open that asset in the existing panel. The page identifies the history as synthetic data restored during the build. The shared bridge keeps its existing mode and generation checks. Missing recovery HTML, client, bridge or styles preserve the prior panel and report a fixed error. The standard build retains the original two commands and nine assets.

The isolated VS Code development run `edb52016-1f79-4d3c-bfbe-e368427e6daf` opened the actual ten-file artifact in VS Code 1.144.0 with Node v24.22.1 and Electron 43.8.3 on Windows x64. The run checked all ten hashes and exited normally. The real Webview verified opening from the overview, **3 / 6 = 50%**, the previous **60% → 50%** and User Confirmed weight evidence, the Agent Reported verification claim, current-task expiry, and return to the disconnected overview. The optional command reopened the recovered page. The original walkthrough still displayed 64% and eight checkpoints. The isolated development profile used the built extension through `--extensionDevelopmentPath`.

The standard suite passed **303/303** with the reviewed Driver supplied, including **19/19** extension tests. Typecheck, lint and formatting passed. The missing shared bridge test reproduced a navigation failure before the fix and then passed alongside the other missing-asset cases.

The final README was included in a fresh optional build `feda8ae5-f9d7-49f7-a4aa-1903437f6d88`. The nine runtime and manifest files matched the tested development artifact. The local Windows x64 VSIX archive contained the exact twelve expected entries, and the ten packaged file hashes matched the build. Its SHA256 was `e9d201f629b28e84015f948320f32517639d4e128734e755d5b129bc1ec79680`.

This change covers the VS Code presentation of a verified synthetic recovery. Runtime database recovery in the extension, real Codex intake, production storage and full privacy acceptance remain pending.

## Recovered history after an installed VS Code host restart — 2026-11-16

The disposable Windows x64 validation extension now opens a read-only view of the synthetic v5 checkpoint after the second Extension Host and Worker reopen the database. The host compares the recovered cut and original receipt before handing the Core display projection to the Webview. The browser ties the projection to the current recovered document and renders the normal preview client. A separate SQLite reader still checks all twelve tables after the hosts and Workers exit.

Run with the reviewed local VS Code, Driver and Native manifest from the v5 restart validation.

```cmd
node packages\storage-host-validation\run.mjs --execute-temp-timeline-surface-restart --code-root "%APV_CODE_ROOT%" --driver-root "%APV_DRIVER_ROOT%" --native-manifest "%APV_NATIVE_MANIFEST%"
```

The unattended run verifies both pages are ready and exits. Add `--review` to inspect the recovered Webview before selecting **回到项目概览**. This option exposes a fresh loopback debugging port during the recovery host for up to 90 seconds after the page is ready. Each run uses a fresh TEMP profile, extension install and database.

- **Unattended run `4177f003-6c73-40c0-864b-2afe1b3986e6`** passed with limitation. The installed extension reported readiness on the recovered page and the disconnected overview. The head stayed at 8, the Writer epoch advanced from 1 to 2, and the original receipt matched.
- **Automated Webview review `eacacb9c-cb11-4f51-a5e1-0f0bcc8a1e54`** passed with limitation. The browser expanded the **3 / 6 = 50%** calculation, checked all 16 Timeline rows were rendered, opened the historical **60% → 50%** transition and its **User Confirmed** weight evidence, and verified the original **Agent Reported** claim and expired current-task correction. The return button took the same panel to the disconnected overview. The package's 60 listed runtime files matched the staged, archived and installed resources.
- The earlier automated review `9c82cd47-f7b5-42f8-8ddf-6109403a7f5b` reached the recovered page but timed out before returning after its check used the wrong selector for the provenance label. Its failure record is retained.

The standard suite passed **305/305**, the opt-in recovered preview passed **3/3**, and the storage boundary and validation suites passed **42/42**. Typecheck, lint and formatting checks passed. This run covers normal restart of the isolated Windows validation host. Regular extension startup with real project state, live Codex intake, production storage and privacy acceptance, and human usability acceptance remain open.

## Task details and weight editing in the standard extension — 2026-11-16

Task titles in the overview and plan open a detail dialog with the status claim and its source, completion evidence, plan revision, current weight and the task’s correction history. The sixth built-in checkpoint accepts weight changes for any formal task through Core. Repeated edits retain their previous weights and effective or superseded states. Each change updates the project percentage and Timeline. The eight original checkpoints remain available, and **查看本次调整** returns to the current edited view. The recovered view and historical checkpoints offer read-only details.

The standard Windows x64 VSIX passed installed validation in Run `9e9dd244-0210-4ff5-8bce-953e454f0cdc` on VS Code 1.144.0. Automated interaction with that package’s Webview confirmed that changing Refresh Token from 3 to 4 and then 6 moved the project from **64% → 62.7% → 60.4%**. The review verified both Timeline changes, historical JWT **13 → 17**, the original Session end, unchanged completion provenance, invalid and duplicate input handling, focus return, reset, and navigation to the disconnected overview.

The standard test suite passed **307/307**, and the opt-in recovery preview passed **3/3**. Typecheck, lint and formatting passed. Edits belong to the current synthetic preview. Real-session correction, persistent user edits and human usability acceptance remain pending.

## Current task correction in the standard extension — 2026-11-16

The editable checkpoint now offers **纠正当前任务** in the overview. Its picker lists formal plan tasks and focuses the active selection. A confirmed choice uses Core’s existing current-task correction, updates the overview with **User Confirmed**, and records the old and new choices and their evidence in Timeline. Current-task selection and weight edits share the history of the current preview. The original checkpoints and restored history remain readable.

The standard Windows x64 VSIX passed installed validation in Run `40e3d5c3-f758-49c0-8467-1d77b4dff2c9` on VS Code 1.144.0. In the installed Webview, the picker changed **JWT → Refresh Token**, retained the prior choice, and kept JWT’s **Agent Reported** status and the **64%** progress figure. A later weight edit changed progress to **62.7%** while retaining Refresh Token. The review also checked cancel, repeat confirmation, focus return, the original Session ending, read-only historical state and reset.

The standard suite passed **309/309**, and the opt-in recovery preview passed **3/3**. Typecheck, lint and formatting passed. Scenario 08 remains open for real Codex input, persistent corrections, stale state on disconnect and later authoritative source choices.

## Plan history in the standard extension — 2026-11-16

The Plan tab and Timeline now expand the same saved plan change. Each detail shows the prior and resulting task lists, the recorded additions, removals and edits, the plan source, and the progress record linked to those revision identities. The independent example shows JWT leaving and re-entering alongside the recorded Login rename. Plans unavailable at an earlier checkpoint still show an empty history there.

The standard Windows x64 VSIX passed installed validation in Run `d8460adb-fa9b-4301-b17f-3eddd8c09bff`. The Webview showed the expansion from two to four tasks and the historical **32 / 45 = 71.1% → unavailable** transition. The source left the adjustment reason unspecified, and the newly added tasks still lacked weights at that revision. The selected later checkpoint displayed **32 / 50 = 64%** after the weights had been supplied. The separate example verified the removed and re-entered task lists, the earlier Login name and the later Login API name.

The isolated runtime recovery run `6a4b1a7b-3372-4c80-9921-39986a62161e` reopened the saved v5 database and displayed the recovered plan. Its progress caption describes the result of the commit containing the plan revision, which can also contain other updates. The standard suite passed **311/311**, the recovered preview **3/3**, and typecheck, lint and formatting passed. The checks exercise built-in and recovered synthetic records. Real plan capture and production acceptance remain pending.
