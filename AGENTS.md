# AI Project Visualizer — Agent Rules

## Mission

AI Project Visualizer makes AI black-box development transparent.

Primary question:

> Where is the project right now?

## Core Rules

- Observer, not orchestrator.
- Local-first and privacy-first.
- Codex-first, not Codex-only.
- Core must not depend on Codex.
- Core must not depend on VS Code.
- Do not mix confirmed and estimated progress.
- Preserve provenance and user corrections.
- Do not expand scope without explicit approval.

## Architecture

Follow `ARCHITECTURE.md` for architecture work.

## Product

Use `PRODUCT.md` when making product or UX decisions.

## Roadmap

Follow `ROADMAP.md` for implementation order.
Do not skip phases without an explicit reason.

## Decisions

Consult `DECISIONS.md` before changing an accepted architectural or product decision.

## Documentation conflicts

已批准的规范发生冲突时，停止相关实现，报告冲突文档、具体要求及影响，并等待用户决定。不得静默覆盖、选择性忽略或自行改写已批准规范。

## UX

Consult `docs/UX.md` when changing user-facing behavior.

## Acceptance

Use `docs/acceptance/v0.1.md` when validating v0.1 functionality.

## Technology

Follow `docs/TECH_STACK.md` for stack and dependency decisions.

## Scope discipline

When discovering an unrelated improvement:

1. Record it.
2. Classify it as blocker / roadmap candidate / future idea.
3. Do not implement it unless required by the active phase.


## Delivery reporting and Git authorization

User instruction, 2026-11-09:

- Every task-completion report uses **V1.0** as the project-progress target. Include a clearly labelled engineering estimate/range, the remaining major work and what this task advanced. Do not switch between V0.1 and V1.0 or increase a percentage merely because tests/commits grew. This delivery estimate is separate from Core's Confirmed Project Progress.
- The user has authorized stage-by-stage **commit and push to this project's existing GitHub remote** after the related implementation and required verification pass. This authorization includes the currently completed continuous work and persists until revoked. Do not ask again for ordinary commits/pushes.
- Inspect the actual diff, staged files, author, branch/upstream and fresh remote state; exclude unrelated work, private data, credentials, raw runtime evidence and temporary artifacts. Preserve unverified/blocked gates in the source and release descriptions. Follow existing branch rules and verify the resulting remote commit.
- This authorization does not change the existing limits on force-push/history rewriting, merges, tags/Releases, security policy, real Session intake or destructive cleanup.
