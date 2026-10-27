# Security

The service is treated as internet-facing from commit one. Controls are enforced by gates (`pnpm sec:scan`, `pnpm log:scan`, ArchUnit + arch:verify) and by the byte-pinned platform kernel, not reviewer memory (BRS §16).

## Application controls

- **Input validation** — every external input crosses a validated boundary: the create payload against the domain's jakarta-validation constraints inside the service, path parameters by type conversion before any handler runs, the environment through `application.properties` → `app.config.AppProperties`. An unvalidated field never reaches a handler.
- **Error responses leak nothing** — every client-visible failure is a registered RFC 9457 problem type (`app.platform.Problems`); an unexpected throw is mapped to the generic `internal` problem by the kernel's `ProblemHandler`, and the cause goes to the structured log, never the response.
- **Security headers** — the kernel's servlet filter sets them on every reply (`app.platform.SecurityHeadersFilter`): `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Cache-Control: no-store`, and a `default-src 'none'` Content-Security-Policy for the JSON API. TLS termination and HSTS belong to the deployment edge — no local server speaks TLS.
- **Structured, redacting logging only** (NFR-12) — production code logs through the kernel's `AppLogger` (SLF4J behind a redacting key/value renderer); `log:scan` fails a bare `System.out`/`System.err`, a `printStackTrace`, an `org.slf4j` import outside `app.platform`, and any log-call key named like PII (`password`, `token`, `authorization`, …).
- **Secrets** — none in the repo. Config via environment + `application.properties` placeholders.
- **SQL** — all persistence goes through Spring Data JPA's parameterised queries in `app.adapter.out.persistence`; no string-built SQL outside `src/main/resources/db/migration/`.

## Supply chain (BRS §4.2)

- Two lockfiles committed and enforced (NFR-08/NFR-11): `gradle.lockfile` (dependencyLocking over every configuration; a resolution the lock does not name fails) behind the **checksum-pinned Gradle wrapper** (`distributionSha256Sum` in `gradle/wrapper/gradle-wrapper.properties`), and `pnpm-lock.yaml` (`--frozen-lockfile` in CI) for the gate corpus.
- **Dependency budget** (NFR-13): `deps:budget` holds the declared runtime surface to a named allowlist (the six ADR 001 coordinates) under a ceiling of 10.
- **osv-flagged transitive pins** (`build.gradle.kts`, each annotated with its advisory id): Tomcat ≥ 11.0.25 (Boot 4 / Servlet 6.1; CRITICAL GHSA-9xv2-5v5q-p794, GHSA-gcx9-497g-6cp6 and GHSA-h3x4-894j-xpx5), postgresql ≥ 42.7.12 (HIGH GHSA-j92g-9f8w-j867), Jackson 3 BOM ≥ 3.1.7 plus compatibility Jackson 2 BOM ≥ 2.22.3 (parser/databind advisories), commons-compress ≥ 1.26.0 and commons-lang3 ≥ 3.18.0 (moderate; test/tool classpaths — the lockfile is scanned whole), log4j-api ≥ 2.25.5 (MODERATE GHSA-qv9r-c865-cp47, arriving only through Boot's log4j-to-slf4j bridge — pinned anyway, because an advisory a scanner can see is one a reviewer has to answer for). BOM-managed artifacts move via version-property overrides, the rest via constraints; drop a pin once the managing BOM catches up.
- **Audit**: `sec:scan` builds a deterministic CycloneDX 1.5 SBOM from `gradle.lockfile`'s runtimeClasspath (`pnpm sbom` → `.proto-forge/sbom.cdx.json`, purl-sorted, no timestamp) and runs osv-scanner over it — findings are a hard stop, never auto-suppressed. osv-scanner is an external binary: enforced when present, warned locally when absent, mandatory in CI (the §19 tool-gating precedent).
- **Seed integrity (BRS §17.2)**: `.proto-forge/seed.lock` pins the platform kernel (`src/main/java/app/platform/**`) and the gate corpus (`scripts/**`) by one sha256; `snapshot:diff` re-verifies it every run. Upgrades are explicit (`pnpm seed:lock` + ADR), and a local hook blocks kernel edits before they land.

## Reporting a vulnerability

Report privately through this repository's GitHub vulnerability reporting —
**Security → Report a vulnerability** on the repository page — and do not open a
public issue or attach a proof of concept to a pull request. If this repository is
not hosted on GitHub, replace this channel with the private one that applies;
`sec:conformance` fails when the section names no channel and no response window
(control `SEC-041`, SSDF RV.1.3).

| Step | Deadline |
| --- | --- |
| Acknowledgement of the report | 3 business days |
| Triage with a severity | 10 business days |
| Fix or documented mitigation for a confirmed high or critical finding | 30 days from triage |
| Fix for a confirmed medium or low finding | the next release |
| Coordinated disclosure | after the fix ships, or 90 days from the report, whichever is first |

## Patched Spring baseline (ADR 203)

Spring Boot 4.0.8 manages Spring Framework 7.0.9, the free fixed baseline for GHSA-j9f9-w8pj-32f8 and GHSA-pc63-qcmh-9cmg. The Flyway Boot starter preserves startup migrations after Boot 4 modularized auto-configuration. The operator approved the one-for-one protected runtime-allowlist replacement and regenerated seed digest on 20 October 2026; the six-dependency count, ten-dependency ceiling, quality floors and platform kernel are unchanged.
