# Template reference

The canonical machine-readable registry is
[`references/templates.json`](../references/templates.json). This page is a reader
guide; add or remove a target in the registry first.

## Application templates

| ID | Kind | Runtime stack | Product role | Additional toolchain |
| --- | --- | --- | --- | --- |
| `web` | frontend | React 19, TypeScript, Vite | Browser application with owned UI library, i18n, accessibility, screenshots, and Playwright. | Chromium |
| `api-node` | backend | Fastify, TypeScript, Drizzle, PostgreSQL | Service seed with a route registry, locked OpenAPI, migrations, problem catalogue, and Pino logging. | PostgreSQL/Docker for native tiers |
| `api-python` | backend | Python 3.12, FastAPI, Pydantic, SQLAlchemy | Python service with `uv` lock, Alembic, import boundaries, and mutation tests. | `uv`; PostgreSQL/Docker for native tiers |
| `api-java` | backend | Java 21, Spring Boot 3.5 | JVM service with Gradle lock, ArchUnit, Flyway/JPA, JaCoCo, and PIT. | JDK 21; PostgreSQL/Docker for native tiers |
| `api-kotlin` | backend | JDK 21, Kotlin 2.2, Ktor 3.2 | Kotlin service with explicit API mode, Exposed/Flyway, Detekt, JaCoCo, and mutation tests. | JDK 21; PostgreSQL/Docker for native tiers |
| `api-dotnet` | backend | .NET 10, ASP.NET Core, EF Core | C# service with locked restore, architecture tests, migrations, coverage, and Stryker. | .NET SDK 10.0.301; PostgreSQL/Docker for native tiers |
| `desktop-tauri` | desktop | Web application plus Tauri 2 | Thin system-WebView shell with deny-by-default capabilities and packaged installers. | Rust/Cargo and OS shell libraries |
| `desktop-electron` | desktop | Web application plus Electron 43 | Bundled-Chromium shell with an isolated renderer and packaged installers. | Platform packaging tools |

Every application template uses Node 22 and pnpm 10.11.0 for orchestration, even when
the product runtime is Python, Java, Kotlin, C#, or Rust.

## Composition templates

| ID | Purpose | Important boundary |
| --- | --- | --- |
| `workspace` | Holds the shared brief identity and orchestrates separately versioned parts. | Part directories are Git-ignored because each part owns its own repository. |
| `e2e` | Holds cross-application Playwright flow and contract cases. | Its live suite runs against the composed pair in workspace CI, not inside its static `verify` chain. |

## Common generated-repository contract

All registered templates must contain:

- a `package.json` with a `verify` script;
- `scripts/gates-selftest.mjs`;
- `.proto-forge/config.json`, schema, seed lock, and snapshot;
- `docs/adr/`;
- a package-specific `README.md`, `AGENTS.md`, status page, and troubleshooting guide;
- a committed lockfile and a pinned Node version.

`manifest:lint` checks this shape. `template-integrity` executes each template's own
snapshot gate. `verify-template` proves a copied template in a scratch directory.

## Backend architecture profiles

All five backend templates support the same three logical profiles:

| Profile | Derivation | Dependency intent |
| --- | --- | --- |
| Layered | Fewer than 8 entities, fewer than 2 graph components, fewer than 3 external systems, and no broker. | Controllers call services; services call repositories. |
| Modular monolith | At least 8 entities or at least 2 connected components. | Modules follow entity-graph components and expose controlled boundaries. |
| Hexagonal | At least 3 external systems or broker messaging. | Application and domain depend on ports; inbound and outbound adapters remain isolated. |

The language-specific package layout and enforcement mechanism are documented in
each backend template's `docs/ARCHITECTURE.md`.

## Template-specific documentation

Use the selected template's files after generation:

- `README.md`: local run and directory layout;
- `AGENTS.md`: mandatory editing rules and command table;
- `docs/ARCHITECTURE.md`: runtime/module boundaries;
- `docs/SECURITY.md`: implemented controls and scanner limits;
- `docs/DEPLOYMENT.md` or `docs/DELIVERY.md`: service/web deployment or desktop packaging;
- `docs/STATUS.md`: generated metrics from the last represented verification run;
- `docs/TROUBLESHOOTING.md`: template-specific diagnostics.

## Capability staging

Cross-template parity is intentional for core architecture, security, delivery, and
quality machinery, but not every later feature has landed in every backend. In
v0.9.0, the served contract explorer and pagination rule are scoped to `api-node`;
the requirements register explicitly stages the remaining stacks. Do not infer a
capability from another template's documentation. See
[Known limitations](KNOWN_LIMITATIONS.md).

