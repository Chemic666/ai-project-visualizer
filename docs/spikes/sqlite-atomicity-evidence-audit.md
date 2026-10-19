# S02/S13 Disposable Atomicity — Independent Evidence Audit

**Audit date:** 2026-10-10. **Recommendation: PASS WITH LIMITATION; ready for formal Closure Review, not automatically closed.**

Only the three user-executed runs below were audited. No experiment/Worker was
started, no Harness or original evidence was changed, and no SQLite connection
was opened. Production S02/S13 remain **NOT TESTED**. D-041–D-044 remain Proposed.
This report does not accept ARCHITECTURE §9's unresolved sourceEventId/Cursor wording.

## Evidence locations and audit method

The user supplied the exact evidence and capture directories; they were directly
read, not discovered by guessing another run or using the sandbox's TEMP.
For portable local references below, expand these aliases using the supplied
Windows account's `%LOCALAPPDATA%`:

- **A:** `%LOCALAPPDATA%\Temp\apv-sqlite-atomicity\7a320bde-f8f5-42e2-a64d-bdd2312629bd`.
- **B:** `%LOCALAPPDATA%\Temp\apv-sqlite-atomicity\303ee2b4-065d-4dfd-bb17-1a891cd7089e`.
- **C:** `%LOCALAPPDATA%\Temp\apv-sqlite-atomicity\564bf90b-e626-43bc-9b98-e7e791275c0d`.
- **CMD:** `%LOCALAPPDATA%\Temp\apv-atomicity-cmd-4017-17530` — the directory explicitly confirmed by the user, not an inferred current environment variable.

`A/raw/...` means the actual file under alias A; likewise B/C/CMD. Original files
must remain locally retained. References are local evidence indexes, not public
downloads. All times in the tables below are recorded UTC on 2026-10-10.

The audit independently parsed raw JSON and compared whole SQL cuts without
calling the Harness's Oracle, verdict function or Worker. It recomputed file and
cut SHA256, validated commands/receipts/nonce/PID/lifecycle, and checked causal
parent order. Current experiment/Core source files were compared with each
manifest's 32 hashes; native bytes were read and hashed without loading the addon.
The source matches the bounded [experiment definition](../../experiments/phase-2-sqlite-atomicity-spike/README.md).

Retained `.sqlite` files were inspected as bytes only: inventory SHA256, SQLite
header and WAL/rollback format markers. Logical contents at the recorded cuts are
supported by **actual runtime independent SQL Readers**, not by a new audit-time
database query. This audit does not claim an independent audit-time integrity_check
or fresh reconstruction from retained database pages.

| Case | Manifest identity / creation UTC                      | Indexed files | Worker receipts | Commands | Workers | SQL cuts |
| ---- | ----------------------------------------------------- | ------------: | --------------: | -------: | ------: | -------: |
| A    | `7a320bde-f8f5-42e2-a64d-bdd2312629bd` / 13:25:31.045 |           222 |              82 |       28 |      11 |        8 |
| B    | `303ee2b4-065d-4dfd-bb17-1a891cd7089e` / 13:32:05.794 |           168 |              61 |       22 |       8 |        5 |
| C    | `564bf90b-e626-43bc-9b98-e7e791275c0d` / 13:32:15.553 |           804 |             292 |      102 |      45 |       23 |

Sources: each run's `manifest.json`, `inventory.json`, `lifecycle.json`, raw
receipts/commands and `parent-observations.json`. The 36 SQL receipts each contain
the ten actual `SELECT * FROM <table> ORDER BY rowid` queries and full result rows.

## A. Case A Protocol Verdict — PASS WITH LIMITATION

Writer A `writer-a-2`, PID **18472**, nonce
`e64c46a3-7f81-4fee-b20b-2586cebc877b`, obtained Owner, committed epoch 1 and became
ACTIVE before taking the Project write transaction. The actual sequence is:

|           Parent order | Evidence                                                                                                   | Observed fact                                                                                                            |
| ---------------------: | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
|            9 → 11 → 12 | `A/raw/writer-a-2-2.json`, `-4.json`, `-5.json`                                                            | Owner HELD_UNFENCED → epoch1 COMMIT → ACTIVE                                                                             |
|           25 → 35 → 36 | `A/raw/writer-a-2-6.json`, `-16.json`, `-17.json`                                                          | Project write acquired, full bundle staged through before_commit, transaction remains open                               |
|                     39 | `A/raw/reader-5-2.json`                                                                                    | Independent Reader still sees the complete old cut                                                                       |
|                     45 | `A/raw/writer-a-2-18.json`                                                                                 | Controlled Owner rollback/revocation; Project transaction remains active; `controlledFixture=true`                       |
|      48 → 49 → 50 → 51 | `A/raw/writer-b1-6-2.json` through `-5.json`                                                               | B1 PID12648 obtains Owner, attempts fencing, receives SQLITE_BUSY; BLOCKED, no Project transaction/fencing COMMIT/ACTIVE |
|                60 → 61 | `A/raw/writer-a-2-19.json`, `-20.json`                                                                     | Old COMMIT rejected as OWNER_REVOKED; actual active transaction explicitly rolled back to inTransaction=false            |
| 71 → 74 → 77 → 79 → 80 | `A/lifecycle.json`; `A/raw/writer-b2-9-2.json`, `-4.json`, `-5.json`                                       | A and B1 exit before fresh B2 obtains Owner and commits epoch2, then ACTIVE                                              |
|  102 → 103 → 104 → 106 | `A/raw/writer-b2-9-18.json` through `-20.json`; `A/raw/ack-sink-3d2f44f7-b4fd-46fa-ad9d-8a749d71db7c.json` | One legal OP-E1 COMMIT, fixture publication, ACK intent, then independent parent ACK sink                                |

B1's acquire command is independently recorded in
`A/raw/command-0a98715c-2249-4369-93cc-5de00962cd64.json` at parent order 47.
Its Owner receipt specifies busy_timeout **250ms**. In the same B1 process,
fence-attempt sequence 3 is at monotonic 42.7604ms and BUSY sequence 4 at
377.2665ms: **334.5061ms receipt interval**. This interval includes receipt/SQL
overhead and is not an exact isolated SQLite call duration or Watchdog experiment.
B1 never emits fence_committed/ACTIVE or business COMMIT/publication/ACK.

B2 `writer-b2-9`, PID **13056**, nonce
`f6b0a3f9-2594-4538-b4d7-4c2a9189004d`, uses epoch2 token
`699f573c-68ae-490f-ab9b-9f66a9401077`. The fencing-only Reader confirms only
control epoch/token changed; ledger/head/domain history/cursor stayed unchanged.

### Actual independent Reader cuts

| Checkpoint                | SQL receipt                    | Order | UTC          | Observed cut                                      |
| ------------------------- | ------------------------------ | ----: | ------------ | ------------------------------------------------- |
| pre_transaction           | `A/raw/reader-3-2.json`        |    15 | 13:25:31.460 | old, epoch1/head1                                 |
| pin_old                   | `A/raw/reader-pinned-4-2.json` |    22 | 13:25:31.553 | exactly the same old cut                          |
| uncommitted_full_bundle   | `A/raw/reader-5-2.json`        |    39 | 13:25:31.644 | exactly the same old cut                          |
| fence_busy                | `A/raw/reader-7-2.json`        |    54 | 13:25:32.144 | exactly the same old cut                          |
| old_rollback              | `A/raw/reader-8-2.json`        |    64 | 13:25:32.245 | exactly the same old cut                          |
| new_fence_before_business | `A/raw/reader-10-2.json`       |    83 | 13:25:32.411 | epoch2/head1; only control epoch/token differs    |
| pinned_after_new_commit   | `A/raw/reader-pinned-4-4.json` |   108 | 13:25:32.447 | pinned Reader still sees exactly old epoch1/head1 |
| fresh_after_new_commit    | `A/raw/reader-11-2.json`       |   112 | 13:25:32.524 | complete new epoch2/head2 bundle                  |

All six old/pinned cuts are equal **row for row across all ten tables**, not merely
equal head or Writer claims. Their recomputed digest is
`d33ae64c8c5fbb1d1cf79b26a5d9068e93c0d2388a9d0324a57c5608bfbd2309`.
Fresh committed cut digest is
`1c161dc3a0d5fb9d4ae905ec96a63b9630e039dc020e4fd4cf9ca8b263751343`.

This proves the scheduled controlled handoff/rollback and same-Project write
serialization. It does **not** prove instantaneous revocation after hidden Owner
loss or a physical file replacement. No such fault was injected.

## B. Case B Protocol Verdict — PASS WITH LIMITATION

Old process `writer-old-2`, PID **7056**, nonce
`732ab94a-3ea0-45ca-8f27-21db87a3e00b`, obtains epoch1 and normally releases its
Owner/Project connections (`B/raw/writer-old-2-6.json`, order14). It stays alive
only as a negative stale-capability SQL probe, **without Owner permission**.

New Writer `writer-new-3`, PID **22196**, nonce
`3664d178-314c-48c5-9dae-7d1509a36d63`, holds Owner at order17, commits fencing at
19, then enters ACTIVE at 20 (`B/raw/writer-new-3-2.json`, `-4.json`, `-5.json`).
Its epoch2 token is `792782d6-c766-467f-aa20-45708d2499be`.

| Rejection                                              | Actual write/guard evidence                                                                                                                        | Settlement                                                   | Independent after-cut                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| First stale capability, before legal business COMMIT   | `B/raw/writer-old-2-7.json` order29: write acquired, persisted epoch2/token compared with supplied epoch1/token; `-8.json` order30: GUARD_MISMATCH | `-9.json` order31: active transaction explicitly rolled back | `B/raw/reader-5-2.json` order34 equals baseline `reader-4-2.json` order23  |
| Second stale capability, after legal COMMIT            | `B/raw/writer-old-2-10.json` order66; `-11.json` order67: GUARD_MISMATCH                                                                           | `-12.json` order68: explicit rollback                        | `B/raw/reader-7-2.json` order71 equals committed `reader-6-2.json` order60 |
| Current capability, stale expected base1 against head2 | `B/raw/writer-new-3-22.json` order77 shows matching current epoch2/token and head2; `-23.json` order78: BASE_CONFLICT                              | `-24.json` order79: explicit rollback                        | `B/raw/reader-8-2.json` order82 equals the committed cut                   |

All three failures have inTransaction=true at error, then false with
rollbackConfirmed=true; none produces business COMMIT/publication/ACK. Epoch/token
rejection and base-version rejection are separate causes. Reader cuts are:

| Checkpoint                   | SQL receipt             | UTC          | Complete cut      |
| ---------------------------- | ----------------------- | ------------ | ----------------- |
| post_fence_pre_stale_probe   | `B/raw/reader-4-2.json` | 13:32:06.185 | epoch2/head1      |
| after_stale_rejection        | `B/raw/reader-5-2.json` | 13:32:06.276 | exactly unchanged |
| new_complete_bundle          | `B/raw/reader-6-2.json` | 13:32:06.379 | epoch2/head2      |
| after_second_stale_rejection | `B/raw/reader-7-2.json` | 13:32:06.468 | exactly unchanged |
| after_base_conflict          | `B/raw/reader-8-2.json` | 13:32:06.552 | exactly unchanged |

The before pair's full-cut digest is
`ce9b46372cc6c2d718308ff1e93c449d03e270735a38368cf4b2f9e0e9aa016d`;
all three committed cuts have digest
`b8d6f706d7c6c8cb8f4978c00477ad60fdd254234102858c68396ff0cff82ced`.
One legal COMMIT/publication/ACK occurs at orders53/54/55, with external ACK sink
order57: `B/raw/writer-new-3-18.json` through `-20.json` and
`B/raw/ack-sink-d849c79b-2f65-4bdc-9cc3-cce15db3b118.json`.

The negative probe is not an old ACTIVE production Writer retaining valid Owner.
These tests do not prove every simultaneous Writer/CAS or COMMIT race.

## C. Case C Protocol Verdict — PASS WITH LIMITATION

All ten **separate disposable units** actually reach their configured failure
point, in the exact expected prefix order. Their stage command records contain
`args.inject=<barrier>` and match the Worker commandId/nonce. The source-hash-bound
injection performs a real duplicate-control-PK SQL statement. Each raw error is
`SQLITE_CONSTRAINT_PRIMARYKEY`, message `UNIQUE constraint failed: control.id`,
with Project transaction still active. Each subsequent settlement explicitly
confirms rollback and inTransaction=false before the after-Reader.

Every row below has full all-table before/after equality, head1, zero accepted
events/dedup/checkpoints and no new operation success, Assertion/history/Snapshot
or cursor effects. **Every failure unit has zero COMMIT, publication, ACK intent
and external ACK sink.** This is confirmed from all receipts, not assumed from the
Runner's per-barrier PASS labels.

| Unit / Barrier          | Barrier → error → settled raw receipt (under C/raw) | Parent orders   | Independent before → after SQL receipts (under C/raw) | Reader UTC before → after   | Verdict              |
| ----------------------- | --------------------------------------------------- | --------------- | ----------------------------------------------------- | --------------------------- | -------------------- |
| c-0 / after_begin       | writer-2-7.json → -8.json → -9.json                 | 22 → 23 → 24    | reader-3-2.json → reader-4-2.json (15 → 27)           | 13:32:15.850 → 13:32:15.936 | PASS WITH LIMITATION |
| c-1 / after_event_dedup | writer-6-8.json → -9.json → -10.json                | 57 → 58 → 59    | reader-7-2.json → reader-8-2.json (49 → 62)           | 13:32:16.195 → 13:32:16.286 | PASS WITH LIMITATION |
| c-2 / after_assertions  | writer-10-9.json → -10.json → -11.json              | 93 → 94 → 95    | reader-11-2.json → reader-12-2.json (84 → 98)         | 13:32:16.551 → 13:32:16.641 | PASS WITH LIMITATION |
| c-3 / after_entities    | writer-14-10.json → -11.json → -12.json             | 130 → 131 → 132 | reader-15-2.json → reader-16-2.json (120 → 135)       | 13:32:16.906 → 13:32:16.995 | PASS WITH LIMITATION |
| c-4 / after_corrections | writer-18-11.json → -12.json → -13.json             | 168 → 169 → 170 | reader-19-2.json → reader-20-2.json (157 → 173)       | 13:32:17.270 → 13:32:17.361 | PASS WITH LIMITATION |
| c-5 / after_conclusions | writer-22-12.json → -13.json → -14.json             | 207 → 208 → 209 | reader-23-2.json → reader-24-2.json (195 → 212)       | 13:32:17.624 → 13:32:17.719 | PASS WITH LIMITATION |
| c-6 / after_snapshot    | writer-26-13.json → -14.json → -15.json             | 247 → 248 → 249 | reader-27-2.json → reader-28-2.json (234 → 252)       | 13:32:17.993 → 13:32:18.086 | PASS WITH LIMITATION |
| c-7 / after_checkpoint  | writer-30-14.json → -15.json → -16.json             | 288 → 289 → 290 | reader-31-2.json → reader-32-2.json (274 → 293)       | 13:32:18.380 → 13:32:18.493 | PASS WITH LIMITATION |
| c-8 / after_head        | writer-34-15.json → -16.json → -17.json             | 330 → 331 → 332 | reader-35-2.json → reader-36-2.json (315 → 335)       | 13:32:18.769 → 13:32:18.870 | PASS WITH LIMITATION |
| c-9 / before_commit     | writer-38-16.json → -17.json → -18.json             | 373 → 374 → 375 | reader-39-2.json → reader-40-2.json (357 → 378)       | 13:32:19.157 → 13:32:19.255 | PASS WITH LIMITATION |

The evidence does not say SQLite automatically rolled back on exception: all ten
show inTransaction=true at error and explicit subsequent rollback. `after_begin`
is after current capability/base guards, before business DML. `after_event_dedup`
covers event plus claim; version barriers and `after_head` follow the documented
aliases. No applicable declared business barrier is missing. There is no sweep
of bootstrap/fencing, post-COMMIT crashes, disk/IO failures or future Engine outputs.

### Independent successful control

`C/c-success` is a separate positive control, not a retry of any failed unit.
Writer `writer-control-42`, PID17472, epoch1 token
`01a1c50c-4e1d-4221-8c97-097dbc735661`, commits only OP-E1 at order426.

- `C/raw/reader-43-2.json`, order400, UTC13:32:19.527: pre-transaction complete old cut.
- `C/raw/reader-44-2.json`, order420, UTC13:32:19.630: uncommitted full bundle still invisible; exact old cut.
- `C/raw/reader-45-2.json`, order433, UTC13:32:19.724: complete new epoch1/head2 cut.
- `C/raw/writer-control-42-18.json` through `-20.json`: COMMIT/publication/ACK intent at 426/427/428.
- `C/raw/ack-sink-51a5f69d-a8aa-4ca8-9794-e03339fb8eca.json`: actual parent sink at order430.

## D. Embedded Independent Reader Coverage — PASS WITH LIMITATION

Sources: A/B Reader tables above and C's ten paired Readers plus positive control.
There are **36 actual SQL cuts** from **35 separate Reader child processes**;
only A's pinned Reader is reused for its second cut. A's pinned connection is not
closed between order22 and order108; its close receipt
`A/raw/reader-pinned-4-6.json` confirms the pinned transaction is ended afterward.
Fresh Readers have distinct bound process identities and read transactions.

Successful cuts independently contain these row counts:

| Table               | Old complete cut | New complete cut |
| ------------------- | ---------------: | ---------------: |
| control             |                1 |                1 |
| commits             |                1 |                2 |
| events              |                0 |                1 |
| assertions          |                6 |                8 |
| entity_versions     |                5 |               10 |
| correction_versions |                1 |                3 |
| conclusion_versions |                1 |                2 |
| dedup               |                0 |                1 |
| snapshots           |                1 |                2 |
| checkpoints         |                0 |                1 |

Audit compares actual JSON bodies/order and history, not counts alone. The shared
beforeState digest is
`cb28369cb4b70303db3603ffe5c16be9e41ef3b09db29ba16aa8c8954dc70039`;
afterState digest is
`5a61515f4eea0d0eda013aac5402400ce0093c0b70b0b9208b0edb2767e43cf3`.
Ownership tokens differ between runs/units, so complete SQL cut digests need not
match across unrelated runs.

In each successful cut, E1 is stored once at sequence2; immutable Assertions equal
fixture.after and preserve original provenance. Completion remains
`agent_reported`, not Observed/Verified. Original C1 and old conclusion/entity
images remain at sequence1; trusted C1-superseded/C2-active manual images are at
sequence2 with valid original/corrected Assertion references. Snapshot2's body,
watermark2, digest and checkpoint vector match the exact golden cut; checkpoint
SRC-A/fixture/UNIT-1 covers E1 at sequence2; dedup SRC-A/K1 points to that same E1.
AcceptedEvents is represented by canonical events, not discarded when absent from
snapshot body. No partial committed bundle was observed.

Connection ownership is supported by source-hash-bound Worker creation/open/read
code, its RunId/unit binding, process nonce and receipts. No separate connection
UUID, OS handle identity or WAL/SHM physical-resource identity was captured. This
does not prove production binding safety or every reader/checkpoint interaction.

## E. Embedded Failure Settlement Coverage — PASS WITH LIMITATION

| Actual mode                 | Evidence                                           | Result / boundary                                                                                                                               |
| --------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Project SQLITE_BUSY         | A B1 sequences3–5                                  | Attempt fails before Project transaction begins; settlement confirms no active transaction. Owner stays held until explicit close, never ACTIVE |
| Observable Owner revocation | A Writer sequences18–20                            | Pending business transaction explicitly rolled back; no commit/publication/ACK                                                                  |
| Epoch/token Guard mismatch  | B old Writer sequences7–12                         | Two actual write acquisitions followed by mismatch and complete rollback                                                                        |
| Base-version conflict       | B new Writer sequences22–24                        | Current capability matches, stale expected head rejected; complete rollback                                                                     |
| SQL constraint exception    | C table's ten error/settlement pairs               | Transaction remains active at exception, then explicit rollback and unchanged independent full cut                                              |
| Normal connection closure   | Each run's final close receipts and lifecycle.json | All 64 bound children report close/settlement and are observed exiting normally                                                                 |

All expected error commandIds have exactly one failed terminal receipt, no COMMIT,
publication or ACK receipt, and no external ACK sink. Separate legal commits have
exactly one COMMIT/publication/ACK intent/sink per successful run. No malformed
failure is hidden behind a later success or missing-check label.

Real COMMIT IO uncertainty, failed rollback/close, nonce outcome lookup/recovery,
crash restart and actual release failures are **NOT TESTED** here. The pure
settlement helper's existence is not execution evidence for those failure modes.

## F. Evidence Integrity and Lifecycle — PASS WITH LIMITATION

All **1,194 inventory entries** have matching bytes/size/SHA256; no path escape,
missing entry or unlisted original file was found. `inventory.json` and
`derived-result.json` are intentionally outside their own inventory; their hashes
are independently recorded in this report. No cryptographic signing/trusted
external timestamp is claimed. Checksums detect disagreement with this local
record, not malicious rewriting of both evidence and its manifest.

| Case | inventory.json SHA256                                              | manifest.json SHA256                                               |
| ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| A    | `67ab235098d8b246e0750a435d734f4ed9dbbc889f4504cfb9545555e8536d59` | `b3e395d6751be5d1fda9702e9cbaea49f35f4808acd16ac1dadcb648d5e3c5cf` |
| B    | `c2119b792807cd6bb855b1c917cc35969187fa595852856c99537e418dfd67ee` | `11a4dcd42e28ef5f0cdf7a499e2201192ed8a71164023807a4ddc180b6c3f55d` |
| C    | `70c058e2b232458c40b79550f1e00b7e62fbefada9f23aa81eca58509c97f02e` | `6fed5deeb0c866e673af15c3044fab587dc78bb5db2808b2b183c7a3f2cc4382` |

The unindexed derived summaries are descriptive evidence only, not the basis for
the protocol verdict. Their independently read SHA256 values are recorded below
to preserve the original summaries alongside the indexed raw evidence.

| Case | derived-result.json SHA256                                         |
| ---- | ------------------------------------------------------------------ |
| A    | `c8e456a80fdf6b2157bb1fdde016258bd496c202a8c3b960c991274577864951` |
| B    | `a50032053bbf4b8dcaf96e981d7af5b745949301b673329ae75c837a8579bb36` |
| C    | `68c44d596af250e40e1fd46d1d9d60cd2dca5bb358c720877c715365b0235add` |

All manifests identify ordinary Windows x64 Node v24.21.0, Driver13.0.3.
All 64 startup receipts record actual Driver SQLite **3.53.4**, modules137/NAPI10
in the recorded Node environment. Native SHA256 in all three manifests matches
the actual installed resource bytes:
`e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a`.
Each manifest's 32 current Core/Harness source hashes match; no version mismatch
was found. This is not Extension Host or cross-platform evidence.

Each bound child has continuous Worker receipt sequence, matching nonce/PID/RunId,
one startup and complete command responses. All 152 recorded commands have exactly
one matching terminal receipt. Worker monotonic times are nondecreasing. Each
parent order domain is unique and complete: A1–122, B1–92, C1–440, incorporating
commands, observed receipts, ACK sinks and exits. Each individual raw parent
observation agrees with parent-observations.json. These causal records, rather
than cross-process wall clocks, establish the reported ordering.

All **64 bound ChildProcess instances** have actual expected normal exit records:
code0, signal null, after their final receipts. All 128 stdout/stderr files are
empty. No unfinished command, timeout, settlement_failed, anomalous cleanup or
unclosed Worker is recorded. This is the run's owned-child lifecycle proof, not
a current global process/PID-name survey or kernel/file-lock-release guarantee.
The 26 retained database files have matching inventory hashes and valid SQLite
headers: Project WAL markers, Owner rollback markers. No new SQL was executed to
obtain these audit observations.

## G. CLI Exit Code Verification — PASS (recorded value 0 for A/B/C)

The user explicitly supplied CMD's directory. The auditor directly read each
`CMD/A.txt`, `B.txt`, `C.txt`: its JSON names exactly the audited RunId/root and
Runner status. Each separate `A-exit-code.txt`, `B-exit-code.txt`,
`C-exit-code.txt` contains exactly `EXPERIMENT_EXIT_CODE=0` (with line ending).
These are the user's independent top-level CMD capture records, not Worker exit
codes and not an inference from Runner PASS or process.exitCode source intent.

| Capture                 | Output file SHA256                                                 | Exit record SHA256                                                 |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| A.txt / A-exit-code.txt | `65c5a41d7edc22f80abd33e7b53bfce7080b80257ac1c47535fb858f7ec74665` | `b6b4c5c55ac0e43c29cc04a8d628f57f60ad32dd846cd8571e7f72b077cf457a` |
| B.txt / B-exit-code.txt | `37bf818f43d4df4c05de3b4ff9bb585339dff98d323e5a9d2e398c3eb4f14305` | same exit-file hash                                                |
| C.txt / C-exit-code.txt | `dbd6b9cc663dd39a3f93c4d19d49a921eea4175b35ce29ab6275803bd0585558` | same exit-file hash                                                |

The three original derived-result.json CLI fields remain **UNVERIFIED** as
written; they were not patched. Independent exit verification belongs to this
new report. Matching named captures/user-provided provenance bind the exit records
to the runs; the exit files do not themselves embed RunId or a signed command log.

**Historical literal CMD invocation text: UNVERIFIED.** The six capture files
contain JSON result/exit values, not the actually typed Node command lines or full
terminal transcript. Raw command-*.json files are Worker commands, not shell
commands. Manifest/source/parser and recorded executed scenarios agree with the
expected --case A/B/C --execute entry points, but reconstructed commands must not
be called original captured input. No after-the-fact command record is fabricated.
This gap does not invalidate observed SQL/transaction or explicitly captured
exit results; disclose it during Closure Review.

## H. S02/S13 Partial Coverage and Remaining Gaps

| Existing acceptance requirement                                                                                                                                                    | Actual evidence                                                                                                                | Audit scope / production state                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S02: failure after each applicable pre-COMMIT barrier, including Snapshot/Cursor/head; preserve old full cut                                                                       | C ten actual constraint/rollback/Reader pairs; independent positive control                                                    | **PASS WITH LIMITATION, experimental Partial Coverage.** Only declared business bundle, one stable E1, trusted history images. Full production S02 **NOT TESTED**                               |
| S13: actual fixture writers contend with same expected revision, held read transaction, one commit/one conflict, no lost update, all-old/all-new and bounded BUSY/WAL observations | A old Project transaction/B1 fencing contention and controlled handoff; pinned/fresh SQL; B stale-capability and base conflict | **PASS WITH LIMITATION, experimental Partial Coverage.** Not a complete simultaneous valid-Writer defensive CAS race or production owner-election/Host test. Full production S13 **NOT TESTED** |
| D/E                                                                                                                                                                                | The actual cuts and error/settlement receipts detailed above                                                                   | Bounded visibility/error treatment only; unknown COMMIT reconciliation and every fault mode **NOT TESTED**                                                                                      |

Acceptance references: [existing S02/S13](../acceptance/phase-2-storage.md#3-atomicity--recovery-cases),
lines58/69 at audit time. Barriers use the exact experiment's documented aliases;
no new parallel acceptance IDs or passing production statuses are introduced.

Remaining unexecuted properties include missing/derived identity and batch Cursor
paths; changed duplicate claims, real Source consumption/ACK/resume; full recovery
and nonce reconciliation; bootstrap/control/migration/retention/deletion atomicity;
real rollback/release failures; process crashes, disk/IO, power loss, other
platforms and production Extension Host. The fixture's C1/C2 images prove
persistence/history preservation, not a live Correction/Resolution Engine.
Exact historical typed shell commands and independent connection/file identities
have the evidence limitations described above.

Hidden Owner loss, successful external file replacement and the final external
Guard–COMMIT race remain **NOT GUARANTEED** by this two-file scheme. No inspected
result removes the production binding/safety/Privacy/Retention gates. Stable
SRC-A/K1 and separate UNIT-1 cover only their synthetic complete unit, not the
unresolved Architecture source-identity policy.

## I. Final recommendation and delivery boundary

**A, B, C (all ten C barriers plus separate positive control), embedded D/E:
PASS WITH LIMITATION within the actual tested scope.** No actual protocol
invariant violation or missing necessary protocol checkpoint was found.
Integrity/lifecycle evidence supports that bounded conclusion; CLI recorded
exit0 is independently verified, with original literal command capture remaining
UNVERIFIED as explicitly disclosed.

Recommend recording these runs as experimental PASS WITH LIMITATION and proceeding
to **formal Atomicity Spike Closure Review**. This report itself does not close
the Spike, approve production implementation, accept a Driver/Decision or pass
complete S02/S13. Closure Review must explicitly retain Partial Coverage and the
evidence limits. It need not silently enlarge/retry these experiments to make a
passing conclusion.

Only this audit document was created. No Harness/specification/Core/Storage or
original evidence/receipt/database was edited, no Worker or new SQL connection
was started, no status was rewritten and no commit/push was performed.
