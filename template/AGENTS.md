# Working in this prototype

Read before changing anything. These are not style preferences — each one is enforced by a gate that fails the build, and most are also enforced by a hook that blocks the edit.

Run `pnpm config:show` to see which gates are in force and whether any is currently waived.

## The four rules that catch people out

**1. Every user-visible string comes from the catalogue.** Not just JSX text — `title`, `label`, `message`, `emptyLabel`, `errorText` and friends too, as props and as object properties, in `src/**` *and* in `packages/proto-ui/**`. The library owns no copy of its own; the app passes `t()` values in.

Adding a locale means translating it. `pnpm i18n:verify` fails on a missing key, an empty value, a `TODO`, a dropped `{{placeholder}}`, a missing plural form the language actually needs — and on a value byte-identical to English, which is what an untranslated copy-paste looks like. A proper noun that genuinely cannot differ goes in `src/i18n/identical-ok.json` with a reason.

A computed key — `` t(`status.${s}`) `` — fails unless the file declares what it can produce:

```ts
// i18n-dynamic: status.draft, status.sent, status.paid
```

**2. Every interactive and semantic element has a unique `data-testid`.** Buttons, inputs, links, headings, landmarks, list items, table cells, images, anything with a `role`. Layout-only wrappers are exempt.

Unique means unique in the rendered DOM, so inside a `.map()` the testid must be interpolated:

```tsx
<li data-testid={`invoice-${invoice.id}`}>   // not data-testid="invoice-row"
```

Across files, namespace them: `notes-submit`, not `submit`. The primitives make `data-testid` a required prop, so TypeScript objects before lint does.

**3. Popups render through `<Portal>` and take their layer from `tokens.layer.*`.** Never a numeric `z-index`. Anything positioned `fixed`/`absolute`/`sticky` declares its layer. In practice: compose `Dialog`, `Menu` and `ToastProvider` rather than building an overlay — they already do this, and `component-dup-scan` rejects a hand-rolled one.

**4. A component is not finished until it is documented and photographed.** Every exported component and every feature has a page under `docs/`, and that page shows a current screenshot. Add a case to `src/gallery/cases.tsx`, run `pnpm docs:shots`. Editing a component invalidates its screenshots until you re-run it. If there is genuinely nothing to photograph, say so explicitly:

```md
<!-- no-screenshot: a context provider renders no markup of its own -->
```

## What the hooks will stop

- editing anything under `packages/proto-ui/` — the seed is byte-pinned by sha256
- rewriting an existing `.prompts/` entry — the log is append-only; corrections are new entries
- hand-editing `.proto-forge/seed.lock` or `snapshot.json` — they are generated
- lowering a coverage threshold, a budget ceiling, or a gate mode
- `--no-verify`, `git push --force` without a lease, `pnpm seed:lock`
- network calls, unless `guardrails.network.allow` is on and the host is listed

## When a gate is genuinely wrong

Fix the code first — that is the answer roughly always. If the floor itself is wrong, write an ADR. To relax a **mandatory** gate (i18n, testid, layer, docs, security, stub, consistency, snapshot) you also need a `waivers[]` entry in `.proto-forge/config.json` with a reason, that ADR, and an expiry date:

```json
{ "gate": "i18n", "reason": "single-locale pilot for the September demo", "adr": 150, "expires": "2026-09-30" }
```

Without a live waiver the setting is ignored and the gate runs at `error` anyway. With one, every `verify` prints the relaxation, and it ends by itself on the expiry date.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm verify` | Everything, fail-fast. This is the bar. |
| `pnpm config:show` | Gates in force, where each value came from, active waivers |
| `pnpm i18n:verify` | Translation completeness |
| `pnpm layer:scan` · `pnpm testid:scan` | Structural invariants (fast; also run on every edit) |
| `pnpm docs:shots` · `pnpm docs:verify` | Capture / check component screenshots |
| `pnpm gates:selftest` | Proves each gate still rejects what it claims to |
| `pnpm sync:jira` · `pnpm sync:confluence` | Show what *would* be sent. `--commit` to actually send. |
