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
