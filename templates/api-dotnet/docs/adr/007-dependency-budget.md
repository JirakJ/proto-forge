# ADR 007: The dependency budget is a ceiling with a name on it

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The web template budgets what it ships to a browser. A service ships nothing to a browser, but its analogue of bundle weight is dependency surface: every runtime dependency is supply-chain risk, audit surface and upgrade debt. Latency budgets are environment noise; dependency count is deterministic (NFR-13).

## Decision

`deps:budget` enforces two things over the `<PackageReference>` declarations in `src/App/App.csproj` that are not marked `PrivateAssets="all"`:

1. a **count ceiling of 10** — the template ships 1, leaving headroom for a brief's real needs (an auth package, a queue client, an external SDK) without ever letting "add a dependency" become the path of least resistance;
2. a **named allowlist** — Npgsql.EntityFrameworkCore.PostgreSQL (the ADR 001 stack). A dependency outside the list fails with instructions: a new runtime dependency is an ADR, and the ADR's diff includes the allowlist edit in the gate itself.

Declared references are the unit on purpose: ASP.NET Core itself rides the shared framework reference rather than a package, one provider package is one reviewed decision, and its transitive tree — EF Core, Npgsql and everything under them — is pinned in `packages.lock.json` and audited by `sec:scan` (osv-scanner over the SBOM built from that lock). Build- and design-time references are out of scope by the same rule that makes them safe: `PrivateAssets="all"` means they never reach production, which is exactly why EF's Design package is declared that way, and test-project references never ship at all. Exceeding the ceiling is remediated by removing weight, never by raising the number; a genuine budget change is an ADR. `consistency` adds the node-side corollary: the gate corpus declares no npm runtime dependencies, so any `package.json` `dependencies` entry no gate script imports fails as dead weight.

## Consequences

The dependency review happens at the moment of addition, in a diff that names the decision, instead of at the yearly audit. The cost is friction when a library would genuinely help — which is the mechanism working.

## Alternatives considered

Counting the resolved transitive graph (the shared framework and one provider make the number stable but enormous and meaningless as a decision unit; the lock plus the audit cover it), installed-size ceilings (platform-dependent, nondeterministic), no allowlist with count only (ten string-formatting helpers pass), auditing at release time (too late — the dependency is load-bearing by then).
