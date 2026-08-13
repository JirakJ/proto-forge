# Security

The service is treated as internet-facing from commit one. Controls are enforced by gates (`pnpm sec:scan`, `pnpm log:scan`, ArchUnit + arch:verify) and by the byte-pinned platform kernel, not reviewer memory (BRS §16).

## Application controls

- **Input validation** — every external input crosses a validated boundary: the create payload against the domain's jakarta-validation constraints inside the service, path parameters by type conversion before any handler runs, the environment through `application.properties` → `app.config.AppProperties`. An unvalidated field never reaches a handler.
- **Error responses leak nothing** — every client-visible failure is a registered RFC 9457 problem type (`app.platform.Problems`); an unexpected throw is mapped to the generic `internal` problem by the kernel's `ProblemHandler`, and the cause goes to the structured log, never the response.
- **Security headers** — the kernel's servlet filter sets them on every reply (`app.platform.SecurityHeadersFilter`): `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Cache-Control: no-store`, and a `default-src 'none'` Content-Security-Policy for the JSON API. TLS termination and HSTS belong to the deployment edge — no local server speaks TLS.
- **Structured, redacting logging only** (NFR-12) — production code logs through the kernel's `AppLogger` (SLF4J behind a redacting key/value renderer); `log:scan` fails a bare `System.out`/`System.err`, a `printStackTrace`, an `org.slf4j` import outside `app.platform`, and any log-call key named like PII (`password`, `token`, `authorization`, …).
- **Secrets** — none in the repo. Config via environment + `application.properties` placeholders; `gitleaks` scans the whole tree including `.prompts/`.
- **SQL** — all persistence goes through Spring Data JPA's parameterised queries in `app.adapter.out.persistence`; no string-built SQL outside `src/main/resources/db/migration/`.

## Supply chain (BRS §4.2)

- Two lockfiles committed and enforced (NFR-08/NFR-11): `gradle.lockfile` (dependencyLocking over every configuration; a resolution the lock does not name fails) behind the **checksum-pinned Gradle wrapper** (`distributionSha256Sum` in `gradle/wrapper/gradle-wrapper.properties`), and `pnpm-lock.yaml` (`--frozen-lockfile` in CI) for the gate corpus.
- **Dependency budget** (NFR-13): `deps:budget` holds the declared runtime surface to a named allowlist (the six ADR 001 coordinates) under a ceiling of 10.
- **osv-flagged transitive pins** (`build.gradle.kts`, each annotated with its advisory id): postgresql ≥ 42.7.12 (HIGH GHSA-j92g-9f8w-j867), jackson-databind ≥ 2.22.1 (moderate deep-nesting batch), commons-compress ≥ 1.26.0 and commons-lang3 ≥ 3.18.0 (moderate; test/tool classpaths — the lockfile is scanned whole), log4j-api ≥ 2.25.5 (MODERATE GHSA-qv9r-c865-cp47, arriving only through Boot's log4j-to-slf4j bridge — pinned anyway, because an advisory a scanner can see is one a reviewer has to answer for). BOM-managed artifacts move via version-property overrides, the rest via constraints; drop a pin once the managing BOM catches up.
- **Audit**: `sec:scan` builds a deterministic CycloneDX 1.5 SBOM from `gradle.lockfile`'s runtimeClasspath (`pnpm sbom` → `.proto-forge/sbom.cdx.json`, purl-sorted, no timestamp) and runs osv-scanner over it — findings are a hard stop, never auto-suppressed. gitleaks and osv-scanner are external binaries: enforced when present, warned locally when absent, mandatory in CI (the §19 gitleaks precedent).
- **Seed integrity (BRS §17.2)**: `.proto-forge/seed.lock` pins the platform kernel (`src/main/java/app/platform/**`) and the gate corpus (`scripts/**`) by one sha256; `snapshot:diff` re-verifies it every run. Upgrades are explicit (`pnpm seed:lock` + ADR), and a local hook blocks kernel edits before they land.
