# proto-forge v0.4.0 — production grade

- Status: approved
- Date: 2026-08-12
- Supersedes the P0 scope note previously kept outside this repository

## 1 Why

Four things are asked of this release, and each of them is a hole that exists today.

**1.1 Overlay layering is not actually guaranteed.** `Portal` + `tokens.layer.*` + `layer:scan` +
`e2e/overlay.e2e.ts` cover the single-overlay case well. They do not cover more than one:

| # | Case | Today |
|---|---|---|
| a | Two dialogs open at once | Both carry `zIndex: 1010`; the winner is mount order inside the portal host, not open order. Undefined. |
| b | `Menu` inside dialog A, then dialog B opens | Menu (`popover` 1100) paints **above** dialog B (`modal` 1010). Wrong: the menu belongs to the dialog underneath. |
| c | Escape with a stack open | Every overlay owns its own `document` keydown listener, so one Escape closes a menu **and** its dialog. |
| d | Hostile `z-index: 2147483647` in app code | Wins over every overlay. |
| e | Modal is not modal | No `inert`/`aria-hidden` on the app root, no scroll lock — Tab and screen-reader focus escape the dialog. |
| f | jsdom cannot observe paint | Unit tests read a `zIndex` value back out of the style they just set. Tautological. |

**1.2 "No gaps" is not measurable.** `docs:verify` proves a component has a page and a fresh
screenshot. Nothing proves a component has a test per state, and nothing proves a state exists in
the browser at all. Coverage floors sit at 85/80 for features and 80/75 for app and config, and
100 % line coverage does not prove an assertion fires.

**1.3 There is no Playwright test of the component library.** `overlay.e2e.ts` holds six hand-written
scenarios against the gallery. Every other primitive is verified only in jsdom.

**1.4 The normative document does not ship.** `SKILL.md`, `template/AGENTS.md`, template source
comments and every gate script cite `BRS-PROTO-FORGE-001` roughly 150 times — `BR-02`, `BR-16`,
`BRS §4.1`, `NFR-02`, `T1`–`T13`. That document is not in this repository. The only pointer to it is
a dangling `~/work/docs/superpowers/specs/…` path in `SKILL.md:197`. `plugin/README.md` states the
plugin manifest is owned by a different repository under `~/work/agentic-os`. So the two asks
"standalone" and "clearly defined standards" are the same defect: **the norm everything appeals to
is outside the package.**

## 2 Decisions

| ID | Decision |
|---|---|
| D1 | Overlays move to the **browser top layer** (`<dialog>.showModal()`, Popover API). The owned implementation is the only one; the `own \| radix` provider switch is retired and `@radix-ui/react-dialog` is dropped. |
| D2 | The Playwright component-library suite is driven by a **declarative case registry** rendered through a harness entry point. No `@playwright/experimental-ct-react`. |
| D3 | Coverage is **100/100/100/100 on every glob**, the exclusion list is locked, and **mutation testing** (Stryker, break 90) gates `packages/proto-ui/**` and `src/domain/**`. |
| D4 | **No pixel diffing.** Layering is asserted through geometry and hit-testing, per ADR 008's original reasoning. |
| D5 | The **normative register ships in-repo** as `references/requirements.md`, and a citation gate fails on any dangling or unenforced rule. |
| D6 | Template ADRs describe the **shipped seed**, so 003/008/009/020/021 are rewritten in place. The evolution of the seed is recorded in the plugin's own `docs/adr/`. |

### 2.1 On D6

`SKILL.md` tells a running prototype never to delete an ADR — reversal is a supersede. That rule
governs a prototype's own history. The template's ADR set is not a history; it is the design
document a freshly generated prototype starts from. Shipping `008 superseded by 200` into every new
prototype would hand each one a decision trail it never made. So the seed's ADRs state the seed's
design, and this repository's `docs/adr/` records how the seed changed. Two ADR sets, two subjects,
no contradiction.

## 3 Standalone

### 3.1 `references/requirements.md` — the normative register

BRS-PROTO-FORGE-001 folded into this repository. Existing identifiers (`BR-xx`, `NFR-xx`,
`BRS §x.y`, `T1`–`T13`) are **kept**: ~150 citations already resolve to them, and renaming would be
churn with no gain. Structure:

```
§1  Scope and conformance
§2  Definitions (prototype, seed, facet, gate, waiver, fixture, mock)
§3  Rules — BR-01 … BR-nn, NFR-01 … NFR-nn
§4  SOLID, as enforceable rules for this codebase (see §8 below)
§5  Gate register — gate → rules it enforces → selftest case ids
§6  Cross-reference to references/decision-table.md (T1–T13)
```

Every rule carries five fields, all mandatory:

```markdown
### BR-16 — Every popup surface is on top by construction

**MUST.** …statement…

- **Why:** …
- **Enforced by:** `layer:scan` (`template/scripts/layer-scan.mjs`), `overlay:matrix`
- **Proven by:** `gates:selftest` cases `layer-literal-zindex`, `layer-unportalled-fixed`,
  `layer-scale-reorder`, `overlay-matrix-missing-case`
- **Verified in a browser by:** `e2e/overlay-layering.e2e.ts` cases 1–16
```

Rules whose subject is the *plugin* rather than the prototype (`BRS §17.x`, seed pinning, release
ritual) live in the same register, marked `Scope: plugin`.

#### 3.1.1 How the register is reconstructed

BRS-PROTO-FORGE-001 is not available — that is the defect. The register is therefore **derived from
the artefacts that already implement it**, in this precedence order:

1. the ADR that states the decision (`BR-16` → ADR 008, `BR-05` → `adr-lint.mjs` header, …);
2. the gate script that enforces it, whose header comments state the rule in prose;
3. the source comment at the citation site;
4. `SKILL.md` and `template/AGENTS.md`, which restate many rules for their audiences.

Two hard constraints on this work:

- **No invention.** A rule is written only from evidence in the repository. If a cited id's meaning
  cannot be established from (1)–(4), the citation is **rewritten to the rule that actually applies**
  and the substitution is listed in `references/requirements.md §7 Reconstruction notes` with the
  citation sites it touched. An id is never given a plausible-sounding definition to make the gate
  green.
- **No silent renumbering.** Ids keep their numbers. Where the reconstruction finds two citations of
  one id meaning different things, the narrower one keeps the number and the other is rewritten, again
  recorded in §7.

`citations` runs last in the repo `verify`, so the reconstruction is complete when it passes with an
empty §7 delta.

### 3.2 `scripts/citations.mjs` — repo-level gate

Fails on any of:

1. a `BR-xx` / `NFR-xx` / `BRS §x` / `T<n>` citation anywhere in the repo (SKILL.md, `references/**`,
   `template/**` including source comments, ADRs, gate scripts) that does not resolve to a heading in
   `references/requirements.md` or `references/decision-table.md`;
2. an `ADR NNN` / `ADR-NNN` / `@adr NNN` citation that resolves to no ADR file in the same tree;
3. a rule with no **Enforced by** entry;
4. a rule whose **Enforced by** names a gate that does not exist in `template/package.json`;
5. a gate in `template/package.json` that no rule names — an enforcer with no norm behind it;
6. a rule with no **Proven by** selftest case, cross-checked against the case ids
   `gates-selftest.mjs` actually registers.

(3), (5) and (6) are what make "no gaps" mechanical: an unenforced rule and an unmotivated gate both
fail the build.

### 3.3 Plugin packaging

- `plugin/.claude-plugin/plugin.json` — real manifest (name, version, description, skill path).
- `.claude-plugin/marketplace.json` at repo root — this repository is installable as its own
  single-plugin marketplace.
- `plugin/README.md` rewritten: install from this repository; the agentic-os mirror becomes an
  optional downstream note, not the source of truth.
- `skill.json` `adr[]` points at this repo's `docs/adr/`, not an external ADR id.

### 3.4 Repo-level verify

The repository gains a root `package.json` (private, no runtime deps):

| Script | Does |
|---|---|
| `verify` | `citations` → `skill:lint` → `manifest:lint` → `template:integrity`. Seconds, no install. |
| `citations` | §3.2. |
| `skill:lint` | `SKILL.md` frontmatter present, `name` matches `skill.json`, description within the length the loader accepts, no path outside the repo (`~/`, absolute `/Users/`, `../..`). |
| `manifest:lint` | `skill.json`, `plugin.json`, `marketplace.json` agree on name and version. |
| `template:integrity` | The template's `.proto-forge/seed.lock` matches `packages/proto-ui/**`, and `snapshot.json` matches the tree. |
| `verify:template` | Copies `template/` to a scratch dir, runs `pnpm install && pnpm verify` there. The only real proof; CI and release only. |

`SKILL.md:197` loses the `~/work/...` pointer and gains `docs/specs/`.

## 4 Overlay architecture

### 4.1 Modules

`packages/proto-ui/src/overlay/` — one responsibility each:

| Module | Responsibility | Public shape |
|---|---|---|
| `OverlayStack.tsx` | The stack of open overlays: ordinals, `isTopmost(id)`, owner chain (which overlay a surface was opened from) | `<OverlayStackProvider>`, `useOverlaySlot(kind, open)` → `{id, isTopmost, ordinal, ownerId}` |
| `capabilities.ts` | The only feature detection in the library | `capabilities()` → `{topLayerDialog, popover, cssAnchor}` |
| `topLayer.ts` | Thin adapter over the platform calls | `promote(el, mode)`, `demote(el, mode)` |
| `useDismiss.ts` | Escape and outside-pointer → close **the topmost overlay only**. The library's single `keydown` owner | `useDismiss({id, ref, onDismiss, enabled})` |
| `useScrollLock.ts` | Refcounted scroll lock; restores the original `overflow` when the last modal closes | `useScrollLock(active)` |
| `useInertBackground.ts` | Refcounted `inert` on the app root, for the fallback path (`showModal()` does this natively) | `useInertBackground(active)` |
| `useFocusScope.ts` | Initial focus, trap (fallback path), return-to-opener through a stack | `useFocusScope({ref, active, trap})` |
| `useAnchor.ts` | Viewport anchoring for popovers: CSS anchor positioning when available, `getBoundingClientRect` + captured scroll/resize otherwise | `useAnchor({triggerRef, surfaceRef, open, placement})` |
| `overlay.css` | `::backdrop`, `:popover-open`, and the `@supports not` fallback block | — |

The contract every surface satisfies — the thing that lets one generated browser suite drive all of
them (§8, LSP):

```ts
export type OverlayKind = "modal" | "popover" | "toast" | "tooltip";

export type OverlaySurface = {
  kind: OverlayKind;
  open: boolean;
  onDismiss: () => void;
  "data-testid": string;
};
```

`ProtoUIProvider` is **not** deleted with the provider switch. It is re-scoped: it loses the
`provider` prop and becomes the library's root, mounting `OverlayStackProvider` and the token custom
properties. It keeps its export, its docs page and its `// @adr 020` anchor, so features keep one
wrapper to mount and the overlay stack has a well-defined owner rather than a module singleton (§8,
DIP).

`Portal` stays. Top layer plus a body-level host is deliberate redundancy: the fallback path needs
the host, `layer:scan` rule 3 stays meaningful, and it costs nothing.

### 4.2 Surface mapping

| Primitive | Mechanism | Fallback (no top layer) |
|---|---|---|
| `Dialog` | `<dialog>` + `showModal()`, `::backdrop` as scrim | `Portal` + `tokens.layer.overlay`/`modal` + `useFocusScope(trap)` + `useInertBackground` |
| `Menu` | `popover="auto"` (light dismiss, nesting) | `Portal` + `tokens.layer.popover` derived from owner ordinal |
| `ToastProvider` | `popover="manual"` | `Portal` + `tokens.layer.toast` |
| `Tooltip` **(new)** | `popover="hint"`, `manual` where unsupported | `Portal` + `tokens.layer.tooltip` |
| `Select` | **unchanged.** A native `<select>` popup is drawn by the OS above the page; there is nothing to fix and nothing to portal. |

`Tooltip` is not scope creep: `tokens.layer.tooltip` exists today with no primitive using it, which
is a live inconsistency in the scale the register now has to state.

### 4.3 Ordering

In the top layer, paint order **is** promotion order — exactly the required semantics: a dialog
opened later paints above; a popover invoked from it paints above that; closing it returns the
previous surface to the top. No arithmetic, and a hostile `z-index: 2147483647` in app code cannot
compete, because the top layer is not part of the document's stacking contexts at all.

`OverlayStack` therefore does **not** compute z-index on the primary path. It exists for:

- dismiss order — `useDismiss` acts only when `isTopmost(id)`;
- refcounting scroll lock and inert;
- the fallback path, where the effective layer is `tokens.layer[kind] + ownerOrdinal * STEP` with
  `STEP = 10`, so a menu opened in dialog A stays below dialog B (defect 1.1b). `STEP` lives in
  `overlay/OverlayStack.tsx` and the scale's gaps (`overlay` 1000 → `modal` 1010 → `popover` 1100)
  bound how deep a stack the fallback supports: nine levels, then the gate's ordering check fails
  rather than the layering silently inverting.

`tokens.layer` shrinks its primary role to in-flow chrome — `base`, `raised`, `sticky`. The overlay
values stay, documented as fallback-only, and `layer:scan` enforces that they are read only inside
the fallback branch.

### 4.4 Testing the two paths honestly

jsdom 26 implements `<dialog>.showModal()` but not the Popover API and not `inert` semantics. Both
paths are therefore real code, each verified where the capability exists:

- **fallback path** — exercised by Vitest in jsdom, because `capabilities()` reports no popover there;
- **top-layer path** — exercised by Playwright in Chromium, where it is the only path taken.

Nothing is mocked. What cannot be reached from jsdom is confined to `topLayer.ts` and
`capabilities.ts` and carries a reasoned ignore naming the Playwright case that covers it (§7.2).

### 4.5 CSS

`::backdrop` and `@supports` cannot be expressed as inline styles, so `proto-ui` gains exactly one
stylesheet, `overlay.css`, imported by `overlay/index.ts`. It reads design values from CSS custom
properties emitted from `tokens.ts` (single source preserved; `consistency` gains a check that the
custom-property block and `tokens` agree). Migrating the library's existing `style={{}}` props to
CSS, and tightening CSP's `style-src-attr`, is **out of scope** (§10).

## 5 Gates

### 5.1 `layer:scan` — new rules

| # | Rule |
|---|---|
| 4 | A file exporting an overlay surface must consume `useOverlaySlot` — no primitive rolls its own open/close bookkeeping. |
| 5 | `document.addEventListener("keydown", …)` inside `packages/proto-ui/**` is legal only in `overlay/useDismiss.ts`. One dismiss owner. |
| 6 | `tokens.layer.{overlay,modal,popover,toast,tooltip}` may be read only inside a `capabilities().*` false branch or an `@supports not` block. |
| 7 | `position: fixed` surfaces live only under `overlay/**`. |
| 8 | The fallback scale keeps its order (extends the existing ordering check). |
| 9 | `showModal`/`showPopover`/`hidePopover`/`inert` appear only in `overlay/topLayer.ts` and `overlay/useInertBackground.ts`. |

### 5.2 `overlay:matrix` — the "no gaps" gate

`scripts/overlay-matrix.mjs`. For every exported component × every state declared in
`src/harness/cases.ts`, four cells must be filled:

| Cell | Proof |
|---|---|
| unit test | a `*.test.tsx` referencing the state's testid or case id |
| harness case | an entry in `src/harness/cases.ts` |
| browser test | a generated case in `e2e/component-library.e2e.ts`, matched by case id |
| docs | a screenshot or a stated `<!-- no-screenshot: … -->` in `docs/components/<C>/README.md` |

A missing cell fails. What is required depends on what a component *is*, declared once in
`cases.ts` as `kind`:

| Class | Members | Required cells |
|---|---|---|
| `surface` | `Dialog`, `Menu`, `ToastProvider`, `Tooltip` | all four, **plus** ≥1 case with `assert.topmost` and ≥1 with `assert.focusReturnsTo` |
| `visual` | `Button`, `Field`, `Select`, `Checkbox`, `Table`, `Tabs` | all four |
| `structural` | `Portal`, `ProtoUIProvider` | unit test + docs page with a stated `<!-- no-screenshot: … -->`. No harness case: they render no markup of their own, and demanding a screenshot would only produce a picture of their child. |

The classification is data, so adding a primitive without classifying it fails the gate — the
default is not "exempt".

### 5.3 SRP ceilings in ESLint

Numbers, not adjectives: `max-lines` 200 (source), `max-lines-per-function` 60, `complexity` 8,
`max-depth` 3, `max-params` 3. `packages/proto-ui/src/overlay/**` is where these bite, and they are
the mechanical form of "one responsibility per module".

## 6 Component-library harness and Playwright suite

### 6.1 Registry, split for a reason

```
src/harness/
  cases.ts       ← pure metadata. No JSX, no React import.
  mounts.tsx     ← Record<CaseId, () => ReactNode>
  Harness.tsx    ← renderer (today's Gallery.tsx)
  main.tsx
harness.html     ← entry, built only when VITE_HARNESS=1
```

The split is load-bearing: Playwright specs import `cases.ts` to enumerate tests at collection time,
and pulling React component trees into the Node test process to read metadata would be both slow and
fragile. A parity check (in `overlay:matrix`) fails if `cases.ts` and `mounts.tsx` disagree on keys.

Case shape:

```ts
export type Case = {
  id: string;                       // stable, kebab, unique — the URL fragment and the test name
  component: string;                // decides the docs/ folder
  kind: "surface" | "visual" | "structural";   // decides which matrix cells are required (§5.2)
  state: string;                    // screenshot file name and caption
  note: string;                     // what a reader should take away
  interactions?: { click?: string[]; press?: string[] };  // testids / keys, applied before asserting
  assert?: {
    topmost?: string;               // testid that must win elementFromPoint
    notClipped?: string;            // testid whose box must exceed its clipping ancestor
    focusOrder?: string[];          // testids, in the order Tab must visit them
    focusReturnsTo?: string;        // testid focus must land on after dismissal
  };
  axe?: { skip: string };           // a reason, never a bare boolean
};
```

`src/gallery/**` becomes `src/harness/**`; `docs-lib.mjs`, `docs-shots.mjs`, `docs-verify.mjs`,
`vite.config.ts`, `budget.mjs` (which must keep refusing to measure a harness build),
`playwright.config.ts`, the coverage exclusion list, `.proto-forge/snapshot.json` and `SKILL.md`
Phases 1 and 8 are updated in the same commit.

### 6.2 `e2e/component-library.e2e.ts` — generated from the registry

Per case, unconditionally:

- mounts at `/harness.html#/<id>`, applies `interactions`, and asserts no console error and no
  unhandled rejection;
- `axe` with 0 serious/critical, unless `axe.skip` states why;
- every focusable is reachable by Tab and shows a visible focus indicator (computed outline or
  box-shadow differs between focused and unfocused);
- declared `assert.*` entries.

Per declared assert, the shared helpers: `isTopmost` (centre plus four inset corners, not just the
centre as today), `exceedsClippingAncestor`, `tabOrder`, `focusAfterDismiss`.

### 6.3 `e2e/overlay-layering.e2e.ts` — the adversarial matrix

Sixteen cases, each with its harness fixture. Marked ● where today's implementation fails or has no
coverage:

| # | Case | |
|---|---|---|
| 1 | Dialog inside `transform` + `filter` + `overflow: hidden` → topmost, unclipped | exists |
| 2 | Sticky header at `tokens.layer.sticky` does not cover the scrim | exists |
| 3 | Sibling with `z-index: 2147483647` → still loses | ● fails today |
| 4 | Dialog over dialog: B above A; Escape closes B only; A stays modal | ● |
| 5 | Menu in dialog A, then B opens → B above the menu | ● fails today |
| 6 | Menu in a dialog draws above its own dialog | exists |
| 7 | Toast raised from a modal is above everything | exists |
| 8 | Tooltip above a toast | ● |
| 9 | Ancestor with `contain: paint` / `content-visibility: auto` / `filter` → escapes | ● |
| 10 | Popover in an `overflow: auto` container → re-anchors on scroll, unclipped | ● |
| 11 | One overlay host, last child of `body` | exists |
| 12 | Scroll lock refcount: two modals; closing one keeps the lock; closing both restores the original `overflow` | ● |
| 13 | Focus returns through the stack: A → B → close B → focus inside A → close A → focus on the opener | ● |
| 14 | `inert`: while a modal is open, neither Tab nor a click reaches app content | ● |
| 15 | `forced-colors: active` → surfaces and their borders stay visible | ● |
| 16 | `prefers-reduced-motion: reduce` → no transition blocks the assertion, surfaces still correct | ● |

Cases 15 and 16 use Playwright's `colorScheme`/`forcedColors`/`reducedMotion` options — geometry and
computed style, no pixels (D4).

## 7 Test rigor

### 7.1 Coverage

Every glob to `{statements: 100, branches: 100, functions: 100, lines: 100}`. `coverage.exclude`
is locked by `scripts/coverage-policy.mjs` to exactly three entries, each with a stated reason:

```
src/main.tsx      — bootstrap: renders <App/> into #root, covered end-to-end by e2e/shell
src/harness/**    — fixture catalogue, never in a production build
**/*.d.ts         — declarations, no executable code
```

Any addition, and any threshold below 100, fails. (The hook that already blocks lowering a threshold
stays; this gate catches the same thing in CI, where hooks do not run.)

### 7.2 `scripts/ignore-registry.mjs`

Every `v8 ignore` must read:

```ts
/* v8 ignore next -- <reason> [covered-by: <playwright case id>] */
```

The case id must exist in `src/harness/cases.ts`. The total count is pinned in
`.proto-forge/snapshot.json`, so the population cannot grow quietly. This is what keeps 100 % an
honest 100 % of reachable code while §4.4's two-path design stands.

### 7.3 Mutation testing

Stryker (`@stryker-mutator/core`, `@stryker-mutator/vitest-runner`), `mutate` scoped to
`packages/proto-ui/src/**` and `src/domain/**`, `thresholds: { break: 90, high: 95 }`,
`incrementalFile: .stryker-tmp/incremental.json` (gitignored), `concurrency` from CPU count. New
script `test:mutation`, placed in `verify` immediately after `test:unit`. This is the only mechanical
proof that assertions fire rather than merely execute.

### 7.4 Fixtures with mock data

`src/test/factory.ts`:

```ts
export function defineFactory<S extends ZodType>(schema: S, defaults: () => z.input<S>):
  (overrides?: Partial<z.input<S>>) => z.output<S>
```

Every factory parses through the schema, so a fixture cannot drift from the domain. Ids come from a
seeded counter — no `Math.random`, no `Date.now`, so component tests are byte-deterministic.
`stub:scan` gains: a module under `__fixtures__/` may export only factories built with
`defineFactory` (the existing rule that only `*.test.*`/`*.e2e.*` may import them stays). The demo's
`Note` fixture is the worked example, and every `proto-ui` component test that takes data
(`Table`, `Menu`, `Select`, `Tabs`) is rewritten onto factories.

MSW stays **out of the template**: the demo persists locally through Dexie, so an MSW dependency
would be a devDependency nobody imports — dead weight the template's own rules exist to reject.
It becomes the mandated mechanism for the `api` facet in `SKILL.md` Phase 3 / T6, with the exact
scaffold recorded in `references/decision-table.md`.

## 8 SOLID, as enforced rules

`references/requirements.md §4`. Each principle gets a rule of this codebase and an enforcer — no
principle appears without one.

| Principle | Rule here | Enforced by |
|---|---|---|
| SRP | An overlay primitive composes the `overlay/` hooks and implements none of their concerns itself. Source files ≤200 lines, functions ≤60, complexity ≤8. | `layer:scan` rules 4/5/9, ESLint ceilings (§5.3) |
| OCP | A new overlay kind is a new composition; `Dialog`, `Menu`, `Toast`, `Tooltip` are closed to edits for the sake of a new kind. | `overlay:matrix` (a new kind must arrive with its own cells), `dup:scan` |
| LSP | Every overlay satisfies one `OverlaySurface` contract, so the generated browser suite drives any of them identically. | typecheck, `overlay:matrix` |
| ISP | The hooks are separate: a non-modal popover imports neither scroll lock nor inert. | `layer:scan` rule 6, `depcruise`-style import assertion in `layer:scan` |
| DIP | Primitives depend on the `OverlayStack` **context** and on repository **ports**, never on a module singleton or a concrete adapter. | `eslint-plugin-boundaries` (already configured), `consistency` single-source checks |

## 9 ADR plan

**Template seed** (`template/docs/adr/`) — rewritten in place per D6:

| ADR | Change |
|---|---|
| 003 | Total coverage + mutation testing replaces layered thresholds |
| 008 | Native top layer as the layering mechanism; `tokens.layer` demoted to chrome + fallback |
| 009 | Amended: the documentation source is the harness registry, and `overlay:matrix` joins the mandatory set |
| 020 | Single owned implementation; the primitive set gains `Tooltip`; no optional Radix dependency |
| 021 | **Removed** — the provider switch is retired. `providers/index.tsx` survives with `ProtoUIProvider` re-scoped (§4.1) and re-anchored to `// @adr 020`; the `// @adr 021` anchor goes. Number 021 stays unused in the band. |

Typed fixture factories are folded into the rewritten **ADR 003** rather than taking a new number:
they are a test-strategy decision, and 023 is already allocated by `SKILL.md` Phase 3 to the typed
API adapter (T6).

**Plugin** (`docs/adr/`, new) — the seed's own history:

| ADR | Subject |
|---|---|
| 001 | The normative register ships in-repo; citations are gated |
| 002 | The plugin carries its own manifest and marketplace entry |
| 003 | Seed v2: overlays on the top layer, provider switch retired (records the `seed.lock` bump) |
| 004 | Repo-level verify, and `verify:template` as the integrity proof |

Anchor consequences: 008 and 009 keep their numbers, so their existing `// @adr` anchors need no
edit — but the anchors move with the code (the case registry's `// @adr 009` travels from
`src/gallery/cases.tsx` to `src/harness/cases.ts`), and the new `overlay/` modules each gain an
`// @adr 008` anchor. The single `// @adr 021` anchor is replaced by `// @adr 020`.

## 10 Out of scope, stated

1. **Inline styles → CSS.** Only `overlay.css` is added. Migrating the library's `style={{}}` props
   and dropping `style-src-attr 'unsafe-inline'` from CSP is a separate change; doing it here would
   dissolve the focus of this one.
2. **MSW in the template** (§7.4). Reversible: it needs a second demo entity on the `api` facet so
   there is something to verify.
3. **Pixel-diff visual regression** (D4).
4. **Radix as an optional peer.** Retired, not preserved behind a flag; a flag would reintroduce the
   split layering contract this release exists to remove.

## 11 Acceptance

1. `template/` `pnpm verify` green, including `test:mutation`, `overlay:matrix`, and the full
   `e2e/component-library.e2e.ts` + `e2e/overlay-layering.e2e.ts`.
2. Repo `pnpm verify` green; `pnpm verify:template` green in a scratch copy.
3. `pnpm gates:selftest` has a failing-case id for every new gate rule (§5.1 rules 4–9, §5.2, §7.1,
   §7.2) and for every rule in the register (`citations` check 6).
4. Coverage report shows 100/100/100/100 with exactly three exclusions.
5. No reference points at a file this repository does not contain. `skill:lint` enforces it, and it
   is narrower than "no home paths": `README.md`'s `cp -R proto-forge ~/.claude/skills/proto-forge`
   is an instruction to the reader about *their* machine and stays. What must go is every pointer to
   a file that is expected to exist and does not — `SKILL.md`'s `~/work/docs/superpowers/specs/…`
   and `plugin/README.md`'s `~/work/agentic-os/plugins/proto-forge`.
6. Every one of the sixteen cases in §6.3 passes, and cases 3, 4, 5, 8, 9, 10, 12, 13, 14, 15, 16
   demonstrably fail against the pre-change seed.
7. `skill.json`, `plugin.json` and `marketplace.json` all read `0.4.0`.

## 12 Risks

| Risk | Handling |
|---|---|
| `verify` wall time grows (Stryker + a much larger browser suite) | Stryker incremental + scoped to two directories; the browser suite shards by project in CI. If `verify` exceeds ~10 min locally, `test:mutation` moves behind `verify:full` and CI — recorded as an ADR amendment, not a silent drop. |
| jsdom's `<dialog>` support is partial and could regress | `capabilities()` is the single detection point; a jsdom regression flips the fallback path on and tests still pass, because both paths are real. |
| `forced-colors` assertions are engine-specific | Assert only that a border/outline resolves to a non-transparent computed colour — the property that actually breaks — not specific values. |
| Rewriting seed ADRs loses the reasoning behind the old ones | The plugin's `docs/adr/003` carries the old reasoning and why it changed; git history holds the text. |
| 100 % is genuinely hard to reach on the i18n bootstrap (`src/i18n/index.ts`) and the app shell | These get refactored until they are reachable — an initialiser that cannot be tested is a design problem, not a coverage problem. **Adding a fourth exclusion is not an available answer** (§7.1 fails on it), and neither is a `v8 ignore` without a Playwright case behind it (§7.2). |
| The reconstruction in §3.1.1 finds a citation whose rule cannot be established | It is rewritten to the rule that applies and listed in `requirements.md §7`. If that list is long, it is evidence the citation was decorative — worth surfacing, not worth hiding. |
| `overlay:matrix` becomes a chore that invites weakening | It is in the mandatory-gate set, so relaxing it needs a waiver with an ADR and an expiry (ADR 009's mechanism). |
