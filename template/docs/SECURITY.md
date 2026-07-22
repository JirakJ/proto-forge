# Security

The prototype is treated as internet-facing from commit one. Controls are enforced by gates (`pnpm sec:scan`, lint), not reviewer memory.

## Application controls (BRS §4.1)

- **Output encoding** — raw HTML only via `src/shared/SafeHtml.tsx` (DOMPurify). `react/no-danger` + `no-unsanitized/*` ban it everywhere else.
- **Input validation** — all external input (env, form data, storage, API responses) validated with zod at the boundary.
- **CSP** — `default-src 'self'`, no `unsafe-inline` for scripts, shipped by the dev/preview servers (see `vite.config.ts`).
- **Secrets** — none in the repo. Config via `.env` (git-ignored) + `src/config/env.ts`. `gitleaks` gate over the whole tree including `.prompts/`.
- **Dependencies** — `pnpm audit --audit-level=high` fails the build on high/critical advisories.
- **Client storage** — sensitive data never in `localStorage`; only non-sensitive UI state.

## Production headers (set at the deployment target)

The dev/preview servers set these; replicate them at your edge/CDN/proxy:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'nonce-<generated>'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

Prod styles should move from `'unsafe-inline'` to a per-response nonce; the dev server allows inline styles only because Vite injects them.

## Supply chain (BRS §4.2)

- Lockfile (`pnpm-lock.yaml`) committed and verified with `--frozen-lockfile` in CI — the reproducibility contract (NFR-08).
- **SBOM**: every `sec:scan` emits a deterministic CycloneDX 1.5 JSON (`pnpm sbom` → `.proto-forge/sbom.cdx.json`, purl-sorted, no timestamp) from the installed production dep graph; CI uploads it as a release artifact.
- **Seed integrity (BRS §17.2)**: `.proto-forge/seed.lock` pins the vendored `@jj/proto-ui` tree by sha256; `snapshot:diff` re-verifies it every run. Upgrades are explicit (`pnpm seed:lock` + ADR).
- **Overrides**: `handlebars` is force-resolved to `^4.7.9` (dev-only chain via `eslint-plugin-boundaries@5 → @boundaries/elements`; 4.7.8 carries the 2026 JS-injection advisory batch, e.g. GHSA-2w6w-674q-4c4q, all fixed in 4.7.9). Drop the override when `eslint-plugin-boundaries` is bumped to ≥7, which pins 4.7.9 itself.
