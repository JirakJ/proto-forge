# Contributing

Use Node 22 and pnpm 10.11.0, preserve unrelated working-tree changes, and read
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) before editing the plugin or a template.

Every change must keep its decision, implementation, tests, and documentation aligned.
Run at least:

```bash
pnpm test
git diff --check
```

Template changes also require that template's full verification and an isolated
scratch run:

```bash
node scripts/verify-template.mjs --template <id>
```

Do not lower a gate, rewrite an append-only prompt entry, edit an immutable seed, or
update a seed lock merely to make a check green. A legitimate policy change needs an
ADR and the gate/self-test/documentation changes that make it enforceable.

Keep commits focused and conventional. In generated repositories, follow their stricter
one-accepted-ADR-per-commit and operator-author/model-co-author contract.
