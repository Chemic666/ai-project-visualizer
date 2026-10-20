# Installed Storage Host validation — default disabled

This is a synthetic deployment acceptance artifact, not the production APV extension or a UI milestone. It registers no commands, performs no automatic collection and cannot enable production Storage. No Codex session or real project is read. All packages, VS Code profiles, databases and receipts are exclusive disposable TEMP directories; failures are preserved without automatic retries.

The existing local vsce 4.0.0 installation is used only as a packaging tool; no archived compatibility Harness is invoked. Existing Driver 13.0.3 and reviewed Native DLL bytes are copied, never rebuilt. The VSIX is installed into an isolated extensions directory, not the user's installation. A fresh official Extension Test Host activates that installed package and records actual environment, resource/Native identity, two Worker lifecycles and a fresh-process nine-table Oracle. Negative install copies test missing/damaged/read-denied resources before loading.

From the repository root in Windows CMD, set APV_CODE_ROOT to the actual VS Code installation, APV_DRIVER_ROOT to the approved installed package, and APV_NATIVE_MANIFEST to the reviewed build.json. No parameters means disabled:

```cmd
node packages\storage-host-validation\run.mjs
node packages\storage-host-validation\run.mjs --execute --code-root "%APV_CODE_ROOT%" --driver-root "%APV_DRIVER_ROOT%" --native-manifest "%APV_NATIVE_MANIFEST%"
```

An explicit run prints RunId/evidenceRoot/status. Every subprocess command, stdout, stderr and exit is recorded; package archive contents and installed runtime files are hashed. Never replace a failed RunId. The current approved tuple is VS Code 1.140.0, Node 24.21.0, Electron 43.7.3, modules 148, Windows x64; other machines/versions require separate evidence. A validation PASS does not pass complete O02 or enable users' projects.

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
