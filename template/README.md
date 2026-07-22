# proto-forge prototype

A production-grade web-app prototype scaffolded by the `proto-forge` skill. It compiles, tests, and passes security + a11y + i18n gates out of the box.

## Run

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm verify     # run every gate (lint, types, tests, i18n, adr, prompt, dup, consistency, security, snapshot, e2e)
```

## Layout

```
packages/proto-ui/     owned component library (Button, Field, Dialog, Menu, Table, Tabs, Toast + tokens), 100% tested
src/
  app/                 shell + single-source route table
  config/              zod-validated env (single source)
  domain/<entity>/     pure model + zod schema + repository port
  infra/               real adapters (persistence/api/auth) implementing ports
  i18n/                i18next setup, en + generated pseudo catalogues
  features/<feature>/  slices composed from proto-ui (ui + hooks + tests + e2e)
  shared/SafeHtml.tsx  the only sanitized-HTML entry point
docs/adr/              ADR ledger (one accepted ADR = one commit)
.prompts/              append-only prompt log
.proto-forge/          structure snapshot + seed lock + facet schema
scripts/               the custom gate scripts
e2e/                   Playwright specs (+ axe)
```

## The example feature is a demo

`src/features/_example/` (Notes) and its demo Note domain/persistence are the self-verifying reference slice. On a real generation run the skill **removes** them and builds the brief's real features under the same per-feature Definition of Done.

## Gates

Every gate is a `pnpm` script, so local and CI runs are identical (CI just runs `pnpm verify`). See `package.json` and `docs/ARCHITECTURE.md`.
