# ADR 201: One non-root image, one chart, values per environment

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The deploy targets are OpenShift and AKS plus generic Kubernetes, and a single-host compose mode for laptops and demos. OpenShift's restricted SCC assigns an **arbitrary UID** at admission, which breaks every image that assumes "I am uid 101" as surely as one that assumes root. The same application must also not fork into per-platform charts, because two charts drift into two applications.

## Decision

**One image** (`Dockerfile`, multi-stage): a digest-pinned `node:22-slim` build stage that never ships, and a digest-pinned `nginxinc/nginx-unprivileged:stable-alpine` runtime on port 8080 carrying only static bytes plus `deploy/nginx/default.conf` — which serves the SPA fallback and the same strict header set `docs/SECURITY.md` documents. The build stamps `GIT_SHA` into `/version.json`, the probe and smoke target. The image is **non-root without naming a UID**: no `USER` override, `runAsNonRoot: true`, deliberately no `runAsUser` (deploy:verify fails one), and every path nginx writes (`/tmp`, `/var/cache/nginx`, `/var/run`) is a pod `emptyDir` — never a writable image layer — so `readOnlyRootFilesystem: true` holds under any UID.

**One chart** (`deploy/chart/`), differences confined to `deploy/chart/values/<env>.yaml`: replicas, exposure and hostnames vary; templates never do. The securityContext contract (non-root, no privilege escalation, all capabilities dropped, RuntimeDefault seccomp, read-only root) lives in base values and is asserted by `deploy:verify` on the effective values and on rendered manifests, against vendored schemas in `deploy/schemas/`. Exposure is a toggle cross-checked against the environment's cluster type: `expose.kind: route` is OpenShift-only, an OpenShift environment uses route or none, and HSTS rides the TLS edge (Route annotation or ingress controller), the only place it is true. **Compose is local-only** (`deploy/compose/`): the same image with the same read-only constraints on one host, refused by `config:check` as soon as the chain grows past dev.

## Consequences

The image that passed dev's smoke is bit-identical to the one prod runs, on either platform, and "works on AKS, crashes on OpenShift" is caught by a gate instead of an admission controller. The cost: nginx cannot bind 80 (8080 everywhere), and all writable state must be declared as a mount — both are constraints worth keeping.

## Alternatives considered

Per-platform charts (drift into two applications); `runAsUser: 101` (fights the SCC, needs per-namespace grants, and encodes an assumption the arbitrary-UID model exists to remove); root nginx dropping privileges (a root process in the container is exactly what admission policies reject); serving from the node build stage (ships a JS runtime and a package manager as attack surface for static files).
