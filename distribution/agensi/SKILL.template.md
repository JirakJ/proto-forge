---
name: proto-forge
description: "Use when the user wants to scaffold or build a new app prototype, MVP, backend service/API, desktop app or first shippable product slice from a short brief — triggers: /proto-forge, \"forge a prototype\", \"scaffold an app\", \"build me an MVP\", \"scaffold a service/API\", \"build a desktop app\". Turns a one-paragraph brief into a React 19 + TypeScript + Vite app, a Node/Java/Kotlin/Python/C# service, a Tauri/Electron desktop shell, or a composed workspace that compiles, passes its own tests and clears a gated verify suite. Fetches the pinned, MIT-licensed plugin from github.com on first use."
summary: "One-paragraph brief in, first shippable product slice out: compiles, 100% unit coverage behind mutation gates, security + delivery baseline, ADR per decision. Deterministic and gated."
version: "__PROTO_FORGE_VERSION__"
tags: ["scaffolding", "prototyping", "mvp", "react", "typescript", "testing", "claude-code"]
keywords: ["proto-forge", "scaffold", "prototype", "mvp", "react 19", "vite", "fastify", "spring boot", "ktor", "fastapi", "asp.net core", "tauri", "electron", "openapi", "mutation testing", "wcag", "adr"]
use_cases: ["Turn a product brief into a working, tested web app prototype", "Scaffold a backend service with an architecture derived from the brief's complexity", "Wrap a web UI in a Tauri or Electron desktop shell", "Compose web + API + e2e as one workspace with an OpenAPI contract"]
docs_url: "https://github.com/JirakJ/proto-forge#readme"
---

# proto-forge

proto-forge turns a short product brief into a **first shippable product slice**: it
compiles, passes its own tests and passes its template's full gate suite. It is a
deterministic, phase-gated pipeline (brief intake → scaffold → domain model →
component library → features → i18n/a11y → tests → security → docs → release) with an
ADR per decision and an append-only prompt log.

## How this listing runs — read first

proto-forge works by copying an app template **byte for byte** into the user's new
project and building inside it. Its ten templates are about 2,300 files, so this
listing does not carry them. It carries one script that fetches the plugin from its
public source repository, **pinned to release `__PROTO_FORGE_REF__` and verified
against commit `__PROTO_FORGE_COMMIT__`**, into the user's cache directory.

- Network: one HTTPS `git clone` from `github.com/JirakJ/proto-forge`, roughly 25 MB,
  on first use only. Later runs reuse the verified checkout offline.
- Nothing is uploaded and no credentials or secrets are read.
- The plugin is MIT-licensed; its full source is at the URL above.
- Tell the user, in one sentence, that this download happens before running step 1.

## Step 1 — Bootstrap

Run `scripts/bootstrap.mjs` with Node (18 or newer). It prints one JSON object:

- `ready: true` → continue with step 2. `root` is the plugin directory, `entry` its
  main `SKILL.md`, `skills` the absolute paths of all four skills.
- `ready: false` → stop. Show the user `error` and `remedy` verbatim. Never work
  around a failed commit check, never use a partial or modified checkout.

Requires `git` on PATH. The JSON also reports `prerequisites` (Node 22.x and pnpm
10.11.0 are needed for the generated project, not for the bootstrap); mention any
that are not met.

## Step 2 — Run proto-forge

1. Read the file at `entry` in full and follow it exactly; it is the authoritative
   pipeline. Every relative path it names (`templates/…`, `references/…`,
   `scripts/…`, `skills/…`) resolves against `root`.
2. The new project is created where the user asks, never inside `root`. `root` is a
   read-only cache: do not edit, commit to, or delete anything in it.
3. For requirement work before building, the companion skills are at
   `skills.discovery` (SPIN/DAPA discovery → gap analysis), `skills.survey`
   (evidence-based inventory of an existing system) and `skills.elicit` (the
   instrument that gets requirements out of a customer). Read the one the user's
   request calls for from its path.

## Permanent install in Claude Code (optional)

Users who run proto-forge often can install it as a regular Claude Code plugin
instead of bootstrapping per session:

```
/plugin marketplace add JirakJ/proto-forge
/plugin install proto-forge@proto-forge
```

Use one route or the other, not both — both register a skill named `proto-forge`.

## Scope

Builds new projects only: web (React 19 + TypeScript + Vite), backend services
(Fastify, Spring Boot, Ktor, FastAPI, ASP.NET Core), Tauri or Electron desktop shells,
and multi-repo workspaces with an OpenAPI contract and a Playwright e2e layer. Not for
native mobile apps or for modifying an existing application.
