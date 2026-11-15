# AI Project Visualizer — VS Code surface first slice

VS Code1.144.0 / Windows x64 local development artifact. This is a user-facing surface with a disconnected overview and an explicitly selected synthetic walkthrough. Real Session/Plan capture and production Storage remain unavailable; this is not complete Phase10/11 acceptance.

Open the Command Palette and choose **AI Project Visualizer: 打开项目概览**. The default page shows unavailable/unknown project information. Choose **体验合成项目示例** to inspect the eight built-in checkpoints, Plan, Why, Timeline and synthetic Task Weight editing. **回到项目概览** returns to the disconnected page. Commands reuse one panel; closing the panel discards this preview. Nothing is saved as real project state.

No workspace/private Session reads, source watching, Hook/permission changes, server/model/SQLite startup or telemetry are implemented. The Webview reads only packaged media under a nonce CSP with network and command URIs disabled. Bridge messages permit own-page navigation and fixed health metadata only. An exported inspectSurface API reports just mode/health for installed-artifact smoke checks; it does not expose or accept Project state.

Build with the existing repository toolchain (Windows CMD):

```cmd
pnpm.cmd test:surface
pnpm.cmd build:surface
node packages\vscode-surface\validate.mjs
```

Build prints a fresh TEMP package directory; it refuses to overwrite existing output. Validation is default disabled. The explicit `--execute --code-root ABS` mode uses the existing local VS Code and installed packaging dependency, a fresh TEMP profile/extensions directory and no downloads. It never installs into your normal profile or publishes an extension. Its returned VSIX can be reviewed locally.

## Optional recovered sample

Build this optional Windows x64 development variant from the repository root with the reviewed better-sqlite3 13.0.3 Driver already installed.

```cmd
set "APV_DRIVER_ROOT=%CD%\experiments\phase-2-sqlite-driver-spike\node_modules\better-sqlite3"
pnpm.cmd build:surface --recovered-demo-driver "%APV_DRIVER_ROOT%"
```

The build restores a fixed synthetic database after the writer exits and packages the verified display data as its own asset. The extension opens it from **查看已恢复的合成历史** in the overview or Command Palette. The view labels the data as a sample restored during the build. It shows the recovered progress and the earlier changes with their evidence. **回到项目概览** returns to the disconnected page.

To review the variant in a development window, set `APV_STAGE` to the absolute `outDir` printed by the build and `APV_CODE_EXE` to the existing VS Code executable. Launch it in a fresh temporary profile.

```cmd
set "APV_TEMP_ROOT=%TEMP%\apv-surface-review-%RANDOM%-%RANDOM%"
"%APV_CODE_EXE%" --new-window --user-data-dir "%APV_TEMP_ROOT%\profile" --extensions-dir "%APV_TEMP_ROOT%\extensions" --extensionDevelopmentPath "%APV_STAGE%"
```

Implementation scope, current results and remaining gates are recorded in `docs/phase-10-surface.md` in the source checkout.
