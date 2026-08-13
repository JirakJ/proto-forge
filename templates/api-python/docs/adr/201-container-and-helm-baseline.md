# ADR 201: One non-root image, one chart, values per environment

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The deploy targets are OpenShift and AKS plus generic Kubernetes, and a single-host compose mode for laptops and demos. OpenShift's restricted SCC assigns an **arbitrary UID** at admission, which breaks every image that assumes a particular UID as surely as one that assumes root. The same application must also not fork into per-platform charts, because two charts drift into two applications.

## Decision

**One image** (`Dockerfile`, multi-stage): a digest-pinned `python:3.12-slim` build stage carrying the digest-pinned `uv` binary (copied from its distroless image — the same resolver that wrote `uv.lock`), which `uv sync --frozen --no-dev --no-editable`s the app INTO `/app/.venv` as a built package; and the same digest-pinned `python:3.12-slim` as the runtime, carrying only that virtualenv. The build stamps `GIT_SHA` into the environment, served back by the health kernel's `/version` — the probe and smoke target. The image is **non-root without pinning a UID**: `USER app` names a created system user, the chart sets `runAsNonRoot: true` and deliberately no `runAsUser` (deploy:verify fails one), and the service writes nothing to disk — logs go to stdout, state lives in PostgreSQL, and Python skips bytecode caching when `__pycache__` is unwritable — so `readOnlyRootFilesystem: true` holds under any UID, including the arbitrary one OpenShift assigns over the named user.

**One chart** (`deploy/chart/`), differences confined to `deploy/chart/values/<env>.yaml`: replicas, exposure and hostnames vary; templates never do. The securityContext contract (non-root, no privilege escalation, all capabilities dropped, RuntimeDefault seccomp, read-only root) lives in base values and is asserted by `deploy:verify` on the effective values and on rendered manifests, against vendored schemas in `deploy/schemas/`. The pod's one runtime Secret is named in `envFromSecrets: [app-runtime]` and carries `DATABASE_URL` — a name in the tree, a value only in the cluster. Exposure is a toggle cross-checked against the environment's cluster type: `expose.kind: route` is OpenShift-only, an OpenShift environment uses route or none, and HSTS rides the TLS edge (Route annotation or ingress controller), the only place it is true. **Compose is local-only** (`deploy/compose/`): the same image with the same read-only constraints next to a digest-pinned PostgreSQL on one host, refused by `config:check` as soon as the chain grows past dev.

## Consequences

The image that passed dev's smoke is bit-identical to the one prod runs, on either platform, and "works on AKS, crashes on OpenShift" is caught by a gate instead of an admission controller. The cost: all writable state must live behind a declared seam (the database), and the runtime carries a Python interpreter — so the locked, dev-free dependency set is the whole attack surface and the scan gate watches it.

## Alternatives considered

Per-platform charts (drift into two applications); a hardcoded `runAsUser` (fights the SCC, needs per-namespace grants, and encodes an assumption the arbitrary-UID model exists to remove); installing uv via curl-pipe or pip at build time (unpinned bytes deciding what ships — the vendored distroless copy is digest-pinned like every base); an editable install with `src/` copied alongside (two things to copy and keep aligned; the built package makes the venv self-contained); baking `alembic upgrade head` into the entrypoint (couples schema changes to pod restarts; migrations are a deliberate pre-deploy step instead).
