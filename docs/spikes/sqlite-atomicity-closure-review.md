# SQLite Atomicity Spike — Formal Closure Review

**Review date:** 2026-10-11. **Status: CLOSED — PASS WITH LIMITATION.**

**Closure recorded:** 2026-10-11, following the user's explicit authorization in “APV Phase 2.3 — Atomicity Closure & Event Identity Contract Resolution,” which reports ChatGPT's approval of **CLOSED — PASS WITH LIMITATION**. This records only the bounded disposable Spike closure; it does not authorize production implementation. Production S02/S13 remain **NOT TESTED**; D-041–D-044 remain **Proposed**; Phase 2 remains incomplete.

## 1. Closure Scope

Review the three user-executed Windows A/B/C runs and their embedded D/E observations against the [experiment definition](../../experiments/phase-2-sqlite-atomicity-spike/README.md), using the completed [independent evidence audit](sqlite-atomicity-evidence-audit.md). No experiment is rerun, no Worker is started, and no retained database is opened for SQL.

The scope is same-Project transaction serialization and fencing, explicit rollback of the declared complete business bundle, independent Reader visibility, and the actually executed error-settlement/publication boundaries. It uses synthetic immutable binding and a stable source identity subset. D/E are observations embedded in A/B/C, **not two additional top-level runs**.

This is an evidence-based experimental conclusion, not a general proof of SQLite durability or production Writer safety. It does not close the entire Phase 2, approve the Driver, accept any Decision, resolve source identity policy, or pass complete production S02/S13. The separately closed Ownership Spike does not supply those missing guarantees.

Reference contracts: [Phase 2.3 design](../storage/phase-2.3-design.md), [Support & Failure Contract](../storage/phase-2.3-support-and-failure-contract.md), [Writer Safety Review](../storage/phase-2.3-writer-safety-review.md), and [existing acceptance plan](../acceptance/phase-2-storage.md). Their Proposed requirements and unexecuted production gates remain unchanged.

## 2. Experimental Evidence Summary

Evidence aliases use the Windows account and directories explicitly supplied for the audit, not the review process's temporary directory:

- **A:** `%LOCALAPPDATA%\Temp\apv-sqlite-atomicity\7a320bde-f8f5-42e2-a64d-bdd2312629bd`.
- **B:** `%LOCALAPPDATA%\Temp\apv-sqlite-atomicity\303ee2b4-065d-4dfd-bb17-1a891cd7089e`.
- **C:** `%LOCALAPPDATA%\Temp\apv-sqlite-atomicity\564bf90b-e626-43bc-9b98-e7e791275c0d`.
- **CMD:** `%LOCALAPPDATA%\Temp\apv-atomicity-cmd-4017-17530`.

`A/raw/...`, `B/raw/...`, and `C/raw/...` denote retained original files under these aliases. This is a local evidence index; no raw evidence is copied into this review. Retain manifests, receipts, commands, lifecycle, parent observations, inventory, databases/sidecars and CMD captures without editing their historical contents.

| Case  | Manifest creation UTC, 2026-10-10 | Inventory files | Worker receipts / commands | Workers / SQL cuts | Reviewed protocol verdict                                             |
| ----- | --------------------------------- | --------------: | -------------------------: | -----------------: | --------------------------------------------------------------------- |
| A     | 13:25:31.045                      |             222 |                    82 / 28 |             11 / 8 | PASS WITH LIMITATION                                                  |
| B     | 13:32:05.794                      |             168 |                    61 / 22 |              8 / 5 | PASS WITH LIMITATION                                                  |
| C     | 13:32:15.553                      |             804 |                  292 / 102 |            45 / 23 | PASS WITH LIMITATION; ten failure units and separate positive control |
| Total | Three distinct RunIds             |       **1,194** |              **435 / 152** |        **64 / 36** | Bounded experimental coverage only                                    |

The audit records ordinary Windows x64 Node **v24.21.0**, modules137/NAPI10, **better-sqlite3 13.0.3**, and actual Driver SQLite **3.53.4**. It is not an Extension Host run. Native SHA256: `e21e5efd71fba66578e95b62554d9028064a80dafd7221bf8a8ef155de8d240a`.

### Case A — old transaction first

Audit §A binds the following causal parent orders to actual receipts:

- A obtains Owner, persists epoch1, then ACTIVE: orders9/11/12. A acquires Project write permission at25 and stages through `before_commit` at35/36.
- Controlled Owner rollback/revocation at45 leaves the Project transaction open. B1 obtains Owner at48, attempts fencing at49, receives **SQLITE_BUSY** at50, and settles BLOCKED at51 without fencing COMMIT or ACTIVE.
- A's attempted COMMIT is rejected as OWNER_REVOKED at60; explicit rollback at61 ends its active Project transaction. A/B1 exit before B2 obtains Owner and persists epoch2 at77/79, then ACTIVE at80.
- B2 legally commits at102, publishes at103 and reports fixture ACK intent at104; independent parent ACK sink records106.

Primary references: `A/raw/writer-a-2-18.json` through `-20.json`; `A/raw/writer-b1-6-2.json` through `-5.json`; `A/raw/writer-b2-9-18.json` through `-20.json`; `A/lifecycle.json`. Independent Readers at orders39/54/64 show the old complete cut; order83 shows only the new fencing control with unchanged head1; order112 shows the complete new epoch2/head2 bundle. See `A/raw/reader-5-2.json`, `reader-7-2.json`, `reader-8-2.json`, `reader-10-2.json`, `reader-11-2.json`.

This closes the scheduled controlled handoff/rollback coverage, **not instantaneous revocation after hidden Owner loss**. The recorded 250ms busy_timeout and 334.5061ms same-process receipt interval demonstrate bounded contention in this run, not an exact isolated SQL duration or a five-second Watchdog test.

### Case B — new epoch first

Audit §B records the old process normally releasing Owner/Project connections at14. It remains alive as a negative stale-capability SQL probe **without Owner permission**. New Writer obtains Owner at17, commits epoch2 at19, then ACTIVE at20.

| Attempt                                       | Actual rejection / settlement parent orders      | Independent SQL result                                               |
| --------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| Old capability before legal business COMMIT   | Write29 → GUARD_MISMATCH30 → explicit rollback31 | `B/raw/reader-5-2.json` at34 equals baseline `reader-4-2.json` at23  |
| Old capability after legal business COMMIT    | Write66 → GUARD_MISMATCH67 → explicit rollback68 | `B/raw/reader-7-2.json` at71 equals committed `reader-6-2.json` at60 |
| Current capability, stale base1 against head2 | Write77 → BASE_CONFLICT78 → explicit rollback79  | `B/raw/reader-8-2.json` at82 equals the committed cut                |

Raw rejection/settlement references are `B/raw/writer-old-2-8.json`, `-9.json`, `-11.json`, `-12.json`, and `B/raw/writer-new-3-23.json`, `-24.json`. All three transactions terminate with confirmed rollback; none produces business COMMIT, publication or ACK. One legal new-Writer commit/publication/ACK occurs at53/54/55, with parent sink57.

Fencing capability mismatch and expected-base conflict are **different rejection reasons**. This negative probe is not evidence of two simultaneously valid production Writers or a complete defensive CAS race.

### Case C — all ten declared business barriers

Audit §C independently verifies each actual barrier, real `SQLITE_CONSTRAINT_PRIMARYKEY`, subsequent explicit rollback, and whole ten-table before/after equality. All paths below are under `C/raw`; each row's protocol verdict is **PASS WITH LIMITATION**.

| Unit / actual barrier   | Barrier → error → rollback receipt      | Parent orders   | Independent before → after SQL receipts |
| ----------------------- | --------------------------------------- | --------------- | --------------------------------------- |
| c-0 / after_begin       | writer-2-7.json → -8.json → -9.json     | 22 → 23 → 24    | reader-3-2.json → reader-4-2.json       |
| c-1 / after_event_dedup | writer-6-8.json → -9.json → -10.json    | 57 → 58 → 59    | reader-7-2.json → reader-8-2.json       |
| c-2 / after_assertions  | writer-10-9.json → -10.json → -11.json  | 93 → 94 → 95    | reader-11-2.json → reader-12-2.json     |
| c-3 / after_entities    | writer-14-10.json → -11.json → -12.json | 130 → 131 → 132 | reader-15-2.json → reader-16-2.json     |
| c-4 / after_corrections | writer-18-11.json → -12.json → -13.json | 168 → 169 → 170 | reader-19-2.json → reader-20-2.json     |
| c-5 / after_conclusions | writer-22-12.json → -13.json → -14.json | 207 → 208 → 209 | reader-23-2.json → reader-24-2.json     |
| c-6 / after_snapshot    | writer-26-13.json → -14.json → -15.json | 247 → 248 → 249 | reader-27-2.json → reader-28-2.json     |
| c-7 / after_checkpoint  | writer-30-14.json → -15.json → -16.json | 288 → 289 → 290 | reader-31-2.json → reader-32-2.json     |
| c-8 / after_head        | writer-34-15.json → -16.json → -17.json | 330 → 331 → 332 | reader-35-2.json → reader-36-2.json     |
| c-9 / before_commit     | writer-38-16.json → -17.json → -18.json | 373 → 374 → 375 | reader-39-2.json → reader-40-2.json     |

Every failure leaves head1 and the complete old Event/Assertion/entity/Correction/conclusion/dedup/Snapshot/watermark/checkpoint cut. Every failure unit has zero COMMIT, publication, ACK intent and external ACK sink. SQL errors leave the transaction active until explicit rollback; no automatic rollback on exception is assumed. `after_begin` is after capability/base guards; documented aliases do not extend this sweep to bootstrap, fencing or future Engine outputs.

Separate `c-success` is a positive control, **not a retry**: `C/raw/reader-43-2.json` (order400) and `reader-44-2.json` (420) show old/pre-COMMIT cuts; `reader-45-2.json` (433) shows the complete new cut. Actual COMMIT/publication/ACK intent occur at426/427/428, with parent sink430.

## 3. Verified Invariants

The audit supports these invariants **within the executed fixture, write paths and scheduled timings**:

1. Same-physical-Project write serialization prevents B1 fencing while A's write transaction remains open. After the controlled old rollback, B2 can fence and commit legally.
2. After epoch2 persistence, transactional reads of current epoch/token reject both old capabilities. Matching epoch/token does not bypass a separate stale-base conflict. Each rejection explicitly ends its transaction without persisted side effects.
3. Every declared pre-COMMIT business barrier has a real failure/settlement/independent Reader chain. Event, Assertions, history, dedup, generated Snapshot/watermark, checkpoint and head revert as one complete cut.
4. Independent Readers see complete committed cuts. A's pinned Reader retains the old snapshot while a fresh Reader observes the complete new cut. No audited Reader observes a partially committed bundle.
5. Failure paths produce no confirmed publication or fixture ACK; successful controls place COMMIT before publication and the independent ACK sink. These are fixture boundaries, not real Agent transport guarantees.
6. Persisted agent completion remains `agent_reported`; trusted Correction/history images remain distinct. This demonstrates persistence of the supplied data, not Correction/Resolution/Plan/Timeline Engine behavior or independent verification of implementation success.

The B+C+A direction remains conditional: Project DB fencing protects compliant writes in the same physical transaction/coordination domain; Owner DB coordinates lifecycle and normal handoff. These two files have **no cross-file atomic COMMIT guarantee**. This experiment does not convert conditional transaction reasoning into an unconditional Owner safety proof.

## 4. Coverage and Limitations

Embedded **D** comprises 36 runtime SQL cuts from 35 independent Reader children; only A's pinned Reader supplies two cuts on its held connection. Embedded **E** covers actual SQLITE_BUSY, two capability mismatches, one base conflict, ten real constraint failures, explicit transaction termination and prohibition of publication/ACK on those failures. It does not cover every fault mode, real rollback failure or unknown COMMIT reconciliation. Audit §§D/E contain complete SQL-body comparisons; row counts alone are not the oracle.

| Limitation                                                                                                                                                                   | Narrow Spike closure impact                                                                                                                                                                                                                                              | Full production acceptance impact / existing Gate                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L1 — Original CMD command text: UNVERIFIED.** Captures archive result JSON and exit values, not typed invocation/full transcript. Chat supplies auxiliary provenance only. | **Does not block this bounded recommendation.** RunId/manifest/scenario/receipts and separately archived exit records support executed protocol/results; no claim of original command-text verification is made. Do not reconstruct a historical transcript as evidence. | This gap supplies no proof of production invocation/support conditions. Preserve it and require contemporaneous command/identity/exit capture for subsequent acceptance under protocol §1/§7 and O02; no retroactive edit or rerun solely to manufacture the missing historical record.              |
| **L2 — No post-hoc SQL reopening.** Original independent Reader records were audited; retained databases were inspected only as bytes/hashes/headers.                        | **Does not block.** Runtime independent full-cut records meet the bounded SQL-oracle obligation. Do not claim an audit-time integrity_check or reconstruction from retained pages.                                                                                       | It does not itself invalidate runtime results or create a mandatory post-hoc query requirement. Actual new-process restore/replay remains **NOT TESTED** under S01/S03–S05/S10–S12 and M01–M04; this review is not that verification.                                                                |
| **L3 — Stable sourceEventId subset only.** Missing identity, shared/multi-event Cursor, late unordered sources and conflicting identity claims were not exercised.           | **Does not block within the expressly restricted SRC-A/K1 and synthetic complete UNIT-1 subset.** No exactly-once/general Cursor claim.                                                                                                                                  | **BLOCKER for the affected broader implementation/acceptance.** Resolve ARCHITECTURE §9/Core identity wording before affected work; verify S06–S09, P02 and complete unit/cursor coverage.                                                                                                           |
| **L4 — True COMMIT I/O uncertainty and fresh-connection nonce/receipt reconciliation: NOT TESTED.** Ordinary constraint rollback is not uncertain COMMIT.                    | **Does not block this pre-COMMIT/known-success scope.** Unknown-outcome recovery is excluded and still pending.                                                                                                                                                          | **Production BLOCKER:** Support Contract F11 and design §8 require suspect-transaction settlement before healthy new-connection reconciliation, no blind replay/publication/ACK. Map S04/S05/S12, M04, P05 and O01-c/d.                                                                              |
| **L5 — Hidden loss, successful file replacement and external Guard–COMMIT race: NOT GUARANTEED.**                                                                            | **Does not block the scheduled same-resource experiment.** No instantaneous revocation or external race guarantee is claimed.                                                                                                                                            | **Production P0 remains.** O01-d/f/h, O02, P03/P07/P08 and M04 require approved identity/lifetime/fault boundaries and actual containment evidence. If required guarantees cannot be reasonably bounded, retain the architectural blocker; calling a fault unsupported does not prove it impossible. |
| **L6 — Production Storage/Extension Host, full crash recovery and cross-platform: NOT TESTED.** No crash, power loss, real Host or platform expansion was executed here.     | **Does not block ordinary Node Windows disposable closure.** Environment and failure exclusions remain explicit.                                                                                                                                                         | **Blocks claims of production readiness.** Required O01/O02 and full S01–S13/P01–P08/M01–M04 remain pending. Any unsupported platform requires an explicit support decision, not a fabricated PASS.                                                                                                  |

Additional exclusions remain disclosed in audit §H: bootstrap/control/maintenance writes, changed duplicate claims, real source consumption/resume, migration/deletion/retention atomicity and actual release/rollback errors. No executed unit is missing a declared barrier; excluded production work is not silently counted as an experimental pass.

## 5. Evidence Integrity

This review **reuses the completed independent audit**, rather than rerunning its forensic work or executing SQL. It checks the audit's citations and arithmetic, rereads the three manifests/exit files, and recomputes the inventory-file hashes. No material inconsistency in the report's bounded coverage was found.

| Case | Retained inventory.json SHA256                                     |
| ---- | ------------------------------------------------------------------ |
| A    | `67ab235098d8b246e0750a435d734f4ed9dbbc889f4504cfb9545555e8536d59` |
| B    | `c2119b792807cd6bb855b1c917cc35969187fa595852856c99537e418dfd67ee` |
| C    | `70c058e2b232458c40b79550f1e00b7e62fbefada9f23aa81eca58509c97f02e` |

Audit §F supports **1,194/1,194 indexed file matches**, 32 matched Core/Harness source hashes per manifest, the native hash above, and matching byte/header evidence for 26 retained SQLite files. The inventory intentionally excludes itself and derived-result; their hashes are recorded separately in that audit. Hash consistency is not a cryptographic signature or proof against malicious same-user changes.

Audit §§A–F establish **36 SQL Reader cuts**, all **152 commands** with matched terminal receipts, continuous nonce/PID/RunId-bound Worker sequences, and **64 expected normal child exits** (code0, signal null). The 128 stdout/stderr files are empty; no incomplete command, timeout, anomalous cleanup or unclosed owned child is recorded. This is owned-child lifecycle evidence, not a new global process survey or proof of kernel lock release.

Causality uses barriers, individual receipt sequences, monotonic times and complete parentOrder domains A1–122/B1–92/C1–440. Cross-process wall clocks alone do not establish the ordering.

Audit §G binds CMD/A.txt, B.txt and C.txt to the three RunIds, with each independent `*-exit-code.txt` containing **EXPERIMENT_EXIT_CODE=0**. Top-level CLI exit verification is **PASS, recorded value 0 for A/B/C**. Worker exit0 is separate evidence. Historical derived-result CLI fields remain **UNVERIFIED as originally written**; original command text remains **UNVERIFIED (L1)**. None of these files is repaired or overwritten.

The README's dated preparation-stage NOT TESTED statement describes its earlier state. The later audit and this review provide a dated experimental evidence layer; neither rewrites that preparation record nor upgrades the current production acceptance plan.

## 6. Production Acceptance Boundaries

**Disposable Experimental Coverage = Partial Coverage. Production S02/S13 = NOT TESTED.**

| Existing clause     | Supported experimental subconditions                                                                                                                                                                                    | Remaining full production obligation                                                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S02                 | All ten declared business barriers; actual constraint failures, explicit rollback, complete-cut Reader comparisons, no new operation/input/Assertion/history/Snapshot/checkpoint/head or ACK; separate positive control | Implemented production transaction boundaries and every applicable reviewed write path, including control/bootstrap/maintenance where applicable; other fault classes and complete contract integration             |
| S13                 | A same-Project old-write/new-fence contention, bounded BUSY and controlled handoff; pinned/fresh full-cut visibility; B persisted epoch guard and separate expected-base conflict                                       | Complete two-actual-business-candidate same-base defensive race with one commit/one conflict, no lost update, actual production WAL/BUSY and Host paths. A/B do not establish that full race or production election |
| S01/S03–S05/S10–S12 | Fixture state/history conservation and known committed/rolled-back cuts provide inputs for future recovery tests                                                                                                        | Actual owned crashes, new-process complete recovery/replay, unknown-outcome settlement and receipt reconciliation, corrupt/missing authority handling                                                               |
| S06–S09             | One stable source identity and one synthetic complete unit, with distinct internal EventId/checkpoint concepts                                                                                                          | Identity conflicts/alias claims, missing IDs, multi-event Cursor, gaps/prior position, late input and checkpoint-only cases                                                                                         |
| O01/O02, P/M        | Synthetic binding and ordinary Node/native environment recorded                                                                                                                                                         | Approved production binding/lifetime/support plus privacy, quota, retention, deletion, migration, backups and actual fault/Host acceptance                                                                          |

The normalized-event sourceEventId/Cursor conflict remains unresolved in the current specifications. The experiment's stable subset neither accepts the disputed wording nor changes Core identity/acceptedEvents. Stop affected implementation pending explicit normative disposition, in accordance with AGENTS.md. This review does not edit ARCHITECTURE §9 or the acceptance status.

## 7. Remaining Production Blockers

These are existing production gates, **not additional conditions invented to keep the narrow experiment open**:

| Pending matter                                                      | Required disposition / existing acceptance                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source identity/cursor normative conflict                           | Minimum explicitly approved specification correction before affected implementation; S06–S09 and P02                                                                                                                                                                          |
| Logical/physical identity and shared journal/open/lifetime boundary | Convergent Project binding, safe resource admission and all-path transactional enforcement; O01-a/f/g/h, O02, P02/P03/P07/P08, M01/M04                                                                                                                                        |
| Hidden-loss/final-race and real release containment                 | Approve a reasonable bounded failure model; establish required containment rather than infer guarantees from fixtures. Genuine Driver/API and OS/VFS release failure remain NOT TESTED; stronger unachievable guarantees remain architectural blockers. O01-b/d/g/h, O02, M04 |
| Unknown COMMIT and truthful recovery/publication                    | Settle the old transaction before absence-based conclusions; healthy same-resource fresh-connection intent/receipt/control-nonce reconciliation; no old token revival or stale-head publication. S01/S03–S05/S10–S12, P05/P08, M01–M04, O01-c/O02                             |
| Privacy/retention/runtime approvals and integrated evidence         | D-041–D-044 remain Proposed. Actual safe admission/diagnostics, quota/deletion/retention/migration and approved production Host/support must satisfy the existing P/M/O gates; compatibility or either Spike closure cannot accept them                                       |

No experimental result permits discarding authority, advancing Cursor without complete durable coverage, fabricating unavailable state, or using PID/heartbeat/timeout to regain writing rights. The atomic Event/Assertions/history/dedup/Snapshot/Cursor contract is retained.

## 8. Formal Closure Recommendation

**Final review verdict: PASS WITH LIMITATION. Formal disposition: CLOSED — PASS WITH LIMITATION under the closure authorization recorded above.**

The declared A/B/C requirements have actual causal execution and independent full-cut SQL evidence. Both B capability rejections and its distinct base rejection settled without effects; all ten C barriers were reached and rolled back; D/E were observed in those same runs. The audit records complete identity/inventory/lifecycle evidence and independently captured CLI0. No protocol invariant violation or missing required checkpoint within this executed scope was found.

L1/L2 limit what the audit can claim; L3–L6 exclude broader identity, recovery, safety and integration properties. They do not negate the observed, expressly bounded invariants and therefore do not require expansion or repetition merely to close this Spike. They remain disclosed and cannot satisfy the corresponding production gates. An unconditional PASS would overstate the result.

**Formal closure is limited to the scope reviewed here.** The user's current authorization reports ChatGPT's approval and instructs recording that decision; it is the approval provenance for this update, not a newly performed experiment or independent retrieval of a separate ChatGPT transcript. A/B/C, embedded D/E and L1–L6 retain their original scope and limitations. Full Phase 2 and production S02/S13 remain pending, with D-041–D-044 Proposed unless separately decided.

## 9. Next Phase 2.3 Priority

The proposed sequence is reasonable with the following boundaries:

1. **Resolve the sourceEventId/Cursor specification conflict minimally**, with explicit approval and unchanged internal identity/provenance principles. Do not expand the next experiment around ambiguous normative wording.
2. **Prepare true unknown-COMMIT settlement and fresh-connection reconciliation verification**, using Support Contract F11/design §8 and existing S05/M04/P05. Distinguish controlled result-loss injection from actual Driver/API/I/O evidence; an unresolved old transaction makes absence inconclusive. Do not invent fencing history when the current control nonce has been superseded.
3. **Prepare actual owned crash/restart and complete recovery verification** under S01/S03/S04/S10–S12, including exact provenance/Correction/acceptedEvents and Snapshot/Cursor boundaries. Known COMMIT-before-ACK is distinct from unknown COMMIT; no empty or old successful fallback.
4. **Complete Privacy Allowlist/Retention and production Host/support gates** before production acceptance. Their detailed validation may follow synthetic recovery experiments, but safe admission/diagnostics and isolated synthetic resources are prerequisites throughout; privacy protection must not wait until real sensitive input is introduced.

Identity/open/lifetime and unresolved failure-model architecture gates remain parallel prerequisites before production implementation, not automatically solved by this ordering. No next experiment, implementation, support expansion, specification change, Decision acceptance or Git operation is authorized by this recommendation.
