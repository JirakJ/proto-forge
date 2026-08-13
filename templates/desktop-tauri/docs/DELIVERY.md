# Delivery

A desktop application has **no promotion chain**: there is no dev cluster, no values file, no rollout. Delivery is **packaging** — turning one verified commit into per-OS installers — and packaging is a **CI stage, never a gate** (NFR-16). `pnpm verify` proves the committed shell configuration offline (`shell:verify` reads files and, when the rust toolchain is installed, runs `cargo check --locked` — it never bundles anything); `.github/workflows/package.yml` is the only place installers are built.

## Packaging matrix

One green `verify` on `main` (or a `v*` tag) feeds one packaging run per OS. The bundler is `tauri build`, driven by the **pinned** `@tauri-apps/cli` devDependency — never a global.

| Runner | Artifacts | Bundled by |
| --- | --- | --- |
| `macos-latest` | `.dmg`, `.app.tar.gz` | `tauri build` (bundle targets `dmg`, `app`) |
| `windows-latest` | `.msi`, `.exe` (NSIS) | `tauri build` |
| `ubuntu-latest` | `.deb`, `.rpm`, `.AppImage` | `tauri build` |

The frontend inside every bundle is the same `pnpm build` output the gates measured: `build.frontendDist` points at `../dist`, and `tauri build` runs `pnpm build` as its `beforeBuildCommand`, so the packaged WebView content is the verified bundle, not a second build configuration.

## Verify never packages — and what that means for e2e

The browser suite (`pnpm test:e2e`, including the overlay-layering proofs) runs against **vite preview in Chromium**, not against the packaged shell. That is an honest, deliberate trade (ADR 203): the app half — rendering, a11y, layering, i18n — is fully proven offline on every verify, while the shell half is held still by `shell:verify` as *configuration* (strict CSP, minimal capabilities, pinned toolchain). A packaged-app smoke test — launching the built bundle and asserting the window comes up on the real WebView — belongs to the packaging stage, where the bundle actually exists.

## Auto-update posture: present, disabled, documented

The template ships with the updater **off**: `bundle.createUpdaterArtifacts` is `false` and no `plugins.updater` block exists. `shell:verify` enforces the invariant behind that choice: the updater is either **disabled** or **fully pinned** — a `pubkey` plus `https`-only `endpoints` — and nothing in between. An update channel that ships without its signing key pinned is remote code execution with packaging steps.

Turning updates on is a reviewed sequence, not a flag:

1. Generate the updater keypair (`pnpm exec tauri signer generate`); the **private key never enters the repository** — it lives in CI secrets under a name.
2. Add `plugins.updater` with the public key and the `https://` endpoint list, set `bundle.createUpdaterArtifacts: true`.
3. `shell:verify` now demands exactly that shape; record the decision as an ADR in the 200-band (the ADR 203 precedent).

## Code signing per OS

The packaging workflow holds **no signing secrets** and uploads **unsigned** artifacts — a template must not ship half a signing story, because a wrong one is worse than none. What a real product wires in, per OS:

| OS | Requirement | Where it goes |
| --- | --- | --- |
| macOS | Developer ID Application certificate + **notarization** (`xcrun notarytool`); Gatekeeper refuses unsigned apps by default | `APPLE_CERTIFICATE`/`APPLE_ID` secrets consumed by `tauri build` via its signing env vars |
| Windows | Authenticode certificate (EV for instant SmartScreen reputation) | `tauri.conf.json` `bundle.windows.certificateThumbprint` + a CI secret holding the cert |
| Linux | Repo-level signing (apt/rpm GPG) or AppImage embedded signature | the distribution channel's own tooling |

Secret **values** live only in CI (GitHub secrets) under the **names** a workflow declares — the same names-only doctrine the config applies to `*Env` fields.

## Runbook

- **Package locally** (a convenience, never a gate): `pnpm package:app` — same `tauri build`, artifacts land under `src-tauri/target/release/bundle/`.
- **Regenerate icons**: `pnpm icons:gen` — rebuilds `src-tauri/icons/` from the deterministic placeholder source; a real product swaps in its own 1024×1024 PNG in `scripts/icon-gen.mjs`.
- **Bump the shell toolchain**: edit the exact pins in `src-tauri/Cargo.toml`, run `cargo update --workspace` in `src-tauri/` to rewrite `Cargo.lock`, and let `shell:verify` + `cargo check --locked` confirm — the lockfile is the reproducibility contract (NFR-11).
- **Widen the shell surface** (a new permission, a CSP source, an updater): every one of these is a `shell:verify` **gate edit plus an ADR** by design — the gate's allowlist is the reviewed diff.
