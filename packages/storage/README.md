# First Storage vertical slice — development only

Policy approval: 2026-10-19. D-041/D-043 Accepted, D-042 Accepted — conditional architecture, D-044 Accepted — initial implementation policy. Accepted is not production validation. [Production acceptance](../../docs/acceptance/phase-2-storage.md) and O01/O02 remain NOT TESTED as complete gates.

## Admission and API

`openProductionStore()` always returns `{status:"unavailable", reason:"physical_binding_unverified"}`. There is no user-project enablement switch, background capture, Agent connection, UI or automatic ACK. Actual Driver-handle/namespace binding and Host lifecycle are not proven: B1 remains open. `stat`/realpath/NTFS checks do not attest the Driver's open handle or remove TOCTOU.

The separate development composition uses `admitSyntheticRoot({enabled:true, root})` on an exclusively created, empty `apv-storage-slice-*` child of actual Windows TEMP. It creates synthetic `observed/` and sibling `private/` directories; never accepts a supplied real project directory. Reopen requires the existing private nonce. `inspectCapability` rechecks directory identities. Capabilities cannot be created by passing a plain object. The default entry does not export the issuer.

`openSyntheticStore(capability, {Database, applyNormalizedEvent, processorFingerprint, projectId, generation, bootstrap?})` is the actual SQLite adapter. The development composition injects installed better-sqlite3 **13.0.3** and the existing real Core function (bundled in a fresh TEMP module); no copied/replacement Core or custom VFS is used. No historical Harness is invoked. The package declares the exact Driver peer; it neither installs a second binary nor imports an experiment at runtime. Formal Host dependency packaging remains a later gated task.

- `writer()` returns the generation/epoch/token used by `commit({operationId,operationNonce,expectedHead,writer,events,cursor?,createSnapshot?})`.
- `read()` returns the fully validated CoreState, contiguous ledger head and checkpoint vector. Recovery reads authoritative versions and the full accepted-event journal; Snapshot is a checked cache, not unique truth. No bad/missing authority becomes an empty Project.
- `close()` closes Project before rolling back/closing Owner; errors quarantine handles and return only safe categories. Connection closure is not durable-outcome proof; integration evidence additionally observes actual process exit before its Reader.
- `evidence()` is an in-memory, fixed-field operation trail. No raw input/error/SQL/stack is persisted. `paths()` is a development inspection interface, not a production diagnostic projection.

## Persistence and scope

A single private catalog transaction converges the synthetic root/Project to a random StoreKey and `creating`/`active` generation. A failed creating entry is unavailable, not automatically repaired. Existing active stores require their registered physical identities. Stable Owner DB/DELETE has a lifetime IMMEDIATE transaction; Project WAL/FULL has short checked write transactions. Headers are APC1/APO1/APV1 application markers with schema 1; processor fingerprint binds the actual compiled Core bytes, not package version 0.0.0.

Nine Project tables follow the design: store_meta, commits, normalized_events, entity_versions, assertions, correction_versions, conclusion_versions, snapshots, source_checkpoint_versions. Dedup lives on the immutable normalized-event identity/claim ledger. Entity/correction/conclusion versions retain trusted existing history; no new Engine behavior exists. Full-version entity images favor straightforward recovery over initial performance.

Bootstrap has ledgerSequence 1. Each business/checkpoint commit increments the same counter; fencing increments epoch without pretending to be a business event. Snapshot watermark and its vector name the exact cached cut. A Cursor is a consumption position with exact expected previous position and complete canonical-event coverage. A single Cursor may cover several events. Stable source claims ignore alias internal ID/receivedAt for comparison; internal-ID reuse must match the original complete event. Missing/cursor-only identity stays valid and new internal IDs may be accepted again. No cross-crash exactly-once guarantee is added.

Events and all existing Core record unions are recursively closed-schema/graph checked before writing. Short text/IDs obey accepted byte bounds. The initial development source codec is deliberately `synthetic.v1` and ASCII non-secret locators/IDs; this is not generic production-source admission or universal secret detection. Arrays have a defensive 65,536-item implementation bound and depth 64; production workload capacity remains unvalidated. Real titles/paths are still sensitive. Restore validates all receipts, complete history, graph, cache cuts and cursor coverage; inconsistent authority revokes the instance.

Owner/epoch/token/generation guard precedes receipt lookup and base checking inside BEGIN IMMEDIATE. A matching operation/nonce/intent returns its original receipt and current complete head without a second effect. A mismatch rolls back. A COMMIT error retires the instance and returns unavailable, never guessed not_committed or blindly retried. Automatic unknown-outcome reconciliation, true I/O uncertainty and real release failures are not validated by this slice. B2–B7 remain bounded/unverified as documented in the Support Contract; visible binding failures permanently retire this instance, not temporarily pause its token.

Initial limits are 128 MiB logical records, <=2 snapshots each <=8 MiB and a 512 MiB physical high-water. Logical accounting uses canonical serialized retained SQL rows; a conservative whole-bundle precheck may reject early, with an exact in-transaction backstop. These are not measured throughput or hard disk caps. Lower test-only limits cannot raise policy values. Catalog 8 MiB quota, backup TTL, deletion/resume, migration, general source codecs and actual Host integration are not implemented/enabled in this slice. Unknown schemas/creating or missing active stores are unavailable.

## Explicit synthetic verification

Run from repository root in Windows CMD. No arguments means disabled; an approved installed Driver root must be supplied. Set `APV_DRIVER_ROOT` to the local installed better-sqlite3 13.0.3 package directory, not an evidence database. The current checkout can reuse its existing local compatibility dependency installation without running that Spike.

```cmd
node --test packages\storage\tests\codec.test.mjs packages\storage\tests\host.test.mjs
node packages\storage\tests\run.mjs
node packages\storage\tests\run.mjs --execute-synthetic --driver-root "%APV_DRIVER_ROOT%"
node node_modules\typescript\bin\tsc --project packages\storage\tsconfig.json --noEmit
```

The explicit run uses new TEMP identities, preserves failed runs, never retries or cleans evidence, and emits RunId/evidenceRoot/exit. Core bundling is a development artifact, not a Core source edit. Independent `sql-reader.mjs` imports neither the adapter nor its decoder/Oracle; it reads all nine tables in one fresh-process read transaction, independently reconstructs exact fixture state, checks Receipt/Nonce/Epoch/Intent/digests and every Snapshot/vector. Both S01 full committed cut and S02 pre-COMMIT application-failure old cut are checked after actual Writer exit. This is not crash, disk-failure or real unknown-COMMIT validation.

Current targeted subcoverage: S01, S02 application failure, S05 matching-intent retry only, S06/S07 claims, S08 missing identity/shared Cursor, S09 coverage, S12 missing authority; O01 cooperative acquisition/release and separate-process exclusion; O02 disabled production tuple; P01 known synthetic sentinel/closed fields, P02 identity scope, P03 actual TEMP/NTFS/admission rejection, P05 small quota rejection; M01 selected unavailable conditions only. Full S/P/M and O01/O02 remain NOT TESTED; the suite is not a parallel acceptance taxonomy. No closed-Spike result is upgraded or rerun.

Actual first-slice results, independent SQL cuts and B1–B7 dispositions: [implementation evidence](../../docs/storage/phase-2-first-slice.md). The runtime implementation is ESM JavaScript with checked Core-compatible declaration types; it does not add a Node type package. Driver peer metadata is optional so this default-disabled package does not require an automatic Native install. The explicit synthetic composition still requires exact Driver 13.0.3.

## Synthetic Host composition (2026-10-19)

`@apv/storage/host` exports `openHost()`; it is unavailable without starting a process or opening a database. `@apv/storage/host-development` separately exports `launchSyntheticHost(capability, options)` with exact Driver binary/Core hashes and an admitted synthetic root. See [typed Host interface](src/host-development.d.mts) and [implementation/evidence](../../docs/storage/phase-2-first-slice.md#host-composition-follow-up--2026-10-19).

The child privately owns both Owner and Project connections. Await `admitted` for the actual pre-open barrier (`holdAtAdmission:true` is development-only), `activate()` to release that barrier, then `ready`. `read()` and `commit()` are bounded async calls; only one can be in flight. `close()` synchronously disables intake, drains the accepted operation and waits for Project-before-Owner closure plus actual child exit and channel/stdio completion. `status()` separates lifecycle phase from returned outcome; phase CLOSED never proves COMMIT outcome. No automatic replay, publish, ACK, restart or PID lease exists.

In the default metadata-only synthetic mode, open connections report main names via SQLite/Driver APIs; `resourceBinding.actualDriverHandleIdentity` is `unavailable`. The separately reviewed native mode below adds actual main/WAL handle evidence, while live replacement safety and production admission remain unproved. Existing synthetic catalogs lacking the new exclusive `catalog-admission.json` readiness proof are refused unchanged; there is no automatic import/recreation/migration. This marker is a startup admission check, not a business ownership lock.

Run only on fresh synthetic data, with the existing approved installed Driver root:

```cmd
node --test packages\storage\tests\lifecycle.test.mjs
node packages\storage\tests\run.mjs --execute-host-synthetic --driver-root "%APV_DRIVER_ROOT%"
```

No arguments remain disabled. Host requests are bounded to 8 MiB; initialization and full-state response envelopes to 256 MiB so the retained ledger is not accidentally limited by the 8 MiB Snapshot cache. Original 128 MiB logical authority policy still applies. Limits are not throughput, memory-availability or durability guarantees. Production Host, actual physical identity, release-failure handling, real COMMIT uncertainty and full O01/O02/S/P/M remain gated. No historical VFS Harness or fault DLL is invoked.

## B1 native identity integration — synthetic only (2026-10-19)

[Read-only attestor](native/apv_identity.c) uses the actual connection's SQLite API dispatch: `sqlite3_context_db_handle` → `sqlite3_file_control(main, SQLITE_FCNTL_WIN32_GET_HANDLE)` → Windows `GetFileInformationByHandleEx(FileIdInfo)`. It never closes or replaces a borrowed handle. `SQLITE_FCNTL_JOURNAL_POINTER` additionally exposes the live WAL file object; its own xFileControl yields the actual WAL handle. Expected path identity is separately measured and clearly labeled, not substituted for connection identity. No custom VFS, fault injection or Driver modification is used.

`nativePackage` is an explicit synthetic Host/Store option. [Admission](src/native-attestor.mjs) requires an exclusive local NTFS TEMP build location, exact reviewed BuildId **fc7be262-e067-4658-9329-dce0dd36d858**, independently code-pinned DLL SHA256 **1e1dc8ebe575078928d7a7b84a1c9321dfc867f735135483b7146531e8be46db**, seven current build inputs, compiler/PE evidence and a fresh actual DLL hash before loading. A self-authored manifest or project-directory DLL cannot grant loading permission. No arbitrary extension-load API is exported. This is a reviewed local development artifact, not signed production distribution or protection against an attacker who can rewrite trusted application code.

Native synthetic catalogs use schema **2** with persisted Catalog/Owner/Project native identities, alongside existing Project/root/StoreKey/generation binding. Every new Owner/Project connection is measured against that baseline before configuration; intake and final transaction checks re-attest main/WAL identity. Older metadata-only catalogs stay schema 1; neither automatic upgrade nor downgrade is supported. Unknown identity/API/load errors return unavailable without creating replacement authority. Production APIs stay unavailable even when passed native options.

The build entry is disabled by default. To reproduce on separately approved source/toolchain, set `APV_CLANG` to the existing approved compiler and `APV_DRIVER_ROOT` to installed Driver 13.0.3, then run from Windows CMD:

```cmd
node packages\storage\native\build.mjs --build --compiler "%APV_CLANG%" --driver-root "%APV_DRIVER_ROOT%"
```

Every build creates a new TEMP BuildId and never approves itself. A new build's hash/identity must be reviewed and the code allowlist deliberately updated before loading. For the currently reviewed build, set `APV_NATIVE_MANIFEST` to its local `build.json` and run only on new synthetic data:

```cmd
node packages\storage\tests\run.mjs --execute-b1-synthetic --driver-root "%APV_DRIVER_ROOT%" --native-manifest "%APV_NATIVE_MANIFEST%"
```

Final bounded verification: **8/8**, RunId **528944d8-5687-4240-9630-93c9589e7270**; actual main/WAL identities, reopen, concurrency/fencing, conflicting catalog identity, hard links, unsupported memory API, sanitized load-API exception and unreviewed-package refusal. See [raw evidence index and limits](../../docs/storage/phase-2-first-slice.md#b1-native-handle-integration--2026-10-19). The load-API exception is controlled; real packaged Host/DLL load failures are not proven by it.

**B1 remains BLOCKED for production:** SHM is path metadata only, not a SQLite-owned handle proof. Installation/profile-wide private namespace, ACL and artifact packaging/admission remain unverified. Metadata-to-open and final-check races, hidden loss and successful external replacement are not eliminated. No source ACK/publish/replay or real Codex Session is enabled. Full O01/O02 and S/P/M statuses do not change.
