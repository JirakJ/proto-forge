# ADR 203: The desktop shell is Tauri 2, its security posture is configuration under a gate, and packaging is a CI stage

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0002-desktop-shell.md

## Context

The prototype ships as a desktop application. The UI half is settled — it is the web template, carried whole: the byte-pinned `@jj/proto-ui` seed, the i18n/testid/layer/overlay/docs/coverage/mutation gate corpus, the harness and the browser suite all transfer unchanged, because a WebView renders the same DOM the gates already prove. What a desktop target adds is exactly one thing: a **shell** — a native process that owns the window, the WebView's security policy, the OS permission surface and the update channel. Every historical desktop-app disaster lives in that shell: a disabled isolation flag, a drive-by widened permission, an unsigned update feed. None of it is code the app gates can see, all of it is configuration.

Two shells were considered: **Tauri 2** (Rust host, system WebView, capability-based permissions) and **Electron** (Node host, bundled Chromium). Both are viable; proto-forge ships both as separate templates. This template records the Tauri choice: the capability model makes "the permission surface" a small, committed JSON file rather than a set of runtime flags, the host language boundary means no Node API can leak into the renderer by default, and the bundle sizes stay a fraction of a bundled Chromium. The prices are honest too: a Rust toolchain enters the pin surface, and the system WebView means the rendering engine varies by OS version.

## Decision

**The shell's security posture is configuration under a gate (BR-37).** `scripts/shell-verify.mjs` — the `shell` gate, mandatory, in `MANDATORY_GATES` — holds four surfaces still on every verify:

- **CSP**: `app.security.csp` in `tauri.conf.json` must be byte-equal to the strict web set documented in `docs/SECURITY.md` (the same policy the preview server sets). A WebView is not a reason to relax; widening it (e.g. `ipc:` in connect-src for a real command consumer) is a gate edit plus an ADR.
- **Capabilities**: every permission any `src-tauri/capabilities/*.json` file grants must be on the explicit allowlist **inside the gate** — shipped as `["core:default"]` and nothing else, because the demo exposes no commands (`src/lib.rs` carries the command+capability pattern as a commented example, not as live surface). A new permission is a reviewed gate edit + ADR: the diff review sees is the diff the attack surface grows by.
- **Updater**: disabled (`bundle.createUpdaterArtifacts: false`, no `plugins.updater`) or fully pinned (pubkey + https-only endpoints) — nothing in between. The posture and the enabling sequence live in `docs/DELIVERY.md`.
- **Toolchain pins (NFR-11)**: `Cargo.lock` committed, `tauri`/`tauri-build` pinned exact in `Cargo.toml`, `@tauri-apps/cli` pinned exact in `package.json`. The gate's tool half runs `cargo check --locked` when cargo is installed (the tool-gating pattern: noted when absent locally, mandatory in CI, where the pinned toolchain is installed).

**Packaging is a CI stage, never a gate (NFR-16).** `pnpm verify` stays offline and bundles nothing; `.github/workflows/package.yml` builds unsigned per-OS artifacts (macOS/Windows/Linux matrix) from a green verify and holds no signing secrets — signing and notarization are release-channel concerns documented in `docs/DELIVERY.md`, never template defaults.

**The browser suite runs against vite preview, not the packaged shell — stated, not hidden.** `pnpm test:e2e` (including the overlay-layering proofs) drives Chromium against the same built bundle the budget measures. That proves the entire app half offline on every verify. It deliberately does **not** prove the packaged WebView: a packaged-app smoke test belongs to the packaging stage, where a bundle exists to smoke. The shell half that verify *can* prove offline — the configuration — is exactly what `shell:verify` proves.

## Consequences

- The web gate corpus applies unmodified; a desktop prototype meets the same coverage/mutation/i18n/layering bar as a web one.
- `env`/`deploy`/`client` gates do not exist here — there is no promotion chain to declare and no recorded API contract to derive a client from; `shell` takes their place in `MANDATORY_GATES` (15 gates).
- Shell drift is deliberately **absent from the healing registry**: a flipped flag or widened permission is a decision wearing a gate name, never a stale derivation — it escalates to a human.
- A rust toolchain joins the fresh-machine preflight (`docs/TROUBLESHOOTING.md`); without it the gate's static half still enforces everything file-shaped.
