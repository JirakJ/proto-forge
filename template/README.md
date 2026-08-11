# proto-forge prototype

A production-grade web-app prototype scaffolded by the `proto-forge` skill. It compiles, tests, and passes security, a11y, translation, layering and documentation gates out of the box.

If you are an agent working in this repository, read **`AGENTS.md`** first — it states the rules every change has to satisfy, and most of them are enforced before your edit lands.

## Run

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm verify         # every gate, fail-fast
pnpm config:show    # which gates are in force, and where each setting came from
```

## Layout

```
packages/proto-ui/     owned component library, 100% tested, byte-pinned by sha256
                       Button Field Select Checkbox Dialog Menu Table Tabs
                       ToastProvider Portal ProtoUIProvider + tokens (incl. the layer scale)
src/
  app/                 shell, router (single-source route table), error boundary, not-found page
  config/              zod-validated env (single source)
  domain/<entity>/     pure model + zod schema + repository port
  infra/               real adapters (persistence/api/auth) implementing ports
  i18n/                i18next setup, catalogues, identical-ok allowlist
  features/<feature>/  slices composed from proto-ui (ui + hooks + tests + e2e)
  gallery/             component catalogue for screenshots — never in a production build
  shared/SafeHtml.tsx  the only sanitized-HTML entry point
docs/adr/              ADR ledger (one accepted ADR = one commit)
docs/components/<C>/   per-component page + screenshots + .shot.lock
docs/features/<f>/     per-feature page + screenshots + .shot.lock
.prompts/              append-only prompt log
.proto-forge/          config + snapshot + seed lock + facet schema + integration outbox
.claude/               hooks that block seed edits, threshold drops and gate bypasses
scripts/               the gate scripts (and their self-test)
e2e/                   Playwright specs (+ axe, + the overlay layering proofs)
```

## The four rules with teeth

1. **Everything is translated.** Every locale, every key, every prop — not just JSX text. A value copy-pasted from English fails.
2. **Every interactive and semantic element has a unique `data-testid`.** Enforced by TypeScript on the primitives, by lint in your files, across files by a scan, and in the rendered DOM by every test.
3. **Popups go through `<Portal>` and take their z-index from `tokens.layer.*`.** Proven against real browser paint order in `e2e/overlay.e2e.ts`, not by reading back a style value.
4. **A component is not done until it is documented and photographed.** `pnpm docs:shots` captures it; the lock file makes a stale screenshot fail.

## The example feature is a demo

`src/features/_example/` (Notes), its demo Note domain/persistence, and `docs/features/_example/` are the self-verifying reference slice. On a real generation run the skill **removes** them and builds the brief's real features under the same per-feature Definition of Done.

## Gates

Every gate is a `pnpm` script, so local and CI runs are identical (CI just runs `pnpm verify`). `pnpm gates:selftest` builds a throwaway project per failure mode and proves each gate still rejects what it claims to. See `package.json`, `AGENTS.md` and `docs/ARCHITECTURE.md`.
