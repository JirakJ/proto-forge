# Getting started

## Prerequisites

To install and invoke the plugin, use Claude Code with plugin support. To develop
this repository or run generated repositories, use the versions declared by the
manifests:

- Node.js 22.x (`>=22 <23`);
- pnpm 10.11.0;
- the selected template's native toolchain, if any: Python 3.12 with `uv`, JDK 21,
  .NET SDK 10.0.301, Rust/Cargo for Tauri, and Docker for native database or image
  checks;
- Chromium installed through Playwright for web and desktop browser suites.

Do not rely on a newer global Node version. The root and all template manifests pin
Node 22, and package-manager shims may try to download the pinned pnpm when it is not
already available.

## Install the plugin

Register this repository as a marketplace and install its plugin:

```text
/plugin marketplace add JirakJ/proto-forge
/plugin install proto-forge@proto-forge
```

Use this direct source when you want the version represented by this repository.
A downstream marketplace may mirror a tagged release, but that mirror has its own
update cadence and must not be assumed to match `main`.

Alternatively, clone the repository and copy it to Claude Code's skill directory.
Use either plugin installation or manual skill installation, not both, because both
register the same skill names.

## Choose a workflow

| Need | Skill |
| --- | --- |
| Build a new web, API, desktop, or composed prototype | `/proto-forge` |
| Find specification gaps before building | `/discovery` |
| Inventory what an existing codebase demonstrably does | `/survey` |
| Create an evidence-gathering stakeholder instrument | `/elicit` |

## First generation

Give the main skill a brief that names the domain, flows, persistence intent, and
locales. A backend brief must name its implementation stack; a desktop brief should
name Tauri or Electron.

```text
/proto-forge

Build a parcel tracking service in Java with a React dashboard. Dispatchers can
create parcels, assign a courier, update status, and inspect delivery history.
Persist data in PostgreSQL. The customs registry is an outbound REST integration.
English and Czech UI.
```

The expected high-level result is a workspace containing separate API, web, and E2E
repositories. The API is generated first and owns the shared OpenAPI contract.

## Validate a generated repository

Start inside each generated application repository, read its `README.md`, `AGENTS.md`,
and `docs/STATUS.md`, then run:

```bash
pnpm install --frozen-lockfile
pnpm verify:fast
```

Application templates also provide `pnpm doctor`; run it when that command appears
in the generated repository's `package.json`. Composition templates use their own
workspace or registry diagnostics and run `pnpm verify` rather than `verify:fast`.

Run the full suite at its documented checkpoints:

```bash
pnpm verify
```

Commands differ by template. The package manifest is authoritative; see
[Template reference](TEMPLATE_REFERENCE.md).

## Before the first real deployment

- Replace the shipped Notes demonstration during Phase 1; it is reference behavior,
  not product scope.
- Review every proposed ADR and every escalation choice.
- Configure environments and secret names without placing secret values in the
  repository.
- Run native database tiers and packaging jobs in an environment that has their
  required tools.
- Perform manual accessibility and product acceptance testing.
- Review the generated security conformance report and its declared gaps.
