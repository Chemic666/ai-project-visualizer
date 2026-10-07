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
