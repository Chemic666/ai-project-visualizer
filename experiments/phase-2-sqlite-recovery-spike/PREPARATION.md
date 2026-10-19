# Recovery / Unknown COMMIT Harness Preparation Plan

> For agentic workers: use superpowers:executing-plans for this authorized inline preparation. No commit, real SQLite experiment or experiment Worker invocation is authorized.

Goal: prepare a disposable stable-source recovery harness and auditable failure evidence without executing it.

Architecture: use independent copies of the closed Atomicity fixture and SQL staging code. Separate Worker lifecycle, authoritative SQL recovery/oracle, reconciliation policy, scheduling, and offline evidence audit. The supplied user task is the controlling spec; README records the final contract.

Tech stack: installed Node 24, better-sqlite3 13.0.3 for later execution only; installed TypeScript/esbuild for fixture validation; node:test for pure tests.

Global constraints: Core API unchanged; production Storage forbidden; D-041–D-044 Proposed; S/P/M NOT TESTED; old Harness/evidence immutable; no add/commit/push; no automatic rerun, cleanup or evidence overwrite.

Review focus: unsettled transaction plus absent receipt; mismatched historical execution nonce versus a legitimately newer owner epoch; intact Snapshot with missing authority; premature ACK/publication; import/default CLI accidentally loading SQLite or starting experiment Workers.

- [ ] Task 1: preserve baseline; minimally synchronize only resolved identity blocker history in three Storage documents. No acceptance or Architecture edits.
- [ ] Task 2: write failing pure tests for authoritative cut validation, settlement-dependent reconciliation, changed claim rejection, CLI gate and confined evidence paths. Implement oracle.cjs, policy.cjs, safety.cjs and fixture examples. Prove red then green without Driver/Worker/database.
- [ ] Task 3: prepare sql.cjs, worker.cjs, actors.cjs and scenarios.cjs for U1/U2/U4/R1/R2/R3. Preserve original SQL staging as reference-db.cjs. U3 remains a documented evidence plan with no executable selector. Syntax/static checks only for Worker/SQLite paths.
- [ ] Task 4: prepare runner.cjs, run.cmd, inventory and independent audit.cjs. Test default/import/list, raw receipt bindings and inventory tampering with pure data; do not execute a real case.
- [ ] Task 5: record exact Acceptance mapping and identity coverage matrix; run pure suite, type/static/document checks, review with a fresh reviewer; verify repository file hashes and write the bounded result into the existing checkout. Stop for ChatGPT review.

Rulings: work in an isolated staging copy under the chat workspace, then copy only the three reviewed documents and the new experiment directory into the existing checkout. This preserves uncommitted phase work and needs no branch/worktree or dependency installation. The supplied explicit preparation authorization controls over generic skill approval/commit defaults.
