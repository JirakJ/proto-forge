# Verification

## Proof model

proto-forge treats a gate as evidence for one bounded claim. A green command does not
automatically prove installation, runtime behavior, packaged desktop behavior,
deployment, manual accessibility, or external integrations.

## Plugin-level commands

Run the aggregate command for a repository change:

```bash
pnpm test
```

`test` runs `selftest` and then `verify`. `selftest` runs every root
`*.selftest.mjs` suite and confirms that gates reject
their negative cases. Root `verify` then runs:

1. `citations` — requirement, decision-row, question, ADR, and gate references resolve.
2. `skill:lint` — four skills, manifests, versions, frontmatter, and repository-local
   pointers agree; `skill:gates` — the skill's mandatory-gate list and verify chain
   are the web seed's, in order.
3. `manifest:lint` — plugin manifests and template registry are well formed.
4. `models:lint` — the model registry is well formed, its routing table matches its
   documentation, and every template's copy is byte-identical to the master.
5. `security:catalogue` — the pinned standard, control mappings, statuses,
   applicability, and vendored copies agree.
6. `template:integrity` — each template's own seed and structure pins match.
7. `deploy:sync` — declared shared delivery files are byte-identical.
8. `discovery:lint`, `survey:lint`, and `elicit:lint` — shipped skill examples satisfy
   their output contracts.

These checks do not install all template dependencies or run template application
tests.

## Isolated template verification

Use:

```bash
node scripts/verify-template.mjs --template web
```

The script copies the selected registered template into `.scratch/`, excluding
generated caches, runs `pnpm install --frozen-lockfile`, and then runs the template's
own full `pnpm verify`. On failure the scratch copy is retained for diagnosis. Add
`--keep` to retain a successful copy.

CI derives a matrix from `references/templates.json` and performs this check for all
ten templates with their stack-specific toolchains.

## Generated-repository lanes

Application templates define two lanes:

- `pnpm verify:fast`: per-iteration, pinned offline structural and unit gates run in
  parallel;
- `pnpm verify`: full, fail-fast phase/release/CI chain including expensive mutation,
  browser, security, documentation, and status work as defined by the template.

The exact chain lives in each template's `package.json`. Backend, web/desktop,
workspace, and E2E chains are intentionally different.

## What common gates establish

| Gate family | Establishes | Does not establish |
| --- | --- | --- |
| Lint/type/build | Source obeys configured static rules and compiles. | Product correctness or deployment success. |
| Unit/coverage/mutation | Measured source is executed and assertions detect selected changes. | Complete behavior, external services, or manual usability. |
| E2E/browser | Covered flows work in the configured browser/runtime. | Every browser, packaged desktop shell, or production infrastructure. |
| Architecture/consistency | Registered dependency and single-source rules hold. | That the derived architecture is the best business choice. |
| Contract/migration | Code, committed OpenAPI, errors, examples, and schema history satisfy the template rules. | Compatibility with untested external consumers or production data. |
| Security scan/conformance | Configured probes and available scanners passed; declared gaps remain visible. | Full OWASP ASVS conformance or absence of vulnerabilities. |
| Accessibility | Axe and keyboard scenarios have no configured serious/critical failures. | Complete WCAG conformance or assistive-technology usability. |
| Snapshot/seed | The shipped structure and immutable seed match their committed pins. | Semantic correctness of changed non-seed files. |
| Quality/status | Documentation mirrors machine artifacts from the represented run. | Freshness after unverified edits. |

## Native and network boundaries

- Testcontainers tiers need Docker and may be tool-gated locally while CI requires
  them.
- Tauri compile checks need Rust/Cargo; packaging is a separate CI stage.
- Playwright needs installed browser binaries.
- Secret and dependency scanners need their binaries and vulnerability data.
- Root and generated verification are designed to avoid network calls, but package
  installation and vulnerability-database refreshes require network access.
- External sync is never evidence of application correctness.

## Recommended change matrix

| Change | Minimum validation |
| --- | --- |
| Reader documentation | Local-link check, root self-tests, root verification, `git diff --check`. |
| Root gate | Its self-test suite, all root self-tests, root verification. |
| Skill mini-template | Its lint and self-tests, root verification. |
| One application template | Template gate self-tests, template full verify, root verify, isolated `verify-template`. |
| Shared delivery or security corpus | All affected templates plus root sync/catalogue gates and isolated matrix verification. |
| Release | Full root gates and all ten isolated template checks in a clean environment. |
