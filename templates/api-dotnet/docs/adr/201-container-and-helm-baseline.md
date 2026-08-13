# ADR 201: One non-root image, one chart, values per environment

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The deploy targets are OpenShift and AKS plus generic Kubernetes, and a single-host compose mode for laptops and demos. OpenShift's restricted SCC assigns an **arbitrary UID** at admission, which breaks every image that assumes a particular UID as surely as one that assumes root. The same application must also not fork into per-platform charts, because two charts drift into two applications.

## Decision

**One image** (`Dockerfile`, multi-stage): a digest-pinned `mcr.microsoft.com/dotnet/sdk:10.0` build stage that copies the project files and their `packages.lock.json` first, restores with `--locked-mode` (a package the lock does not name fails the build rather than updating it, NFR-11), then copies the sources and `dotnet publish --no-restore`es them, so the locked graph stays authoritative and a source-only change re-uses the restore layer; and a digest-pinned `mcr.microsoft.com/dotnet/aspnet:10.0` as the runtime, carrying the published output on a runtime-only base — no SDK, no compiler, no source. The build stamps `GIT_SHA` into the environment, served back by the health kernel's `/version` — the probe and smoke target. The image is **non-root without pinning a UID**: `USER app` names the base image's own unprivileged user, the chart sets `runAsNonRoot: true` and deliberately no `runAsUser` (deploy:verify fails one), and the service writes nothing to disk — logs go to stdout, state lives in PostgreSQL, and the runtime's one scratch path (`/tmp`) is a pod `emptyDir`, never a writable image layer — so `readOnlyRootFilesystem: true` holds under any UID, including the arbitrary one OpenShift assigns over the named user. The composition root reads `PORT` and binds `0.0.0.0` itself, so the port is one declared variable rather than a framework-prefixed hosting convention.

**One chart** (`deploy/chart/`), differences confined to `deploy/chart/values/<env>.yaml`: replicas, exposure and hostnames vary; templates never do. The securityContext contract (non-root, no privilege escalation, all capabilities dropped, RuntimeDefault seccomp, read-only root) lives in base values and is asserted by `deploy:verify` on the effective values and on rendered manifests, against vendored schemas in `deploy/schemas/`. The pod's one runtime Secret is named in `envFromSecrets: [app-runtime]` and carries `DATABASE_URL` (the `postgres://` URL form the app translates for the provider) — a name in the tree, a value only in the cluster. Exposure is a toggle cross-checked against the environment's cluster type: `expose.kind: route` is OpenShift-only, an OpenShift environment uses route or none, and HSTS rides the TLS edge (Route annotation or ingress controller), the only place it is true. **Compose is local-only** (`deploy/compose/`): the same image with the same read-only constraints (tmpfs over `/tmp`) next to a digest-pinned PostgreSQL on one host, refused by `config:check` as soon as the chain grows past dev.

## Consequences

The image that passed dev's smoke is bit-identical to the one prod runs, on either platform, and "works on AKS, crashes on OpenShift" is caught by a gate instead of an admission controller. The cost: the runtime base carries the shared ASP.NET Core runtime, so the locked, published dependency set plus that base is the whole attack surface and the scan gate watches it — and the scratch path must be a declared mount rather than an assumption about a writable filesystem.

## Alternatives considered

Per-platform charts (drift into two applications); a hardcoded `runAsUser` (fights the SCC, needs per-namespace grants, and encodes an assumption the arbitrary-UID model exists to remove); shipping the SDK image as the runtime (a compiler, a restore cache and the sources in production for no runtime benefit); a self-contained or trimmed single-file publish (a bespoke runtime this repository would have to patch itself, instead of the serviced base image every security update reaches); restoring without `--locked-mode` in the image (the build would quietly resolve something the committed lock never named, which is the reproducibility promise inverted); baking the migration run into the entrypoint (couples schema changes to pod restarts; migrations are a deliberate pre-deploy step via `pnpm db:migrate` instead).
