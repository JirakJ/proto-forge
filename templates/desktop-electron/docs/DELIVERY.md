# Delivery

A desktop application has **no promotion chain**: there is no dev cluster, no values file, no rollout. Delivery is **packaging** — turning one verified commit into per-OS installers — and packaging is a **CI stage, never a gate** (NFR-16). `pnpm verify` proves the committed shell configuration **statically** (`shell:verify` reads `src-electron/` and `electron-builder.yml`; it never launches or bundles anything and never needs the electron binary); `.github/workflows/package.yml` is the only place installers are built.

## Packaging matrix

One green `verify` on `main` (or a `v*` tag) feeds one packaging run per OS. The bundler is `electron-builder --publish never`, driven by the **pinned** `electron-builder` devDependency — never a global.

| Runner | Artifacts | Bundled by |
| --- | --- | --- |
| `macos-latest` | `.dmg`, `.zip` | `electron-builder` (mac targets) |
| `windows-latest` | `.exe` (NSIS) | `electron-builder` |
| `ubuntu-latest` | `.AppImage`, `.deb` | `electron-builder` |

The renderer content inside every bundle is the same `pnpm build` output the gates measured: `files` packs `dist/**` (the vite build) plus `dist-electron/**` (the esbuild-compiled CJS `main.cjs`/`preload.cjs`), under `asar: true` so the packaged sources are not casually editable in place.

## Verify never packages — and what that means for e2e

The browser suite (`pnpm test:e2e`, including the overlay-layering proofs) runs against **vite preview in Chromium** — the same engine family Electron bundles — not against the packaged shell. That is an honest, deliberate trade (ADR 203): the app half — rendering, a11y, layering, i18n — is fully proven offline on every verify, while the shell half is held still by `shell:verify` as *configuration* (the literal isolation flags, the injected CSP, the navigation lock, the empty bridge). A packaged-app smoke test — launching the built bundle and asserting the window comes up with the locks live — belongs to the packaging stage, where the bundle actually exists.

The electron **binary** downloads at `pnpm install` time (a postinstall step). That is fine locally, where the network exists — and if the download fails (proxy, mirror), `pnpm verify` still runs to green, because nothing in the chain touches the binary; only packaging and `pnpm exec electron .` need it (`docs/TROUBLESHOOTING.md` has the proxy row).

## Auto-update posture: declared, disabled, documented

The template ships with **no update feed**: `electron-builder.yml` declares `publish: null` (the key must be present — `shell:verify` fails a missing or non-null value) and every packaging path runs `--publish never`. An update channel that ships before its feed and signing story is settled is remote code execution with packaging steps.

Turning updates on (electron-updater) is a reviewed sequence, not a flag:

1. Choose and stand up the feed (GitHub Releases, S3, generic HTTPS) — the URL becomes part of the attack surface, treat it like one.
2. Replace `publish: null` with the provider block and add `electron-updater` (pinned exact) to the app; **signing becomes mandatory first** — electron-updater on macOS refuses unsigned updates, and unsigned feeds on any OS are indefensible.
3. `shell:verify` fails the moment `publish` is non-null: extend the gate deliberately in the same diff and record the decision as an ADR in the 200-band (the ADR 203 precedent).

## Code signing per OS

The packaging workflow holds **no signing secrets**, pins `CSC_IDENTITY_AUTO_DISCOVERY=false` (so a stray keychain identity can never sign a template build), and uploads **unsigned** artifacts — a template must not ship half a signing story, because a wrong one is worse than none. What a real product wires in, per OS:

| OS | Requirement | Where it goes |
| --- | --- | --- |
| macOS | Developer ID Application certificate + **notarization**; Gatekeeper refuses unsigned apps by default | `CSC_LINK`/`CSC_KEY_PASSWORD` + notarize credentials as CI secrets, consumed by electron-builder |
| Windows | Authenticode certificate (EV for instant SmartScreen reputation) | `CSC_LINK`/`CSC_KEY_PASSWORD` CI secrets (or `win.certificateSubjectName` for a store cert) |
| Linux | Repo-level signing (apt/rpm GPG) or AppImage embedded signature | the distribution channel's own tooling |

Secret **values** live only in CI (GitHub secrets) under the **names** electron-builder documents — the same names-only doctrine the config applies to `*Env` fields.

## Runbook

- **Run the shell locally** (a convenience, never a gate): `pnpm build && pnpm exec electron .` — loads the same `dist/` bundle under the same flags the gate verified.
- **Package locally**: `pnpm package:app` — same `electron-builder --publish never`, artifacts land under `release/`.
- **Bump the shell toolchain**: edit the exact `electron` / `electron-builder` / `esbuild` pins in `package.json`, `pnpm install`, and let `shell:verify` confirm the pins are still exact — the lockfile is the reproducibility contract (NFR-11).
- **Widen the shell surface** (a bridge API, a CSP source, an update feed): every one of these is a `shell:verify` **gate edit plus an ADR** by design — the gate's contract is the reviewed diff.
