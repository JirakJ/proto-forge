# ADR 203: The desktop shell is Electron, its security posture is configuration under a gate, and packaging is a CI stage

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0002-desktop-shell.md

## Context

The prototype ships as a desktop application. The UI half is settled — it is the web template, carried whole: the byte-pinned `@jj/proto-ui` seed, the i18n/testid/layer/overlay/docs/coverage/mutation gate corpus, the harness and the browser suite all transfer unchanged, because the shell renders the same DOM the gates already prove. What a desktop target adds is exactly one thing: a **shell** — a native process that owns the window, the renderer's security policy, the OS surface and the update channel. Every historical desktop-app disaster lives in that shell: `nodeIntegration` left on, a preload leaking `require` into the page, an unsigned update feed. None of it is code the app gates can see, all of it is configuration.

Two shells were considered: **Tauri 2** (Rust host, system WebView) and **Electron** (Node host, bundled Chromium). Both are viable; proto-forge ships both as separate templates. This template records the Electron choice: one rendering engine on every OS (the bundled Chromium — no per-OS WebView drift), a pure JS/TS toolchain with no second language in the pin surface, and the deepest ecosystem of packagers and updaters. The prices are honest too: the bundle carries a full Chromium (hundreds of MB), the electron binary downloads at install time, and the renderer sits one flipped boolean away from a Node runtime — which is exactly why the flags are a gate, not a convention.

## Decision

**The shell's security posture is configuration under a gate (BR-37).** `scripts/shell-verify.mjs` — the `shell` gate, mandatory, in `MANDATORY_GATES` — reads `src-electron/` **mechanically** (regex over comment-stripped source, the opid-scan pattern; nothing is evaluated) and holds five surfaces still on every verify:

- **The isolation contract**: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, `allowRunningInsecureContent: false` — each must appear with its **literal** safe value, and any occurrence with a different or dynamic value fails. A flag the gate cannot read as a literal is treated as flipped.
- **CSP**: the strict web set documented in `docs/SECURITY.md` (byte-equal, modulo string concatenation) must be injected on every response via `session.defaultSession.webRequest.onHeadersReceived` — the built bundle loads from `file:` with no server to send headers, so the shell stamps the same policy the vite preview server sends.
- **Navigation lock**: a `will-navigate` guard pinning every webContents to the app origin plus `setWindowOpenHandler` denying every popup — no renderer can ever become a second, unlocked shell. The `remote` module does not exist in current Electron and nothing re-enables its successor patterns.
- **The preload bridge**: `src-electron/preload.ts` exposes **nothing** — the typed-bridge pattern ships as a commented example. The gate fails a bare `window.… =` assignment; the only legal door is `contextBridge.exposeInMainWorld`.
- **Packager + pins (NFR-11)**: `electron-builder.yml` parses, `asar: true`, `publish` declared and `null`; `electron` and `electron-builder` pinned **exact** in `package.json` (the gate rejects `^`), `esbuild` pinned exact alongside them, `main` pointing at the built shell under `dist-electron/`.

**Verify never needs the electron binary.** The binary downloads at `pnpm install` time (fine locally, where the network exists), but `shell:verify` is fully static and the rest of the chain runs against vite preview — a `verify` on a machine where the download failed still proves everything it claims to prove (NFR-16).

**Packaging is a CI stage, never a gate (NFR-16).** `pnpm verify` bundles nothing; `.github/workflows/package.yml` builds unsigned per-OS artifacts (macOS/Windows/Linux matrix, `electron-builder --publish never`, `CSC_IDENTITY_AUTO_DISCOVERY=false`) from a green verify and holds no signing secrets — signing and notarization are release-channel concerns documented in `docs/DELIVERY.md`, never template defaults.

**The browser suite runs against vite preview in Chromium, not the packaged shell — stated, not hidden.** `pnpm test:e2e` (including the overlay-layering proofs) drives the same built bundle the budget measures, in the same engine family Electron bundles. That proves the entire app half offline on every verify. It deliberately does **not** prove the packaged app: a packaged-app smoke test — launching the built bundle, asserting the window comes up with the CSP and the locks live — belongs to the packaging stage, where a bundle exists to smoke. The shell half that verify *can* prove offline — the configuration — is exactly what `shell:verify` proves.

## Consequences

- The web gate corpus applies unmodified; a desktop prototype meets the same coverage/mutation/i18n/layering bar as a web one.
- `env`/`deploy`/`client` gates do not exist here — there is no promotion chain to declare and no recorded API contract to derive a client from; `shell` takes their place in `MANDATORY_GATES` (15 gates).
- Shell drift is deliberately **absent from the healing registry**: a flipped flag or a widened bridge is a decision wearing a gate name, never a stale derivation — it escalates to a human.
- The electron download joins the known install-time failure classes (`docs/TROUBLESHOOTING.md`: proxy/mirror row); verify stays green without the binary, packaging does not.
