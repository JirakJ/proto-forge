# ADR 004: The plugin verifies itself, and the template is proved by installing it

- Status: accepted
- Date: 2026-08-12
- Prompt-log: docs/specs/2026-08-12-production-grade-design.md

## Context

The template shipped a sixteen-gate `pnpm verify`. The plugin that ships the template had
no gates at all. Everything above `template/` — the skill, the references, the manifests,
the ADRs, the ~150 citations — was verified by review alone.

That asymmetry is the wrong way round. The template's gates protect a generated prototype,
which is disposable. The plugin's contents protect every prototype anyone generates from
it, and a defect there is copied into all of them.

## Decision

The repository root gains a private `package.json` with no runtime dependencies and two
commands.

**`pnpm verify` — fast, no install.** Four gates, in cheapest-first order:

| Gate | Asserts |
| --- | --- |
| `citations` | Every `BR-xx` / `NFR-xx` / `BRS §x` / `T<n>` / ADR citation resolves; every rule names an enforcer that exists; every gate is named by a rule; every rule's self-test case is registered (ADR 001) |
| `skill:lint` | `SKILL.md` frontmatter agrees with `skill.json`, the description is long enough to trigger reliably, and no reader-facing prose points at a file the repository does not contain |
| `manifest:lint` | The four manifests agree on name and version, the marketplace lists exactly one plugin, its source exists, and its `skills` entry resolves to a real `SKILL.md` (ADR 002) |
| `template:integrity` | The shipped template's byte-pinned seed is still the tree `seed.lock` claims, and its structure still matches its committed snapshot |

**`pnpm verify:template` — the real proof, separately.** Copies `template/` to a scratch
directory, runs `pnpm install --frozen-lockfile`, then runs the template's own `pnpm
verify` there. Everything in `verify` is a proxy for this; this is the thing itself.

It is deliberately **not** part of `pnpm verify`: it installs a dependency tree and drives
a browser, so folding it in would make the command nobody runs. It belongs to CI and to a
release. On failure the scratch copy is left in place, because a failure that deletes its
own evidence costs an hour.

`template:integrity` **delegates to the template's own `snapshot:diff`** rather than
recomputing the seed hash. Two implementations of one hash drift, and on the day they
disagree "which is right?" has no good answer. The hash is also cwd-relative — sorted
paths plus bytes — so a reimplementation run from the repository root would produce a
different digest for an identical tree and read as tampering.

Each gate ships a `scripts/*.selftest.mjs` suite that builds a throwaway repository per
failure mode and asserts the exit code, mirroring the template's `gates:selftest`. This is
NFR-25 applied to the plugin's own gates: the rule is not "the template's gates are
demonstrated", it is "gates are demonstrated".

## Consequences

The plugin is verifiable by anyone who clones it, in seconds, without an install — and
provable in full with one more command. CI runs the two as separate jobs, so a template
failure is distinguishable from a plugin failure at a glance.

The friction is that plugin-level scripts now need their own self-tests, and that
`scripts/lib.mjs` deliberately duplicates a little of `template/scripts/lib.mjs`
(`walk`, `read`, `fail`, `ok`). The duplication is the boundary working: plugin gates run
with the repository root as cwd over the plugin's own sources, template gates run inside a
prototype. Sharing the module would couple the two, and the template must stay a
self-contained thing that can be copied out and still work.

## Alternatives considered

**Put everything in one `verify`.** One command to remember, and it would be honest. But
its runtime is dominated by installing the template and launching Chromium, so it would be
run rarely, and the four fast checks would stop being run at all.

**Verify the template by reading it.** What happened before. A static check on the
template cannot catch a lockfile that no longer resolves, a gate script that throws on a
fresh install, or a browser test that depends on something only present locally.

**Share `lib.mjs` between the two scopes.** Removes ~40 lines of duplication and couples
the plugin's gates to the prototype's, in a repository whose whole claim is that the
template is standalone.

**Skip `template:integrity`, since `verify:template` covers it.** True, but that runs only
in CI. The seed pin is the one thing worth checking on every local run: it is the part of
a prototype nobody re-reviews, and the cheapest place for an unrecorded change to land.
