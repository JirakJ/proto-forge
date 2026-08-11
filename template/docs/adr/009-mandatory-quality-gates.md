# ADR 009: Translation, addressability and documentation are mandatory, and configuration cannot quietly waive them

- Status: accepted
- Date: 2026-08-11
- Prompt-log: .prompts/0001-scaffold.md

## Context

Three of the project's stated guarantees were not actually enforced, and each had a green gate in front of it.

**i18n.** `i18n:verify` compared `en` against `pseudo` and checked that used keys existed. It never looked at a locale from the brief. A prototype declaring `["en", "cs"]` could ship `cs.json` copy-pasted from English, or full of empty strings, and pass. The library itself hard-coded `aria-label="Notifications"`, because no lint rule ran inside `packages/proto-ui`. And `t(\`x.${y}\`)` was invisible to every static check.

**Addressability.** `require-testid` covered four intrinsic elements. Headings, landmarks, list items and table cells had none, so tests reached for text content — which changes with every locale. Nothing detected two elements sharing one testid, so `getByTestId` could silently return the first of ten rows forever.

**Documentation.** There was none per component, and no screenshots at all. Where docs exist they rot silently: nothing connects an image to the code it depicts.

At the same time the pipeline needed to become configurable — per-project gate settings, optional JIRA and Confluence integration. Configurability and enforcement pull in opposite directions: a config file that can turn off `i18n` re-opens the hole this ADR closes.

## Decision

**Translation is a hard gate.** Every locale in `SUPPORTED_LOCALES` must exist on disk, be imported by the runtime, and reach exact key parity with the default. Every value must be non-empty and not a placeholder marker. Interpolation placeholders must match. Plural families must carry the categories the locale's grammar requires, resolved through `Intl.PluralRules` — Czech needs `few`/`many` where English does not. **A value byte-identical to the default fails**, unless `src/i18n/identical-ok.json` records why it cannot differ; that allowlist is itself checked for stale entries. Catalogue keys unused in code fail. Computed keys fail unless the file declares its key set with `// i18n-dynamic:`. The literal rules now run over `packages/proto-ui` and `src/shared` too, and `local/no-user-facing-literal` matches user-facing prop and object-property names (`title`, `label`, `emptyLabel`, `errorMessage`, …), not just JSX text.

**Every interactive and semantic element carries a unique testid.** Interactive elements, headings, landmarks, list items, table cells, media, form parts and anything with an explicit `role`. Uniqueness is enforced in three places because no single one is sufficient: lint for in-file duplicates and for static testids inside `.map()`; `testid:scan` for collisions across files; and an assertion after every component test plus an E2E sweep, for the collisions that only exist once rendered. The library makes `data-testid` a **required prop**, so TypeScript catches it before lint does.

**Documenting and photographing a component is part of building it.** Every exported component and every feature has a page under `docs/`, which must reference a screenshot or state why it cannot have one. Screenshots come from a gallery entry point built only when `VITE_GALLERY=1`, and each folder's `.shot.lock` records the hash of the source the image was taken from — so a stale screenshot fails rather than flattering.

**Configuration tightens freely and relaxes only on the record.** `.proto-forge/config.json` (merged over machine-wide defaults) sets gate modes, integration settings and guardrails. Relaxing a mandatory gate — i18n, testid, layer, docs, security, stub, consistency, snapshot — requires a `waivers[]` entry with a reason, an existing ADR and an expiry date. Without one, `config:check` fails **and the gate ignores the setting and runs at `error` anyway**. With one, the run is stamped `conformance: "waived"`, the relaxation is printed on every verify, and it expires by itself. A waiver for a gate that is not relaxed also fails, so the file cannot accumulate reassuring fiction.

`scripts/gates-selftest.mjs` builds a throwaway project per failure mode and asserts each gate's exit code — including that an expired waiver stops disabling its gate.

## Consequences

The hole is closed: an untranslated locale, a duplicate testid and an undocumented component now each fail the build, and `gates:selftest` demonstrates it rather than asserting it. Cost is real. Adding a locale means actually translating it. Every heading and list item needs a name. Every component needs a written page and a gallery case, and editing a component invalidates its screenshots until `pnpm docs:shots` runs. Proper nouns that are identical across locales need an allowlist entry with a justification. The `emptyLabel` and `ToastProvider.label` props became required, and `data-testid` became required on every primitive — a breaking change to the seed, taken deliberately at the seed's first bump.

## Alternatives considered

**Leaving gates free-form and only logging when one is off** — the honest-looking option, and the one that restores the original failure: a single line of JSON quietly returns the build to green while shipping untranslated UI. **Freezing mandatory gates entirely, with no escape hatch** — defensible, but a genuine single-locale pilot then has no path except deleting the gate, which is worse than an expiring, ADR-backed waiver. **Machine-translating missing locales to keep the gate green** — turns a build failure into a plausible-looking wrong translation, which is harder to notice and harder to fix. **Pixel-diff visual regression for screenshots** — flaky across OS and browser versions; hashing the source answers "does this picture show today's code?" without the noise. **Requiring a testid on literally every JSX element** — considered and rejected; naming pure layout wrappers adds attributes nobody selects on and dilutes the ones that matter.
