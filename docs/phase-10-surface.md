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
