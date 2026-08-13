# ADR 001: Technology stack

- Status: accepted
- Date: 2026-08-12
- Prompt-log: .prompts/0001-scaffold.md

## Context

The prototype must be a production-grade service slice: typed end to end, testable against a real database engine, contract-first at the boundary, and buildable with a pinned, reproducible toolchain (NFR-08, NFR-11). The gate corpus is Node everywhere (BRS §18), so the runtime the gates need is a prerequisite regardless of stack.

## Decision

Node 22 (pinned via `.nvmrc`/`engines`) with TypeScript 5.9 strict on NodeNext modules. Fastify 5 as the HTTP runtime, zod 4 for every boundary schema (the schema IS the model, BRS §12.2), drizzle-orm + pg for persistence against Postgres, pino for structured logging. Vitest 3 with v8 coverage for tests, Stryker for mutation testing, PGlite as the in-process real-engine for persistence tests (BRS §15). pnpm with a committed lockfile; CI installs `--frozen-lockfile`. Exactly these five runtime dependencies — drizzle-orm, fastify, pg, pino, zod — form the allowlist ADR 007 pins.

## Consequences

One lockfile is the reproducibility contract. Strong typing from route schema to database row. The dependency surface is small enough to audit by reading, and `deps:budget` keeps it that way. Node/pnpm are prerequisites of the environment.

## Alternatives considered

Express (no schema-first routing, weaker TS story), NestJS (a framework runtime the dependency budget rejects), Prisma (heavier runtime + generator step vs drizzle's plain TS), Jest (slower than Vitest, worse ESM story).
