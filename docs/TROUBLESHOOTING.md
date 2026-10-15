# Troubleshooting

## Start with the failing scope

Identify which layer failed before changing code:

1. plugin repository (`pnpm selftest` or root `pnpm verify`);
2. isolated source template (`verify-template`);
3. generated repository (`verify:fast` or `verify`);
4. native runtime, browser, packaging job, or deployed environment.

A green result in one layer does not clear another.

## Package manager reports `fetch failed`

The repository pins pnpm 10.11.0 and Node 22. A global pnpm/Corepack shim may attempt
to download that version, which fails in an offline or restricted environment.

Check:

```bash
node --version
command -v pnpm
pnpm --version
```

Activate the pinned version while network access is available:

```bash
nvm use 22
corepack prepare pnpm@10.11.0 --activate
```

For root-gate diagnosis only, the root scripts are dependency-free and can be run
with Node directly. Do not treat that workaround as full release validation.

## Engine mismatch

Node 20 or Node 23+ is outside the declared range. Use `.nvmrc`/the manifest rather
than suppressing the warning. Native templates also require the version documented
in [Template reference](TEMPLATE_REFERENCE.md).

## Seed or snapshot mismatch

Do not edit the lock or snapshot first.

- Unexpected mismatch: inspect `git diff` and restore the unintended source change.
- Deliberate seed change: record the decision, run the template's seed-lock command,
  regenerate the snapshot, and run its gate self-tests/full verification.
- Generated product change outside the immutable seed: regenerate only the snapshot
  at the documented commit point.

## Missing scanner

Local gates may report that `osv-scanner`, Docker, Cargo, or a native
toolchain is absent. Install the named tool and rerun. CI is the authoritative proof
for checks that are explicitly tool-gated locally; a skipped local check is not a
successful scan.

## Browser tests fail

Install the pinned Playwright browser from the selected template:

```bash
pnpm exec playwright install chromium
```

Inspect `playwright-report/` and `test-results/`. Reproduce the exact failing spec
before changing assertions. Desktop browser tests exercise the web application in
Chromium; packaged-shell smoke belongs to the packaging workflow.

## Native database tier skips or fails

Confirm Docker is running and the selected stack's native test command is available.
The JVM, Python, and .NET templates use real PostgreSQL containers for their native
tier. A local skip may be permitted by the template, but CI must execute the tier.

## Template integrity is green but application verify is red

This is expected when structure matches but behavior or dependencies fail.
`template:integrity` only checks committed pins. Run:

```bash
node scripts/verify-template.mjs --template <id> --keep
```

Inspect the retained `.scratch/verify-<id>/` repository and the first failing gate.

## Root verification and template verification disagree

Root verification reasons about manifests, references, copied standards, and
template structure. Template verification installs the copied tree and runs product
gates. Fix the failing scope; do not weaken the root gate because a template runtime
failed, or vice versa.

## Integration command created no remote object

The default is staging-only. Inspect `.proto-forge/outbox/`, then check integration
enablement, dry-run, host allowlist, credential environment-variable names, and the
explicit commit/approval flags. Never place the credential value in config.

## A full verify is too slow during feature work

Use `pnpm verify:fast` for each bounded feature/ADR commit. Use the full suite at the
documented checkpoints. Do not remove mutation, browser, security, or documentation
gates to shorten the loop.

