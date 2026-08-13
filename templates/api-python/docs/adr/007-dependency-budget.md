# ADR 007: The dependency budget is a ceiling with a name on it

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The web template budgets what it ships to a browser. A service ships nothing to a browser, but its analogue of bundle weight is dependency surface: every runtime dependency is supply-chain risk, audit surface and upgrade debt. Latency budgets are environment noise; dependency count is deterministic (NFR-13).

## Decision

`deps:budget` enforces two things over `pyproject.toml` `[project] dependencies`:

1. a **count ceiling of 10** — the template ships 7, leaving headroom for a brief's real needs without ever letting `uv add` become the path of least resistance;
2. a **named allowlist** — alembic, fastapi, psycopg, pydantic, sqlalchemy, structlog, uvicorn (the ADR 001 stack). A dependency outside the list fails with instructions: a new runtime dependency is an ADR, and the ADR's diff includes the allowlist edit in the gate itself.

Exceeding the ceiling is remediated by removing weight, never by raising the number; a genuine budget change is an ADR. `consistency` adds the corollary: a dependency nothing imports (a database driver named by the SQLAlchemy dialect counts as imported) is dead runtime weight and fails. The dev group is out of scope — it never reaches production and is wired through configs where usage has no cheap mechanical answer.

## Consequences

The dependency review happens at the moment of addition, in a diff that names the decision, instead of at the yearly audit. The cost is friction when a library would genuinely help — which is the mechanism working.

## Alternatives considered

Installed-size ceilings (install-dependent and platform-dependent, so nondeterministic across machines), no allowlist with count only (ten left-pads pass), auditing at release time (too late — the dependency is load-bearing by then).
