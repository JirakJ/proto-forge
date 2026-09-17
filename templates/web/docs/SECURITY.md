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

The shipped nginx runtime (`deploy/nginx/default.conf`, the image every environment runs) now **sets this strict header set itself**, per location, and `deploy/smoke.mjs` asserts it on `/version.json` after every deploy — so for the containerized path the headers are enforced, not merely documented. The list below remains the contract for any *other* edge (CDN, reverse proxy) put in front of the app.

What the **preview server actually sets** (`vite.config.ts` — replicate this at your edge/CDN/proxy):

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
```

What **only the deployment target can add** (no local server speaks TLS, so neither vite nor the in-pod nginx sets it — the Route annotation / ingress controller is the TLS edge):

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

On `style-src 'unsafe-inline'`, honestly: React writes `style=""` **attributes** (the overlay anchor/fallback positioning), and `style-src-attr` accepts only `'unsafe-inline'` or `'unsafe-hashes'` — a nonce covers `<style>` elements, never attributes. Hardening styles further means removing style attributes from the components, not adding a nonce to this header.

## Supply chain (BRS §4.2)

- Lockfile (`pnpm-lock.yaml`) committed and verified with `--frozen-lockfile` in CI — the reproducibility contract (NFR-08).
- **SBOM**: every `sec:scan` emits a deterministic CycloneDX 1.5 JSON (`pnpm sbom` → `.proto-forge/sbom.cdx.json`, purl-sorted, no timestamp) from the installed production dep graph; CI uploads it as a release artifact.
- **Seed integrity (BRS §17.2)**: `.proto-forge/seed.lock` pins the vendored `@jj/proto-ui` tree by sha256; `snapshot:diff` re-verifies it every run. Upgrades are explicit (`pnpm seed:lock` + ADR).
- **Overrides**: `pnpm-workspace.yaml` is the single source — each pin carries its advisory id and drop condition inline. Currently force-resolved: `handlebars` (JS-injection batch, e.g. GHSA-2w6w-674q-4c4q), `js-yaml` (HIGH, prototype pollution), `nanoid` (HIGH, predictable ids), `brace-expansion`, `postcss`, `undici`, `qs` — all dev-only transitives that `pnpm audit --prod` does not see, flagged by osv-scanner.

## Delivery pipeline

- **Image scan**: the pipeline scans every built image with trivy before pushing; findings at or above `deployment.scan.severityThreshold` (default `high`, i.e. HIGH + CRITICAL) fail the release. Suppressions live only in `.trivyignore`, each entry carrying `# reason: … until: YYYY-MM-DD` — `deploy:verify` fails undated and expired entries, so a suppression is a triaged decision that ends by itself.
- **Signing** (ships with the delivery pipelines): images are pushed by digest and signed with cosign **keyless** — the signature binds to the CI workflow identity, so there is no long-lived private key to leak — and CD verifies that identity before every deploy. `deployment.sign: false` removes the proof that what runs is what CI built; leave it on.
- **SBOM**: the image build attaches a CycloneDX SBOM to the pushed artifact, complementing the source-level SBOM `sec:scan` emits.
- **Offline verify**: none of the above runs inside `pnpm verify` — `deploy:verify` proves the committed deploy surface (digest pins, securityContext contract, rendered-manifest validation against schemas vendored in `deploy/schemas/`) without opening a socket; the cluster-touching steps are named CI stages in the delivery workflows and nothing else (ADR 202).

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
