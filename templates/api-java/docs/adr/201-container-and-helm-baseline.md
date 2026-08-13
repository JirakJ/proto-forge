# ADR 201: One non-root image, one chart, values per environment

- Status: accepted
- Date: 2026-08-13
- Prompt-log: .prompts/0001-scaffold.md

## Context

The deploy targets are OpenShift and AKS plus generic Kubernetes, and a single-host compose mode for laptops and demos. OpenShift's restricted SCC assigns an **arbitrary UID** at admission, which breaks every image that assumes a particular UID as surely as one that assumes root. The same application must also not fork into per-platform charts, because two charts drift into two applications.

## Decision

**One image** (`Dockerfile`, multi-stage): a digest-pinned `eclipse-temurin:21-jdk` build stage in which the checksum-pinned Gradle wrapper builds the boot jar under `dependencyLocking` (a resolution `gradle.lockfile` does not name fails the build); and a digest-pinned `registry.access.redhat.com/ubi9/openjdk-21-runtime` as the runtime, carrying only the jar. The build stamps `GIT_SHA` into the environment, served back by the health kernel's `/version` — the probe and smoke target. The image is **non-root without naming a UID**: the UBI runtime base ships unprivileged with group-0 permissions and is arbitrary-UID-safe out of the box, so there is deliberately no `USER` directive; the chart sets `runAsNonRoot: true` and deliberately no `runAsUser` (deploy:verify fails one). The JVM's one writable path (`/tmp`, `java.io.tmpdir`) is a pod `emptyDir` — never a writable image layer — so `readOnlyRootFilesystem: true` holds under any UID; logs go to stdout, state lives in PostgreSQL.

**One chart** (`deploy/chart/`), differences confined to `deploy/chart/values/<env>.yaml`: replicas, exposure and hostnames vary; templates never do. The securityContext contract (non-root, no privilege escalation, all capabilities dropped, RuntimeDefault seccomp, read-only root) lives in base values and is asserted by `deploy:verify` on the effective values and on rendered manifests, against vendored schemas in `deploy/schemas/`. The pod's one runtime Secret is named in `envFromSecrets: [app-runtime]` and carries `DATABASE_URL` (the JDBC form) — a name in the tree, a value only in the cluster. Exposure is a toggle cross-checked against the environment's cluster type: `expose.kind: route` is OpenShift-only, an OpenShift environment uses route or none, and HSTS rides the TLS edge (Route annotation or ingress controller), the only place it is true. **Compose is local-only** (`deploy/compose/`): the same image with the same read-only constraints (tmpfs over `/tmp`) next to a digest-pinned PostgreSQL on one host, refused by `config:check` as soon as the chain grows past dev.

## Consequences

The image that passed dev's smoke is bit-identical to the one prod runs, on either platform, and "works on AKS, crashes on OpenShift" is caught by a gate instead of an admission controller. The cost: the JVM needs a real memory envelope (the values carry JVM-sized limits, not the slim-runtime defaults) and its tmpdir must be a declared mount — both are constraints worth keeping.

## Alternatives considered

Per-platform charts (drift into two applications); a hardcoded `runAsUser` (fights the SCC, needs per-namespace grants, and encodes an assumption the arbitrary-UID model exists to remove); a JRE-on-Debian runtime (the UBI runtime base is arbitrary-UID-safe out of the box and matches the OpenShift target's own lineage); a jlink-minimized custom runtime (marginal size win for a bespoke, harder-to-patch base); baking the Flyway run into the entrypoint (couples schema changes to pod restarts; migrations are a deliberate pre-deploy step via `./gradlew dbMigrate` instead).
