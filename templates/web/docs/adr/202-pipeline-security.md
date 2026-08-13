# ADR 202: The pipeline scans, signs and verifies — and verify stays offline

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

A delivery pipeline is an attack surface: it holds credentials, produces the bytes production runs, and its failures are invisible until exploited. The existing gate corpus has a hard rule worth defending — `pnpm verify` never opens a socket — and the delivery machinery must not erode it, while still proving real things about images, manifests and clusters.

## Decision

**Verify stays offline.** Everything `verify` checks about delivery (`deploy:verify`, `env:verify`) runs against committed artefacts: Dockerfile digest pins, compose healthchecks, the values securityContext contract, exposure-versus-cluster cross-checks, and rendered manifests validated by kubeconform against schemas **vendored** in `deploy/schemas/` — no schema download, no cluster call. External binaries follow the `sec:scan` gitleaks pattern: enforced when installed, one loud note locally when not, and a hard failure in CI, so a missing tool can never silently skip a check. Anything that must touch the network — image build, trivy scan at `deployment.scan.severityThreshold`, SBOM attach, cosign keyless signing, push, deploy, smoke — is a **named CI stage** in the delivery workflows (`package.yml`, `cd.yml`), never a side effect of verify.

**Provenance reaches the cluster.** Images are pushed by digest, signed keyless (`deployment.sign`), and CD verifies the signature identity before `helm upgrade --atomic` — so what runs is provably what CI built from a green verify. Suppressing an image-scan finding takes a `.trivyignore` entry carrying `# reason: … until: YYYY-MM-DD`; `deploy:verify` fails undated and expired entries, so a suppression is a triaged, expiring decision, not a permanent blindfold. The smoke test (`deploy/smoke.mjs`) closes the loop: after every deploy it asserts `/version.json` answers with the deployed sha and the strict header set.

## Consequences

A laptop with no docker, no helm and no network still runs the full verify honestly — reduced scope is announced, never silent. CI proves the stronger claims. The cost is discipline at the boundary: new delivery checks must decide which side of the socket they live on, and cluster-touching logic can never ride along inside a gate.

## Alternatives considered

Live cluster checks in verify (fails the offline doctrine, makes verify flaky and credential-hungry); downloading schemas at gate time (a network dependency wearing an offline mask); key-pair signing (a long-lived private key to leak — keyless binds the signature to the workflow identity instead); permanent scan-suppression lists (every list only ever grows; expiry forces re-triage).
