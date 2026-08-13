# Security

The prototype is treated as internet-facing from commit one. Controls are enforced by gates (`pnpm sec:scan`, lint), not reviewer memory.

## Application controls (BRS §4.1)

- **Output encoding** — raw HTML only via `src/shared/SafeHtml.tsx` (DOMPurify). `react/no-danger` + `no-unsanitized/*` ban it everywhere else.
- **Input validation** — all external input (env, form data, storage, API responses) validated with zod at the boundary.
- **CSP** — `default-src 'self'`; the **preview** server (built bundle) ships the strict `script-src 'self'`. The **dev** server deliberately relaxes script-src (`'unsafe-inline' 'unsafe-eval'`) for HMR/react-refresh and is not the security model (see `vite.config.ts`).
- **Secrets** — none in the repo. Config via `.env` (git-ignored) + `src/config/env.ts`. `gitleaks` gate over the whole tree including `.prompts/`.
- **Dependencies** — `pnpm audit --audit-level=high` fails the build on high/critical advisories.
- **Client storage** — sensitive data never in `localStorage`; only non-sensitive UI state.

## The shell enforces the same policy the preview server sets

The desktop shell ships the strict CSP itself: `src-electron/main.ts` injects the set below onto **every response** via `session.defaultSession.webRequest.onHeadersReceived`, and `shell:verify` (BR-37) holds the policy byte-equal — the built bundle loads from `file:` with no server to send headers, so the shell is the header source. There is no TLS edge and no reverse proxy in a desktop app — the shell *is* the edge, which is why its configuration is a mandatory gate rather than a deployment note.

What the **preview server sets** (`vite.config.ts`) and the **shell injects** (`src-electron/main.ts`):

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
```

`Strict-Transport-Security` does not apply: the renderer loads the app from local bundle bytes, not over HTTP(S). Anything the app fetches remotely still rides `connect-src 'self'` — which for a bundled app means **no remote fetch at all** until a reviewed CSP widening (a `shell:verify` gate edit + ADR) says otherwise.

On `style-src 'unsafe-inline'`, honestly: React writes `style=""` **attributes** (the overlay anchor/fallback positioning), and `style-src-attr` accepts only `'unsafe-inline'` or `'unsafe-hashes'` — a nonce covers `<style>` elements, never attributes. Hardening styles further means removing style attributes from the components, not adding a nonce to this header.

## Supply chain (BRS §4.2)

- Lockfile (`pnpm-lock.yaml`) committed and verified with `--frozen-lockfile` in CI — the reproducibility contract (NFR-08).
- **SBOM**: every `sec:scan` emits a deterministic CycloneDX 1.5 JSON (`pnpm sbom` → `.proto-forge/sbom.cdx.json`, purl-sorted, no timestamp) from the installed production dep graph; CI uploads it as a release artifact.
- **Seed integrity (BRS §17.2)**: `.proto-forge/seed.lock` pins the vendored `@jj/proto-ui` tree by sha256; `snapshot:diff` re-verifies it every run. Upgrades are explicit (`pnpm seed:lock` + ADR).
- **Overrides**: `pnpm-workspace.yaml` is the single source — each pin carries its advisory id and drop condition inline. Currently force-resolved: `handlebars` (JS-injection batch, e.g. GHSA-2w6w-674q-4c4q), `js-yaml` (HIGH, prototype pollution), `nanoid` (HIGH, predictable ids), `brace-expansion`, `postcss`, `undici`, `qs` — all dev-only transitives that `pnpm audit --prod` does not see, flagged by osv-scanner.

## Shell and delivery (BR-37, ADR 203)

- **The shell surface is a mandatory gate**: `shell:verify` mechanically holds the five isolation flags (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`, `allowRunningInsecureContent: false`) to their literal safe values with no dynamic override, the CSP injection present and byte-equal, the navigation lock (`will-navigate` + `setWindowOpenHandler` deny) in place, and the packager pinned (`asar: true`, `publish: null`, exact versions, NFR-11). Widening any of it is a gate edit plus an ADR, never a config drive-by.
- **No bridge surface by default**: `src-electron/preload.ts` exposes nothing — the gate fails a bare `window.… =` assignment, and the only legal door is `contextBridge.exposeInMainWorld`; the typed-bridge pattern ships as a commented example, and using it re-opens exactly the reviewed doors above.
- **Packaging is a CI stage, never a gate** (NFR-16): `pnpm verify` bundles nothing and never needs the electron binary (shell:verify is static); `.github/workflows/package.yml` builds unsigned per-OS artifacts from a green verify with `CSC_IDENTITY_AUTO_DISCOVERY=false`. Code signing and notarization requirements per OS — and the deliberate absence of signing secrets in the template — are documented in `docs/DELIVERY.md`.
- **Auto-update**: no feed in the template (`publish: null`, `--publish never` everywhere); the enable path (feed, signing-first, ADR) is in `docs/DELIVERY.md`, and `shell:verify` refuses any in-between state.

## Stated limits (ADR 203)

- **The shell binary is a bundled Chromium.** Electron's own release cadence is the patch channel for renderer CVEs: the exact-pinned `electron` version is the reviewed dial, and bumping it promptly IS the security process — there is no system-WebView auto-patching underneath. The pin makes the review visible; staleness makes it red at review time, not silently at runtime.
- **gitleaks runs over the working tree** (`--no-git`), so build outputs (`dist/`, `dist-electron/`, `release/`) and `node_modules/` are on the `.gitleaks.toml` allowlist: packaged installers and the installed tree are high-entropy by construction and none of these paths is ever committed. The committed tree — including `.prompts/` — stays fully scanned.
