# Development guide

## Setup

Use the exact root toolchain:

```bash
nvm use 22
corepack prepare pnpm@10.11.0 --activate
pnpm install --frozen-lockfile
```

The root package intentionally has no runtime dependencies. Native dependencies live
inside their templates and are installed only when those templates are verified.

Run the plugin checks before changing anything:

```bash
pnpm test
```

If package-manager activation is unavailable, the dependency-free root gate scripts
can be invoked directly with Node for diagnosis. A release still requires the pinned
toolchain and the documented commands.

## Change categories

### Documentation-only change

Update the nearest reader-facing document, validate local links, run root self-tests
and root verification, and inspect `git diff --check`. If the change modifies a
normative statement, update the requirement/decision source and its enforcement in
the same change; prose alone must not create a new rule.

### Plugin or skill change

1. Update the relevant `SKILL.md`, reference table, or mini-template.
2. Add or update a plugin ADR when the decision changes.
3. Update the root manifest only when identity/version changes.
4. Add a negative self-test for every new gate rule.
5. Run `pnpm test` (the root self-tests followed by every repository gate).

### Template change

1. Identify whether the file is template-specific or part of a byte-shared corpus.
2. Record a design change in the plugin ADR namespace when the seed decision changes.
3. Change the canonical template first for shared delivery files, then propagate the
   exact bytes to covered templates.
4. Update the template's seed lock only for a deliberate seed change, and regenerate
   its snapshot.
5. Run the changed template's gate self-tests and full verification.
6. Run root verification and isolated scratch verification.

Never edit a seed lock merely to silence a mismatch. A mismatch is either unexpected
tree drift or a deliberate upgrade that needs a decision record.

### New template

Add exactly one row to `references/templates.json`, then create the complete tree
required by `manifest:lint`. Update CI only if the new stack needs a toolchain that
cannot be inferred from the registry fields or tree. Add appropriate security
catalogue applicability and citation coverage.

## Single sources of truth

| Concern | Source |
| --- | --- |
| Registered templates | `references/templates.json` |
| Brief shape | `references/facets.schema.ts` |
| Deterministic actions | `references/decision-table.md` |
| Requirements and proof declarations | `references/requirements.md` |
| Security control status and applicability | `references/security-controls.json` |
| Plugin name and release version | Four root/plugin manifests, checked for equality |
| Per-template commands | That template's `package.json` |
| Shared delivery file set | `scripts/deploy-sync.mjs` |

Do not copy these values into a second hand-maintained registry. Reader documentation
may summarize them but must link to the source.

## Gate design rules

- A gate must fail on a demonstrated negative fixture before it is treated as proof.
- Failure output must name the violated rule and a safe remediation.
- Offline verification cannot silently require the network.
- Missing mandatory scanners are loud local limitations and CI requirements, not a
  green scan.
- A planned security control has no probe; an enforced control must have one.
- A new relaxation path needs an ADR, reason, expiry, and configuration validation.

## Working tree discipline

Generated caches may exist inside templates and are ignored. Change only tracked
source files relevant to the task. Do not remove unrelated user files or reset a
dirty working tree. Before hand-off, inspect:

```bash
git status --short
git diff --check
git diff --stat
```

## Documentation expectations

- Write in English.
- Lead with behavior and proof boundaries.
- Link to normative sources instead of duplicating long requirements.
- Distinguish plugin gates, source-template verification, and generated-application
  verification.
- State native, browser, packaging, deployment, and manual-test limits explicitly.
- Keep diagrams small and text-addressable.
