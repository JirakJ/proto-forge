# Security

The prototype is treated as internet-facing from commit one. Controls are enforced by gates (`pnpm sec:scan`, lint), not reviewer memory.

## Application controls (BRS §4.1)

- **Output encoding** — raw HTML only via `src/shared/SafeHtml.tsx` (DOMPurify). `react/no-danger` + `no-unsanitized/*` ban it everywhere else.
- **Input validation** — all external input (env, form data, storage, API responses) validated with zod at the boundary.
- **CSP** — `default-src 'self'`; the **preview** server (built bundle) ships the strict `script-src 'self'`. The **dev** server deliberately relaxes script-src (`'unsafe-inline' 'unsafe-eval'`) for HMR/react-refresh and is not the security model (see `vite.config.ts`).
- **Secrets** — none in the repo. Config via `.env` (git-ignored) + `src/config/env.ts`. `gitleaks` gate over the whole tree including `.prompts/`.
- **Dependencies** — `pnpm audit --audit-level=high` fails the build on high/critical advisories.
- **Client storage** — sensitive data never in `localStorage`; only non-sensitive UI state.

## Production headers (set at the deployment target)

What the **preview server actually sets** (`vite.config.ts` — replicate this at your edge/CDN/proxy):

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
```

What **only the deployment target can add** (no local server speaks TLS, so vite never sets it):

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

On `style-src 'unsafe-inline'`, honestly: React writes `style=""` **attributes** (the overlay anchor/fallback positioning), and `style-src-attr` accepts only `'unsafe-inline'` or `'unsafe-hashes'` — a nonce covers `<style>` elements, never attributes. Hardening styles further means removing style attributes from the components, not adding a nonce to this header.

## Supply chain (BRS §4.2)

- Lockfile (`pnpm-lock.yaml`) committed and verified with `--frozen-lockfile` in CI — the reproducibility contract (NFR-08).
- **SBOM**: every `sec:scan` emits a deterministic CycloneDX 1.5 JSON (`pnpm sbom` → `.proto-forge/sbom.cdx.json`, purl-sorted, no timestamp) from the installed production dep graph; CI uploads it as a release artifact.
- **Seed integrity (BRS §17.2)**: `.proto-forge/seed.lock` pins the vendored `@jj/proto-ui` tree by sha256; `snapshot:diff` re-verifies it every run. Upgrades are explicit (`pnpm seed:lock` + ADR).
- **Overrides**: `pnpm-workspace.yaml` is the single source — each pin carries its advisory id and drop condition inline. Currently force-resolved: `handlebars` (JS-injection batch, e.g. GHSA-2w6w-674q-4c4q), `js-yaml` (HIGH, prototype pollution), `nanoid` (HIGH, predictable ids), `brace-expansion`, `postcss`, `undici`, `qs` — all dev-only transitives that `pnpm audit --prod` does not see, flagged by osv-scanner.
