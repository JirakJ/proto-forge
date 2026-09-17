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

The desktop shell ships the strict CSP itself: `app.security.csp` in `src-tauri/tauri.conf.json` is held **byte-equal** to the set below by `shell:verify` (BR-37), so the packaged WebView runs under exactly the policy the gates measured. There is no TLS edge and no reverse proxy in a desktop app — the shell *is* the edge, which is why its configuration is a mandatory gate rather than a deployment note.

What the **preview server sets** (`vite.config.ts`) and the **shell replicates** (`tauri.conf.json`):

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
```

`Strict-Transport-Security` does not apply: the WebView loads the app from local bundle bytes, not over HTTP(S). Anything the app fetches remotely still rides `connect-src 'self'` — which for a bundled app means **no remote fetch at all** until a reviewed CSP widening (a `shell:verify` gate edit + ADR) says otherwise.

On `style-src 'unsafe-inline'`, honestly: React writes `style=""` **attributes** (the overlay anchor/fallback positioning), and `style-src-attr` accepts only `'unsafe-inline'` or `'unsafe-hashes'` — a nonce covers `<style>` elements, never attributes. Hardening styles further means removing style attributes from the components, not adding a nonce to this header.

## Supply chain (BRS §4.2)

- Lockfile (`pnpm-lock.yaml`) committed and verified with `--frozen-lockfile` in CI — the reproducibility contract (NFR-08).
- **SBOM**: every `sec:scan` emits a deterministic CycloneDX 1.5 JSON (`pnpm sbom` → `.proto-forge/sbom.cdx.json`, purl-sorted, no timestamp) from the installed production dep graph; CI uploads it as a release artifact.
- **Seed integrity (BRS §17.2)**: `.proto-forge/seed.lock` pins the vendored `@jj/proto-ui` tree by sha256; `snapshot:diff` re-verifies it every run. Upgrades are explicit (`pnpm seed:lock` + ADR).
- **Overrides**: `pnpm-workspace.yaml` is the single source — each pin carries its advisory id and drop condition inline. Currently force-resolved: `handlebars` (JS-injection batch, e.g. GHSA-2w6w-674q-4c4q), `js-yaml` (HIGH, prototype pollution), `nanoid` (HIGH, predictable ids), `brace-expansion`, `postcss`, `undici`, `qs` — all dev-only transitives that `pnpm audit --prod` does not see, flagged by osv-scanner.

## Shell and delivery (BR-37, ADR 203)

- **The shell surface is a mandatory gate**: `shell:verify` holds the CSP byte-equal to the documented set, every Tauri capability permission on an explicit in-gate allowlist (`core:default` only — the demo exposes no commands), the updater disabled-or-pinned, and the toolchain pinned exact with `Cargo.lock` committed (NFR-11). Widening any of it is a gate edit plus an ADR, never a config drive-by.
- **No IPC surface by default**: `src/lib.rs` registers no commands, so nothing native is reachable from the WebView; the command + capability pattern ships as a commented example, and using it re-opens exactly the reviewed doors above.
- **Packaging is a CI stage, never a gate** (NFR-16): `pnpm verify` bundles nothing; `.github/workflows/package.yml` builds unsigned per-OS artifacts from a green verify. Code signing and notarization requirements per OS — and the deliberate absence of signing secrets in the template — are documented in `docs/DELIVERY.md`.
- **Auto-update**: disabled in the template; the enable path (keypair, pinned pubkey + https endpoints, ADR) is in `docs/DELIVERY.md`, and `shell:verify` refuses any in-between state.

## Stated limits (ADR 203)

- **The tauri 2 linux GTK stack ships known RUSTSEC notices.** `Cargo.lock` carries the gtk3-rs binding crates (atk/gdk/gdkx11/gdkwayland/gtk/gtk3-macros 0.18, RUSTSEC-2024-0411…0420) which upstream has archived, glib 0.18's `VariantStrIter` unsoundness (RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g, MODERATE — the shell never constructs a Variant), and the unmaintained build-time transitives `proc-macro-error` + `unic-*`. None can be pinned away inside tauri 2.x (gtk 0.18 is the newest the stack accepts) and none is reachable service surface in a zero-command shell. The triage lives in `src-tauri/audit.toml` under the `.trivyignore` discipline — every entry reasoned and dated, `shell:verify` fails undated or expired entries — so the list re-reviews itself instead of fossilising.
- **The triage is stated in every scanner's dialect, from one source.** `audit.toml` is read by cargo-audit and by nothing else; osv-scanner — what CI and most host-level guardrails actually run — reads `osv-scanner.toml`, and without it reports the very advisories the ledger already triaged. A finding that reads "suppressed, reasoned, expiring" to one tool and "open" to the next is not triaged, it is merely quiet in one place. So `src-tauri/osv-scanner.toml` is **derived** from `audit.toml` (`pnpm osv:ignores`), never authored: one ledger (BR-15), one set of `until:` dates expiring in both tools at once, and `shell:verify` re-renders and compares on every run, so drift is a red gate rather than a discrepancy nobody notices.
- **gitleaks runs over the working tree** (`--no-git`), so build outputs (`src-tauri/target/`, `dist/`) and `node_modules/` are on the `.gitleaks.toml` allowlist: Rust `.rmeta` artifacts are high-entropy by construction and none of these paths is ever committed. The committed tree — including `.prompts/` — stays fully scanned.

## Reporting a vulnerability

Report privately through this repository's GitHub vulnerability reporting —
**Security → Report a vulnerability** on the repository page — and do not open a
public issue or attach a proof of concept to a pull request. If this repository is
not hosted on GitHub, replace this channel with the private one that applies;
`sec:conformance` fails when the section names no channel and no response window
(control `SEC-041`, SSDF RV.1.3).

| Step | Deadline |
| --- | --- |
| Acknowledgement of the report | 3 business days |
| Triage with a severity | 10 business days |
| Fix or documented mitigation for a confirmed high or critical finding | 30 days from triage |
| Fix for a confirmed medium or low finding | the next release |
| Coordinated disclosure | after the fix ships, or 90 days from the report, whichever is first |
