# Installed Storage Host validation — default disabled

This is a synthetic deployment acceptance artifact, not the production APV extension or a UI milestone. It registers no commands, performs no automatic collection and cannot enable production Storage. No Codex session or real project is read. Packages, VS Code profiles and receipts use exclusive disposable TEMP directories; explicitly selected LocalAppData modes instead require the formal validation UUID root. Failures are preserved without automatic retries or fallback.

The existing local vsce 4.0.0 installation is used only as a packaging tool; no archived compatibility Harness is invoked. Staging copies existing Driver 13.0.3 and the separately reviewed Native DLL bytes; it does not rebuild them. The VSIX is installed into an isolated extensions directory, not the user's installation. A fresh official Extension Test Host activates that installed package and records actual environment, resource/Native identity, two Worker lifecycles and a fresh-process nine-table Oracle. Negative install copies test missing/damaged/read-denied resources before loading.

From the repository root in Windows CMD, set APV_CODE_ROOT to the actual VS Code installation, APV_DRIVER_ROOT to the approved installed package, and APV_NATIVE_MANIFEST to the reviewed build.json. No parameters means disabled:

```cmd
node packages\storage-host-validation\run.mjs
node packages\storage-host-validation\run.mjs --execute --code-root "%APV_CODE_ROOT%" --driver-root "%APV_DRIVER_ROOT%" --native-manifest "%APV_NATIVE_MANIFEST%"
```

An explicit run prints RunId/evidenceRoot/status. Every subprocess command, stdout, stderr and exit is recorded; package archive contents and installed runtime files are hashed. Never replace a failed RunId. The legacy modes target VS Code 1.140.0, Node 24.21.0, Electron 43.7.3, modules 148, Windows x64. The separate restart modes below target only the newly verified 1.144.0 tuple; historical evidence is not upgraded to the new artifact/version. A validation PASS does not pass complete O02 or enable users' projects.

Private-directory checks are separate: the user accepted the independent ordinary CMD suite as **8/8 PASS, exit 0** on 2026-10-20. Do not repeat it unless its implementation changes. This does not pass the installation-level Extension Host gate: actual Host RunId **7b412542-9202-4c93-9a31-bdff15f25149** returned unavailable at UUID-root admission, before any SQLite open. At that earlier RunId the validation extension and Storage capability used TEMP only. The explicit `--execute-local-validation` mode below now connects only formally admitted UUID roots; the existing `--execute` command above remains a TEMP test. The resolver never creates the production storage-v1 namespace. The already accepted ordinary CMD suite is shown for reference only:

```cmd
node --test packages\storage\tests\local-storage-root.test.mjs
```

That command creates only new UUID synthetic validation roots, deliberately tests their ACL/link rejection and preserves them. It does not open a business database or change existing user-folder ACLs. Failures must remain visible; do not bypass final-path mismatch or grant broader permissions. See the [gate record](../../docs/storage/phase-2-first-slice.md#b1-final-integration-gate--2026-10-19) for actual results and unresolved B1–B7 boundaries.

## Explicit installation-level synthetic mode

Run only from an approved ordinary Windows/VS Code environment, after the separate root subgate passes. This is default disabled, creates a new official LocalAppData/APV/validation/UUID root, and never enables production or reads a real project. Do not substitute an arbitrary path or rerun a failed RunId. Keep stdout/stderr and paths private.

```cmd
node packages\storage-host-validation\run.mjs --execute-local-validation --code-root "%APV_CODE_ROOT%" --driver-root "%APV_DRIVER_ROOT%" --native-manifest "%APV_NATIVE_MANIFEST%"
```

The same pinned installed resources and Native main/WAL checks are used. Root marker/nonce/ProjectId/StoreKey/generation are rechecked across Worker startup and live guards. SHM behavior uses the same admitted database; its internal HANDLE remains unverified. A fresh SQL Reader follows actual Writer exits. Deliberate marker revocation happens only after successful SQL verification and retains the synthetic failed-control evidence; it never repairs ACLs or alters business rows. On root rejection only fixed diagnostic labels are returned; no TEMP fallback occurs.

Actual RunId **c81f88de-575e-42a4-aa0c-a6065c1a466b**: **PASS WITH LIMITATION**, 48 installed runtime hashes and 258 inventory entries matched, two normal Writers closed/recovered, one rival was refused, nine-table Oracle passed. This does not close B1, O01/O02 or complete production S/P/M. See the [bounded convergence record](../../docs/storage/phase-2-first-slice.md#installation-rootcapability-convergence--2026-10-20). Do not rerun the accepted eight-case CMD suite without a relevant change.

## Explicit whole-Extension-Host normal restart (2026-11-09)

The two new modes require the existing VS Code **1.144.0**, actual Host **Node v24.22.1 / Electron 43.8.3 / modules 148 / win32-x64**, Driver **13.0.3**, and independently reviewed Native BuildId **bbb9ff2b-580e-49a5-b4bf-c9f3f6a2d3ac**, DLL SHA256 **c966a773446bb58b370c4a96269c0d5523b3db7dfa1183b541a73ae25fb4f681**. Set the three variables above to those exact local resources. Missing/other resources reject; each new Native build needs separate review. With no arguments, validation remains disabled.

```cmd
node packages\storage-host-validation\run.mjs --execute-local-restart --code-root "%APV_CODE_ROOT%" --driver-root "%APV_DRIVER_ROOT%" --native-manifest "%APV_NATIVE_MANIFEST%"
node packages\storage-host-validation\run.mjs --execute-temp-restart --code-root "%APV_CODE_ROOT%" --driver-root "%APV_DRIVER_ROOT%" --native-manifest "%APV_NATIVE_MANIFEST%"
```

These are alternative explicit experiments, not instructions to retry the failed local run. Local mode must pass the original KnownFolder/final-path/NTFS/private-ACL/marker gate; it never falls back to TEMP. TEMP mode separately requires a fresh synthetic TEMP root and its own installed-only runtime profile. Neither admits arbitrary user roots or enables production. Both use an empty test window and isolated profile/extensions; telemetry/update settings affect only that profile, and Workspace Trust is not disabled. Archive inspection uses the already installed vsce/yauzl dependency without extracting files or relaxing script policy.

The first Host admits one fresh root, commits E1/head2, closes its Worker and exits completely. A second separately launched Host readmits the same root/nonce/actual Catalog StoreKey, restores exact Core state/Cursor at epoch2 and returns the original receipt for a matching retry without another business commit. After the second Worker/Host exits, the original independent Reader compares all nine tables. Exit observations bind original environment/ready records and creation time so a reused numeric PID is not mistaken for the original process. No process kill, OS/disk fault or genuine unknown-COMMIT recovery is tested.

Actual results: Local RunId **eb4b8b81-604b-4b93-8f8e-179751a7c6e4** was **FAIL**, final_path_mismatch before database/Worker; evidence retained. Explicit final TEMP RunId **474143d4-3ac5-4073-abae-288b4bbbc7e1** was **PASS WITH LIMITATION**: two actual Host and Worker normal exits, exact state/Cursor/head2/epoch1→2/original receipt, nine-table Reader exit0. Independent audit matched **309/309** inventory, **16/16** execution inputs and **52/52** installed runtime files. Cut SHA256 **62f09a57c25aa5ccd0ab584fa49597de2a7de1d6e2be65f5ad55a3097fc3940a**. This does not recover the newer complete ProjectEngineState or pass LocalAppData/B1/full O01/O02/S/P/M.

Focused runtime/handoff/archive/entry/exit-proof tests passed **29/29**; default source Host regression separately passed **7/7**. No archived Spike, accepted eight-case CMD suite, real project/Session, Hook configuration or production entry was touched. See the [full bounded outcome and remaining gates](../../docs/storage/phase-2-first-slice.md#whole-extension-host-normal-restart-follow-up--2026-11-09). Failed runs and the earlier TEMP result are preserved separately; do not automatically rerun accepted evidence.

The focused checks have a separate, safe development entry point:

```cmd
pnpm.cmd test:storage:validation
```

It runs 35 Node tests for exact runtime admission, handoff, archive inventory, early entry refusal, recorded-process exit proof and fixed-label root diagnostic privacy projection. It does not install/launch VS Code, load a Native DLL, open SQLite or run an archived experiment. The live-process refusal test creates its own disposable TEMP record and reads only its own process start time; it never terminates a process. No full integration test is added to the default Core test command.

Local admission failures can additionally retain bounded observations from that exact helper process: package identity present/absent/unknown (name never fetched), case-only/different final-path relation, and presence/absence of Packages plus LocalCache path segments. These fixed labels are filtered before saving. They do not grant admission, prove virtualization cause or authorize a redirected root; the original strict path refusal still applies. Runtime capture and any new RunId are tracked separately in the [same-helper diagnosis](../../docs/storage/phase-2-first-slice.md#same-helper-namespace-rejection-diagnostics--2026-11-09).

The one same-helper diagnostic attempt, RunId **a8dd7abe-c10e-49e2-b222-1a222d55bfdf**, remained **FAIL** at final_path_mismatch: no package identity, a different final path and cache segments present. Independent audit matched **244/244** inventory, **16/16** frozen validation inputs and **53/53** staged/installed/archive runtime files. No Worker/recovery/Reader ran. This refines the failure evidence only; it does not identify the redirection cause or upgrade Local/B1/production. The earlier TEMP success remains separate and unchanged.

The staged runtime now enforces D-044's existing **8 MiB logical Catalog** ceiling for all retained binding rows, including schema-2 Native bindings. Checks run inside the existing transactions; they do not cap physical SQLite pages or authorize new namespaces. Source/Native quota cases are separately explicit in the Storage test runner; the installed normal-restart evidence remains its own run. A failed activation can retain a creating binding/empty-input bootstrap and stays unavailable, never an automatically repaired active project. See [budget implementation and evidence](../../docs/storage/phase-2-first-slice.md#d-044-logical-catalog-budget--2026-11-09).

Catalog-checkpoint installed TEMP Run **8a11f22a-ecac-45b7-bb31-2f4320681b8b** passed with limitation: independent 312/312 inventory, 16 execution inputs and 54 runtime files; both Host/Worker pairs exited normally, exact head2/epoch2/original receipt and nine-table Reader matched. Earlier normal-restart results remain historical; Local still fails and production remains unavailable.

The next staged runtime also separates optional Snapshot cache faults from fully verified authority: cache headers are bounded before body inspection, open/read/matching retry rebuild from authoritative records without rewriting damaged caches, and only a genuinely new successful transaction replaces known-bad caches. Per-authority-table FK/integrity/history/receipt/Cursor checks remain decisive. The separate source/Native cache tests cover controlled closed-fixture content faults; installed normal restart is not an installed corruption, physical disk-fault or unknown-COMMIT test. See [bounded S11 work](../../docs/storage/phase-2-first-slice.md#s11-authority-fallback-for-optional-cache-corruption--2026-11-09).

Final S11-runtime healthy TEMP restart **1de9e45b-2c5d-468b-8172-52e22a41f4fa** passed with limitation: independent 307/307 inventory, 16 frozen validation inputs, 54 runtime files and 60 VSIX file entries matched; both Host/Worker pairs exited, and the nine-table Reader retained exact state/Cursor/head2/epoch2/original receipt. The separate ordinary and Native corruption suites each passed 11/11. The installed run exercises healthy restart only; Local and production remain blocked.
