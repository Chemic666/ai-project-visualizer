# First Storage vertical slice — implementation and evidence

Date: 2026-10-19. **Implemented and tested on isolated synthetic data; production admission disabled.** This is an adapter implementation record, not a new Spike or full acceptance report. Policies D-041/D-043 are Accepted, D-042 Accepted — conditional architecture, D-044 Accepted — initial implementation policy; policy approval does not pass production gates.

## Delivered boundary

[`packages/storage`](../../packages/storage/README.md) adds an ESM implementation with `.d.mts` Core-compatible interface declarations. Implementation syntax/lint, declared API typechecking and runtime tests are separate checks. Core remains unchanged. The concrete Driver is injected only into the explicit development composition; no ORM, new Engine, fault extension, Agent or Host UI is introduced.

- Default `openProductionStore()` is permanently unavailable with `physical_binding_unverified`. Supplying `enabled:true` cannot enable it. No background collection or real-project path admission exists.
- The separate synthetic capability accepts only a fresh, empty, owned Windows TEMP child; actual fixed/local NTFS, ancestor reparse, realpath, dev/ino and hard-link checks are performed. Reopen binds the original nonce and directory identities. This is **not actual Driver-handle attestation** and does not solve metadata-to-open TOCTOU, ACL trust or B1.
- One private catalog binds Project/root to a random StoreKey/generation with creating/active states. Active stores cannot be silently recreated. The stable Owner DB holds a lifetime IMMEDIATE transaction; the same synchronous store owns its Project connection. Project uses WAL/FULL, foreign keys and no automatic WAL checkpoint. Each business transaction checks generation/epoch/token/base, records complete authority, receipt, optional Snapshot and covered checkpoint atomically. Project closes before Owner release; uncertain settlement retires/quarantines capabilities.
- Nine existing-design tables contain current Core data only: store_meta, commits, normalized_events, entity_versions, assertions, correction_versions, conclusion_versions, snapshots, source_checkpoint_versions. Normalized immutable events provide internal/stable-source Dedup; entity/correction/conclusion versions preserve History. Snapshot is a checked cache; full acceptedEvents are rehydrated from authority. Ledger sequence, Snapshot watermark, source identity and Cursor remain distinct.
- Strict recursive closed fields, limits and graph validation precede writes; errors expose fixed categories only. Matching source claims reuse the canonical input; mismatches reject. Optional missing identity and shared Cursor batches remain legal; no missing-identity stable dedup algorithm is invented. `synthetic.v1` is a test consumption codec, not proof of a real source's ordering/completeness.
- Matching operation/nonce/intent returns the original receipt without reapplying; original receipt epoch is historical, current ownership is checked separately. Normal COMMIT produces a receipt. Unknown COMMIT does not return guessed success/rollback or blindly retry; the instance becomes unavailable. No ACK, automatic publish or replay is implemented.

## Actual verification

Final integration RunId: `73d3f0be-1472-4b00-b2c8-f0fc0adea4ef`.
Local disposable evidence directory: `%TEMP%\apv-storage-evidence-IlUfpX` (not committed or redistributed here).
Node 24.21.0, Windows x64, actual better-sqlite3 13.0.3 / SQLite 3.53.4.
Loaded Driver SHA256: `e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a`.
Actual bundled Core SHA256: `9b78659268028f625df95f04fed4430f57dcd2d0f4cb254fe6ee9982821036b5`.

**9/9 integration tests; 5/5 boundary tests.** Declaration typecheck, scoped ESLint, JavaScript syntax/PowerShell parsing and formatting checks are performed separately. No Core full-suite or archived Spike is rerun. Earlier RED/failed development runs are preserved, including a repeat on stale code after a failed copy and a pre-Worker evidence setup failure; they do not count as successful verification. Final manifest binds 19 source inputs. Independent file-level rehash matched **112/112 inventory entries**, source inputs **19/19**, protected Core/archived experiment inputs **161/161**. Inventory excludes itself and describes post-exit bytes, not signed/tamper-proof evidence.

Two actual Writer processes closed and exited with code 0 before their respective fresh Reader processes were started. S01 additionally starts a new adapter recovery process only after Writer exit; it restores the complete state at a new epoch 2, closes and exits 0 before the independent Reader begins. Historical business receipt epoch 1 remains unchanged. Readers import neither adapter/decoder nor Core; each queries all nine tables in a consistent SQL transaction, checks integrity/FKs and independently reconstructs expected Core state, Receipt/Nonce/Epoch/Intent/digests and Snapshot/vector cuts. A separate competing Owner process was denied; its exit and both Writer/Reader exits are retained, all code 0 (six child processes, plus the test coordinator). The test coordinator also exited 0. This proves normal OS-process termination in these tests, not crash/failed-close safety.

| Independent cut                                                  | Ledger/head | Event / Assertions / entity versions | Corrections / Conclusions / Snapshots / Checkpoints | Cut SHA256                                                         |
| ---------------------------------------------------------------- | ----------- | ------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------ |
| S01 complete committed cut                                       | 2           | 1 / 3 / 6                            | 2 / 2 / 2 / 1                                       | `f3f752383ffc21ea1b9866df4208fe3db18a7e48f685e0edc88e17a4de057f51` |
| S02 partial-record application exception, known rollback old cut | 1           | 0 / 2 / 3                            | 1 / 1 / 1 / 0                                       | `42317160a90efea907d9d5b06d054dc0bf6078ce9c7d31943b30e6723a00dac5` |

Both store_meta cuts contain one row; commits contain head rows. Core state digests respectively:
`f299517a5f63599f602211faf2aec5a6f080c924988fbf3a6c8b7770bfb533c8` and
`0711c5ebe3adf8a6c3fabc1bcb3193598d80a27e0864bb7877b37bd689f9c20e`.
The failed bundle has no new event/assertion/receipt/checkpoint and does not advance head. A rollback return alone is not used as the persistence Oracle.

Other targeted rejections: nested unsafe fields/secret-bearing error sentinel, foreign Project/coverage, stale epoch/token/generation/base, conflicting claim, missing active database/authority, changed catalog/Owner identity, unsupported restore data and a digest-consistent extra receipt field. Synthetic leak scans check known sentinel UTF-8/UTF-16 bytes; they do not prove universal secrecy. Catalog-binding loss observed at read **or final transaction guard** permanently revokes the instance, even after the file is restored. Deliberate authority-corruption fixtures are synthetic test inputs, not adapter acceptance of raw private fields.

## Existing acceptance subcoverage, never full-case PASS

See [original acceptance IDs](../acceptance/phase-2-storage.md). No parallel case taxonomy is added.

| Existing IDs | This slice's actual evidence                                                                                          | Still not validated                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| S01          | Genuine adapter, actual Core, Writer close/exit, fresh-process full SQL cut and recovery                              | Complete production Host/restart and broader fixture matrix                                       |
| S02          | One after-records pre-COMMIT application failure; independent all-old cut                                             | All-barrier sweep, actual I/O/COMMIT failure                                                      |
| S05          | Stable matching receipt/intent normal retry, new epoch stale capability rejection                                     | Lost COMMIT response, unsettled control nonce attribution, genuine unknown-outcome reconciliation |
| S06/S07      | Internal same/conflicting event and stable source alias/conflicting claim                                             | Full production source namespace/codecs                                                           |
| S08/S09      | Missing identity, two events/one Cursor, coverage/prior-position rejection                                            | Late-order semantics, real source complete-unit proof, checkpoint-only API, every replay path     |
| S12/M01      | Missing authority/active file, digest-consistent unsafe receipt, binding inconsistency => unavailable                 | Exhaustive corruption/schema/processor/backup recovery matrix                                     |
| P01/P02/P03  | Closed fields/known sentinels, selected Project/generation/Source mismatch, actual synthetic local NTFS/reopen checks | All sink/source/permission/reparse race cases and real private Host placement                     |
| P05          | Lower-only logical quota rejection and whole-bundle rollback                                                          | FULL/checkpoint/disk/COMMIT exhaustion and measured capacity                                      |
| O01/O02      | Actual separate-process Owner exclusion, normal release/reopen, default-disabled real-project entry                   | All O01 subcases, real Host/support tuple, handle lifetime/physical identity/release failures     |

Full **S01–S13 / P01–P08 / M01–M04 / O01/O02 remain NOT TESTED** as production gates. S03/S04/S10/S11/S13, full P04/P06–P08 and M02–M04 are not completed here. No performance, real disk failure, power-loss, genuine uncertain COMMIT or transport ACK claim is made. Only task-status event application is integrated in these runtime fixtures; other Core event unions are not full end-to-end acceptance.

## B1–B7 disposition and next boundary

| Existing blocker                              | Actual first-slice disposition                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 logical Project / physical Owner           | Partial synthetic catalog+identity checks only. Actual Driver-handle/common namespace/ACL/first-create races unproved; real-project entry blocked.                                                               |
| B2 guard–COMMIT external window               | Same-thread private checks only; external atomicity NOT GUARANTEED.                                                                                                                                              |
| B3 hidden loss                                | Visible failure retires capability; hidden loss NOT GUARANTEED.                                                                                                                                                  |
| B4 successful Owner replacement / dual Writer | Selected visible changes rejected; successful replacement/TOCTOU NOT GUARANTEED.                                                                                                                                 |
| B5 real release failure                       | Normal Project-before-Owner closure and OS-process exit tested; exception quarantine implemented. Real Driver/API/OS release failures and production execution lifetime NOT TESTED.                              |
| B6 actual COMMIT I/O uncertainty              | Normal receipts/retries and fail-closed policy implemented. True unknown outcome, full controlled settlement/reconciliation and durable control-nonce attribution NOT TESTED. No inference from missing receipt. |
| B7 Host/full contract                         | Policy and sequencing approved; only Node/dev synthetic tuple verified. Real Extension Host, packaging, full privacy/retention/migrations/deletion and all mandatory production acceptance still open.           |

Next minimal task for separate authorization: resolve the production Host's private physical-binding/admission and joint Owner/Project execution-lifetime contract against actual usable APIs; keep real writing disabled if it cannot be made credible. Then connect this existing adapter on synthetic data through that Host boundary and complete required acceptance subconditions. Do not add new SQLite fault Spikes. Catalog quota, migration backup/TTL, generation deletion/resume and authoritative-cache repair are not exposed/enabled in this slice.

No Git staging, commit or push. Original untracked G2-S script and historical evidence remain unchanged. No closed Spike document/Harness is edited.
