# ADR 001: Technology stack

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The prototype must be a production-grade service slice: typed end to end, testable against a real database engine, contract-first at the boundary, and buildable with a pinned, reproducible toolchain (NFR-08, NFR-11). The gate corpus is Node everywhere (BRS §18), so node+pnpm are prerequisites regardless of stack.

## Decision

.NET 10, C#, **SDK pinned in `global.json`** (10.0.301, `rollForward: latestFeature`) — the band the runner and the workstation both compile with, named in exactly one file. One solution, `proto-forge-service.slnx`, over two projects: `src/App/App.csproj` (the web SDK) and `tests/App.Tests/App.Tests.csproj`. The compiler contract they share lives in `Directory.Build.props`: `net10.0`, nullable reference types on, implicit usings on, `TreatWarningsAsErrors` (the C# analogue of the web template's strict tsconfig — `lint` and `typecheck` are both the compiler), `InvariantGlobalization`, and `RestorePackagesWithLockFile`. **NuGet dependency locking** is the reproducibility half: `src/App/packages.lock.json` and `tests/App.Tests/packages.lock.json` pin every resolved coordinate, and CI plus the image build restore with `--locked-mode`, so a resolution the lock does not name is a failure, not an update.

ASP.NET Core **minimal API** as the HTTP runtime — it rides the shared framework reference, not a package. `System.ComponentModel.DataAnnotations` constraints are the domain schema (the annotations ARE the model, BRS §12.2); EF Core 10 over Npgsql is persistence, with append-only C# migrations; `Microsoft.Extensions.Logging` sits behind the kernel's redacting `AppLogger`. xUnit with coverlet for coverage, Stryker.NET for mutation testing, ArchUnitNET for the compiled-assembly half of the architecture profile, `WebApplicationFactory<Program>` (Microsoft.AspNetCore.Mvc.Testing) for the in-memory slices, Testcontainers-Postgres for the real-database tier, and the application's own `--emit-openapi` console mode for contract emission — no documentation engine in the production surface. Exactly **one declared runtime dependency** — Npgsql.EntityFrameworkCore.PostgreSQL — forms the allowlist ADR 007 pins; EF's Design package is `PrivateAssets="all"` and never ships. Local tooling is pinned per repository in `.config/dotnet-tools.json` (dotnet-ef, dotnet-stryker, both `rollForward: false`). Advisory-flagged transitives are lifted above their patched floors by a direct `PackageReference` annotated with the advisory id (SSH.NET above GHSA-q939-rpr3-3284, carried in by Testcontainers) — the pnpm-workspace overrides convention, restated. Node 22 + pnpm (pinned via `.nvmrc`/`engines`/`packageManager`, committed `pnpm-lock.yaml`) carry the gate corpus; the npm packages are the three dev tools the gates shell out to or import (husky, jscpd, yaml) — the `.mjs` corpus declares no runtime dependency at all.

## Consequences

Two lockfile families are the reproducibility contract: `packages.lock.json` for the service, `pnpm-lock.yaml` for the gate corpus, with `global.json` pinning the compiler above both. Strong typing from route registry to database row, and warnings-as-errors plus nullable make the compiler itself the lint and typecheck gates rather than a second tool with a second opinion. The declared dependency surface is small enough to audit by reading, and `deps:budget` keeps it that way. The .NET SDK, node and pnpm are prerequisites of the environment.

## Alternatives considered

MVC controllers with attribute routing (a second place a path can live; minimal-API delegates keyed by operationId keep the registry the only one — ADR 008), central package management without lock files (`Directory.Packages.props` centralises the numbers but versions still resolve fresh; the committed lock is what makes a restore reproducible), `EnsureCreated`/model-driven schema creation (implicit sync — the exact anti-pattern BR-24 bans), Dapper with hand-written SQL (loses the typed model the migrations are checked against), a floating SDK band with no `global.json` (the compiler becomes whatever the machine last installed).
