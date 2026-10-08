# Disposable Phase 2 SQLite driver spike

This directory is throwaway compatibility/packaging material, not `packages/storage` or the Phase 10 extension. It imports no APV Core code. The `probe_*` and `spike_restart_marker` tables contain synthetic data only. Neither driver is selected by this experiment.

Results are recorded in the repository file `docs/spikes/sqlite-driver-compatibility-results.md`. This disposable extension README deliberately contains no cross-directory report link: the report is outside the VSIX. Current better-sqlite3 candidate is exactly **13.0.3**, pinned from official release metadata. The original Codex run did not install/resolve it or generate a dependency lockfile; later W1 Windows acceptance is a separate record.

`_runtime/` contains ignored disposable databases and isolated VS Code profiles. `artifacts/` contains ignored staged packages/VSIX. `evidence/` is now local-only: original receipts include machine paths, process inventories and runtime state and must not be committed. The separately reviewed [public summary](https://github.com/Chemic666/ai-project-visualizer/blob/main/experiments/phase-2-sqlite-driver-spike/public-evidence/compatibility-summary.json) exposes allowlisted results, limitations and immutable original hashes; it is a derivative, not an original Host receipt. No automatic cleanup deletes user data.

Current closure review: W1/W2/W3 compatibility verification is complete with **PASS WITH LIMITATION**, Audit ID `82eeaa9a-112e-4b2e-aa29-4cb68be3f2dc`. The user endorsed better-sqlite3 13.0.3 as the sole preferred proposal; D-041 remains Proposed and production selection is not Accepted. Atomic recovery and Privacy/Retention gates are unchanged. See repository documents `docs/spikes/phase-2.2-closure.md` and `docs/spikes/phase-2.2-checkpoint.md` for scope and custody requirements. Do not rerun completed acceptance for this checkpoint.

Commands below are historical reproduction material. Legacy `run-node.cjs`, `run-host.ps1` and `host-runner.cjs` write fixed receipt names and can overwrite evidence. The legacy launcher uses PID-only timeout termination without rechecking creation identity, so it is not an approved safe cleanup procedure; retain it for inspection rather than execution until ownership guards are separately reviewed. Never execute these legacy writers in the preserved checkout. Future authorized reproduction needs a separate clean checkout and a reviewed procedure. W3 uses fresh IDs and the current manual guide. Recorded project/Code installation paths are non-personal test-environment prerequisites, not portable discovery: check them before an authorized run. Current runtime code and original VSIX are unchanged; rebuilding with the updated README creates a new artifact requiring its own hash audit. The public-summary URL uses an absolute repository link so this README has no missing cross-directory VSIX resource link.

## Historical commands for normal Windows host acceptance

Run in PowerShell, using project-local dependencies. Never change pnpm store/cache/state to work around a sandbox failure. If pnpm fails, stop dependency-dependent steps and preserve the failure evidence. `--ignore-workspace` isolates this non-workspace experiment; it is not a permission workaround and does not change repository policy.

```powershell
$spikeRoot = 'D:\Projects\ai-project-visualizer\experiments\phase-2-sqlite-driver-spike'
Set-Location -LiteralPath $spikeRoot
pnpm install --ignore-workspace
# Keep the generated experiment lockfile and detailed installation output for review.
# Inspect whether native compilation occurred; do not infer this from install success.
node run-node.cjs
```

For B, `observedDriverVersion` must equal 13.0.3. Inspect `nativeLoads` for the actual `.node` filename/hash; a successful JS import alone does not prove that the native binding loads. Retain install evidence to distinguish packaged prebuild use from local compilation. Native load tracing is restored after each probe.

### Actual development Extension Host

```powershell
& ./run-host.ps1 -Scope development -Mode probe
```

This uses the installed VS Code's official `--extensionDevelopmentPath` / `--extensionTestsPath` mechanism, with a disposable `run()` runner and isolated user-data/extensions directories. No VS Code download or test framework is required. It records actual `vscode.version`, Node/Electron/module ABI/N-API, OS/arch and individual candidate results. An empty/missing host JSON or process exit code does not establish compatibility. If another VS Code instance prevents testing, use the documented in-editor Extension Tests launch flow in a normal host; do not terminate unrelated instances.

Each launcher invocation uses a fresh run ID. Only a matching receipt counts as current-run evidence; an older JSON file must not make a failed launch appear successful. The launch summary still requires inspection of individual candidate results.

### VSIX stage, package and inspect

Only after successful candidate installation, add a **local** packaging tool and record its exact resolved version. This tool is not installed by the Codex run:

```powershell
pnpm add --save-dev --save-exact @vscode/vsce --ignore-workspace
pnpm exec vsce --version
node stage-vsix.cjs
Set-Location -LiteralPath "$spikeRoot\artifacts\extension"
& "$spikeRoot\node_modules\.bin\vsce.cmd" ls
& "$spikeRoot\node_modules\.bin\vsce.cmd" package --allow-missing-repository --target win32-x64 --out "$spikeRoot\artifacts\apv-sqlite-driver-spike-win32-x64.vsix"
Set-Location -LiteralPath $spikeRoot
& ./audit-vsix.ps1 -VsixPath './artifacts/apv-sqlite-driver-spike-win32-x64.vsix'
```

The staging script copies physical runtime files, avoiding pnpm symlink assumptions. It requires the exact candidate and Windows x64 prebuild and stages the driver's declared dependencies. Keep vsce's dependency collection enabled: its default file glob excludes nested node_modules, so `--no-dependencies` would omit required native resources. Packaging deliberately does not use esbuild. The archive audit **must** find `extension/node_modules/better-sqlite3/prebuilds/win32-x64.node` and match its SHA-256 against staging. If vsce omits it, packaging verification fails: inspect packaging inclusion rather than calling the candidate supported. Archive presence/hash alone does not prove loadability.

### Installed VSIX and restart persistence

```powershell
code --user-data-dir "$spikeRoot\_runtime\code-user-data" --extensions-dir "$spikeRoot\_runtime\code-extensions" --install-extension "$spikeRoot\artifacts\apv-sqlite-driver-spike-win32-x64.vsix" --force
code --extensions-dir "$spikeRoot\_runtime\code-extensions" --list-extensions --show-versions
& ./run-host.ps1 -Scope installed -Mode probe
& ./run-host.ps1 -Scope installed -Mode write
# Confirm the writer's isolated Code process has exited before starting the reader.
& ./run-host.ps1 -Scope installed -Mode read
```

Installed mode develops only an empty harness with a **different extension ID**. The database probe must be activated from the installed VSIX, verified by `loadedFromInstalledDirectory = true`; it is not replaced by the development copy. Compare per-candidate write/read records: the reader must return the previous write's `writerPid`, and its own PID must differ. Both candidates are tested independently. A failed writer or missing candidate is not a passed restart test. Use the same isolated profile for both invocations.

The original commands above are retained as the initial experiment procedure. W2 and W3 now have valid internal Host receipts; formal W3-G audit is PASS WITH LIMITATION. The current procedure is `experiments/phase-2-sqlite-driver-spike/WINDOWS_ACCEPTANCE.md`, stages W3-A through W3-G. It uses `w3-session.ps1` and `w3-evidence.cjs` with fresh GUID evidence, Host/CIM identity capture and sampled process history. It never produces automatic whole-instance exit PASS. Explicit human confirmation can yield only PASS WITH LIMITATION, and cannot override missing information, ambiguous ownership or live related processes. That limitation propagates to restart acceptance. Do not use either the older fixed-marker sequence above or the superseded one-snapshot exit command to claim this gate.

Disposable regression command: `node --test experiments/phase-2-sqlite-driver-spike/acceptance-regression.test.cjs` from the repository root. These are verdict/fixture tests, not Windows Host verification. The external test runner/helpers are not part of the original VSIX; no repackaging was performed.

Linux/macOS/ARM64, remote/web hosts, multi-process crash recovery, production schema, migrations and APV snapshot/recovery are outside this experiment.
