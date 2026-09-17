# Continuous integration

Two CI surfaces exist and must not be confused: the plugin repository's own
workflows, and the workflows every generated repository carries. A green plugin
run says nothing about a generated product, and a generated repository never calls
back to this repository.

## Plugin repository workflows

### `verify.yml`

Triggers: push to `main`, every pull request, and manual dispatch. A newer run on
the same ref cancels an older one.

| Job | What it does |
| --- | --- |
| `plugin` | Runs `node scripts/selftest-all.mjs` and then `pnpm run verify` with Node 22 and pnpm 10.11.0. |
| `plan` | Reads `references/templates.json` and emits the matrix of `{id, kind, stack}`. |
| `template` | One leg per registry entry, `fail-fast: false`. Installs stack toolchains, installs scanners, warms the pnpm store, installs Chromium for frontend and desktop kinds, then runs `node scripts/verify-template.mjs --template <id>`. |

Toolchain setup in the template job is keyed on the registry or on the tree, never
on a hand-maintained list:

- JDK 21 for `java` and `kotlin` stacks;
- `uv` with Python 3.12 for the `python` stack;
- .NET from the template's `global.json` for the `dotnet` stack;
- the Rust channel named in `src-tauri/rust-toolchain.toml` (read, not repeated) and GTK libraries when `src-tauri/Cargo.toml` exists;
- the deploy toolchain (`kubeconform`, `hadolint`) when `scripts/deploy-verify.mjs`
  exists;
- `gitleaks` on every leg, and `osv-scanner` when the template's `sec-scan.mjs`
  mentions it.

The runner label comes from the repository variable `RUNNER_LABEL` and falls back
to `ubuntu-latest`. Self-hosted runners need passwordless `sudo` for the binary
installs and the apt packages. Expect the mutation legs to dominate wall-clock
time; the web template's Stryker run alone exceeds an hour on a laptop.

Playwright reports from failed frontend and desktop legs are uploaded as artifacts
for seven days.

### `automerge.yml`

Runs after a completed `verify` run. It merges the pull requests that run proved,
subject to five independent conditions:

1. the verify run concluded successfully;
2. the head repository is this repository, never a fork;
3. the pull request is not a draft;
4. GitHub reports the pull request as `MERGEABLE`; an `UNKNOWN` state is treated
   as not mergeable and re-checked on the next run;
5. the pull request does not carry the `do-not-merge` label.

The merge is a merge commit, not a squash, so the one-accepted-ADR-per-commit
history survives on `main`. The workflow performs no checkout and executes none of
the code it merges. Only one merge job runs at a time.

## Generated repository workflows

Application templates ship four workflows; composition templates ship `verify.yml`
and `heal.yml` only.

| Workflow | Purpose | Consent model |
| --- | --- | --- |
| `verify.yml` | Runs the template's full `pnpm verify` on every push. | None required. |
| `package.yml` | Builds, scans, signs, and pushes the image with its SBOM; carries the config-gated performance-smoke stage. Desktop templates package installers instead. | Registry and signing settings in `config.json`. |
| `cd.yml` | Plans and promotes through the declared environment chain `dev`, `sit`, `uat`, `test`, `prod`. | Each environment must be enabled in the committed config; promotion is environment-scoped. |
| `heal.yml` | Runs the mechanical self-healing tier after a red verify and opens a pull request with the result. | Repository variable `HEAL_ENABLED` and committed `selfHealing.ci.enabled`. |

Shared delivery files across application templates (`deploy-lib.mjs`,
`deploy-cli.mjs`, `env-remote.mjs`, `deploy-verify.mjs`, `deploy/schemas`,
`deploy/chart/templates`, `deploy/chart/values/dev.yaml`, `package.yml`, `cd.yml`)
are byte-identical by gate. `deploy:sync` in the plugin fails on a single byte of
drift, and a deliberate divergence is a reviewed edit of the shared-set manifest in
`scripts/deploy-sync.mjs`.

House rules in every workflow: GitHub context reaches shell steps only through
`env:` indirection, never by expression interpolation inside a script.

## Native tiers in CI

The JVM, Python, and .NET templates run a real PostgreSQL tier through
Testcontainers, which requires Docker on the runner. Locally the tier may be
tool-gated and skipped with a note; in CI it is mandatory. The same pattern applies
to `cargo check --locked` for Tauri and to the deploy toolchain.

## Related pages

- [Verification](VERIFICATION.md) for what each gate proves.
- [Release guide](RELEASE.md) for the pre-tag checklist.
- [Known limitations](KNOWN_LIMITATIONS.md) for the ARM64 and Rust-pin findings.
