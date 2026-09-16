# Release guide

## Release contract

A release is a tagged, internally consistent plugin plus ten independently verified
templates. A green root `pnpm verify` is necessary but not sufficient because it does
not install and run each template.

## Pre-release validation

Use a clean checkout with Node 22, pnpm 10.11.0, and all native toolchains required by
the template matrix.

```bash
pnpm install --frozen-lockfile
pnpm selftest
pnpm verify
```

Then verify every registry entry in isolation:

```bash
node -e "const fs=require('node:fs'); const r=JSON.parse(fs.readFileSync('references/templates.json')); for (const t of r.templates) console.log(t.id)" |
while read -r id; do
  node scripts/verify-template.mjs --template "$id"
done
```

The GitHub Actions matrix performs the same registry-derived verification with
stack-specific setup. Inspect the latest successful CI run and any retained browser
reports before tagging.

## Version update

Update the same SemVer in:

- `package.json`;
- `skill.json`;
- `plugin/.claude-plugin/plugin.json`;
- `.claude-plugin/marketplace.json`;
- every `skills/*/skill.json`.

Add a `CHANGELOG.md` entry that distinguishes implemented capability, staged scope,
known limitations, and verification evidence. `manifest:lint` checks version equality.

## Documentation review

- Update the root README and this documentation when commands, templates, skills, or
  prerequisites change.
- Update the relevant plugin ADR when a seed decision changes.
- Update template documentation and generated status mirrors in the same changeset.
- Ensure security control status reflects actual probes.
- Check local Markdown links and `git diff --check`.

## Tag and distribution

After the release commit and CI are green:

```bash
git tag vMAJOR.MINOR.PATCH
git push origin vMAJOR.MINOR.PATCH
```

The direct marketplace source is `JirakJ/proto-forge`. A downstream marketplace may
mirror a tag, but it should pin that tag rather than copy mutable metadata.

## Rollback

Do not move an existing tag. If a release is defective:

1. record the defect and its reproduction;
2. fix it with a regression test;
3. publish a new patch version;
4. advise users to reinstall the prior known-good tag until the patch is available.

Generated repositories are separate products. Rolling back the plugin does not roll
back code already generated from an earlier seed.
