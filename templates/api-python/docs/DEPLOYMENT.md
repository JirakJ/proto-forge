# Deployment

The delivery chain is **declared once**, in `.proto-forge/config.json` under `environments{}`, and everything else is derived from that declaration: the per-environment values files under `deploy/chart/values/`, the table below, and the CD plan. `pnpm env:verify` fails the build the moment any copy drifts, so this page cannot quietly describe a chain that no longer exists. The template ships with **only `dev` enabled**; enabling `sit`, `uat`, `test` or `prod` is a reviewed config diff plus a values file — never a regeneration.

## Environments

The table between the markers is generated — edit the config, then run `node scripts/env-verify.mjs --write`. Hand-edits fail `env:verify`, which is the point: an operator reading this table is reading the config, not somebody's memory of it.

<!-- env-table:begin -->
| env | enabled | cluster.type | approval | url |
| --- | --- | --- | --- | --- |
| local | yes | — | — | http://localhost:3000 |
| dev | yes | generic | none | — |
| sit | no | generic | none | — |
| uat | no | generic | required | — |
| test | no | generic | required | — |
| prod | no | generic | required | — |
<!-- env-table:end -->

`local` is the developer's machine and never part of promotion. The remote order is fixed — `dev → sit → uat → test → prod` (`ENV_ORDER` in `scripts/config.mjs`) — and the promotion chain is the enabled subset of it, in that order. `prod` can never be the first enabled environment, and `prod` without required approval is a config error, not a policy choice.

## Promotion flow

One image is built per commit and **promoted, never rebuilt** — what was verified is what runs, all the way up.

1. A push to `main` that passes `verify` builds, scans, signs and pushes the image, then deploys it to **dev** automatically (dev carries `approval: none`).
2. A tag `v*` walks the whole enabled chain in order. Each environment with `approval: "required"` maps to a GitHub environment with required reviewers — the deploy job blocks until a human approves it in the GitHub UI, and the pipeline preflights via the GitHub API that the protection rules actually exist rather than trusting the label.
3. Every deploy ends with the smoke test (`node deploy/smoke.mjs --url <env-url> --expect-sha <sha>`): the release is not "done" until the new pod answers `/healthz` and `/version` with the deployed commit's sha and the strict header set.

## DevSecOps stages

| Stage | Runs | Enforced by | On failure |
| --- | --- | --- | --- |
| verify | every push and PR | `.github/workflows/verify.yml` | the commit is not mergeable; nothing downstream runs |
| package (build → trivy scan → SBOM → push → cosign sign) | after green verify on `main` and on tags | `.github/workflows/package.yml`: `plan` (from `scripts/deploy-cli.mjs`) → `docker buildx build` with `GIT_SHA` → `trivy image --ignore-unfixed --exit-code 1` at the plan's severity → CycloneDX image SBOM as an artifact → push (GHCR via `GITHUB_TOKEN`, ACR via Azure OIDC) → `cosign sign` + `cosign attest` of the SBOM, keyless | no image is pushed; findings at or above `deployment.scan.severityThreshold` stop the release |
| deploy dev | after a successful package on `main` | `.github/workflows/cd.yml` `dev` job: approval preflight (GitHub API) → digest resolution → `cosign verify` of the package.yml workflow identity → cluster login per `cluster.type` → `helm upgrade --install --atomic --history-max` → `deploy/smoke.mjs --expect-sha` | `helm --atomic` rolls back on its own; the smoke test failing fails the job loudly |
| promote (sit → uat → test → prod) | on tags, per enabled environment, in order | `.github/workflows/cd.yml` `sit`→`uat`→`test`→`prod` jobs — same steps as `dev`, chained by skip-tolerant `needs` (a disabled environment skips, `needs.<pred>.result == 'success' \|\| 'skipped'` lets the chain walk on) with GitHub environment protection as the human approval | the chain stops at the failing environment; earlier environments keep the release, later ones never see it |

`verify` itself never opens a socket: everything cluster-shaped it checks (`deploy:verify`) runs against the committed artefacts and vendored schemas, offline. The stages that do talk to registries and clusters are exactly the named workflow jobs above and nothing else.

## Secrets contract

Secret **values** exist only in the cluster (as `Secret` objects) and in CI (as GitHub environment secrets). The repository carries **names only**, in three places:

- `deploy/chart/values.yaml` → `envFromSecrets: [app-runtime]` names the one Secret this service loads via `envFrom`. **`app-runtime` must carry `DATABASE_URL`** — the PostgreSQL connection string for the environment's database (`postgresql://user:password@host:5432/dbname`; the persistence adapter normalizes it onto the pinned psycopg driver). The platform team creates it in the environment's namespace before the first deploy: `kubectl -n <namespace> create secret generic app-runtime --from-literal=DATABASE_URL=<url>`. A deploy referencing a missing Secret fails visibly at rollout, which is the correct failure.
- `.proto-forge/config.json` → `environments.<env>.auth.*Env` fields name the **environment variables** CI reads to log in to the cluster (token, kubeconfig path, or the Azure OIDC triplet). `config:check` rejects anything in a `*Env` field that does not look like an env var name — a pasted credential fails the build before it can land.
- `.env.example` documents the app's own runtime keys (the `Env` model fields in `src/app/config/env.py`), values empty or commented. `env:verify` fails any committed delivery file whose secret-shaped key carries a real value.

## GitHub environments: making `approval: required` real

`approval: "required"` in the config maps to a GitHub environment with required reviewers. The label alone protects nothing, so `cd.yml` preflights every protected deploy through the API (`GET /repos/{owner}/{repo}/environments/{env}`) and **fails the job when no protection rules exist** — with the exact commands to fix it. Create the protection once per environment (repo admin); `pnpm env:remote bootstrap --env <env>` prints the same commands:

```sh
gh api /users/<login> --jq .id   # the reviewer id
gh api --method PUT "/repos/<owner>/<repo>/environments/<env>" --input - <<'JSON'
{ "reviewers": [ { "type": "User", "id": <id> } ] }
JSON
```

The same GitHub environment holds the deploy credentials, under the **names** the config declares in `environments.<env>.auth.*Env`: the OpenShift token, the generic kubeconfig content, or the Azure OIDC triplet. AKS environments additionally carry two environment *variables* — `AKS_CLUSTER_NAME` and `AKS_RESOURCE_GROUP` — because `az aks get-credentials` addresses the cluster by its ARM names, which the config (which stores the API server URL for the operator tools) deliberately does not duplicate.

## Runbook

All commands run from the repository root; `<env>` is an enabled environment.

- **Migrate first, then deploy**: schema migrations run **before** the rollout that needs them (`alembic/versions/` is append-only, so the old release keeps working against the new schema): `DATABASE_URL=<env-db-url> pnpm db:migrate` — `uv run alembic upgrade head`, idempotent, recorded in `alembic_version`. The migration runner talks to the **database**, not the cluster; run it from a machine (or CI step) that can reach the environment's PostgreSQL.
- **Deploy** (what CD runs, reproducible by an operator with cluster access): `helm upgrade --install <release> deploy/chart -f deploy/chart/values/<env>.yaml -n <namespace> --atomic --history-max 5 --set image.repository=<registry>/<app> --set image.digest=sha256:<digest>`
- **Operator deploy, staged-first** (BR-28): `pnpm env:remote render --env <env>` writes an offline `helm template` to `.proto-forge/outbox/deploy-<env>/`; review it, then `pnpm env:remote deploy --env <env> --commit --approve`. The doors are `assertMayCommit`'s, mirrored — enabled env, a staged render, a named server, the network allowlist, approval (`--approve` or the committed `environments.<env>.autoDeploy`), auth env vars by name — plus a kubectl-context check that refuses a cluster the config does not name. `pnpm env:remote check|diff|status --env <env>` diagnose without mutating.
- **Redeploy one environment** (surgical, no chain): `gh workflow run cd.yml -f env=<env> -f ref=<sha-or-tag>` — deploys an image that was **already packaged** for that ref; the `plan` job fails fast when no successful `package.yml` run exists for it, so a redeploy can never trigger a rebuild.
- **Verify a deploy landed**: `node deploy/smoke.mjs --url <env-url> --expect-sha <sha>` — asserts `/healthz` answers, `/version` carries the expected sha, and the strict security headers ride the response.
- **Roll back**: `helm rollback <release> -n <namespace>` (the previous release, kept by `--history-max`, which `deployment.helm.keepHistory` pins at 5), or `pnpm env:remote rollback --env <env> --commit --approve [--revision N]`, which wraps the same command in the consent doors. `--atomic` already rolls back a failed upgrade on its own — the operator rollback is for releases that deployed green and went bad later. Migrations are append-only, so the previous release runs unmodified against the current schema.
- **Scale**: change `replicas` in the environment's values file and deploy — a reviewed diff. `kubectl scale` is for incidents; the next deploy resets it to the declared value.
- **Logs**: `kubectl logs -n <namespace> deploy/<release>` (OpenShift: `oc logs`). The container writes structured JSON to stdout only; there are no log files in the pod, its filesystem is read-only.

## OpenShift vs AKS

- **UIDs**: OpenShift's restricted SCC assigns an **arbitrary UID** per namespace. The chart therefore sets `runAsNonRoot: true` and deliberately no `runAsUser` — `deploy:verify` fails a hardcoded UID. The image's `USER app` names a user without pinning a number, the service writes nothing to disk (logs to stdout, state in PostgreSQL), and the chart's `emptyDir` mounts cover the conventional scratch paths, so the arbitrary UID needs no filesystem tricks and `readOnlyRootFilesystem: true` holds.
- **Exposure**: OpenShift terminates at a **Route** (`expose.kind: route`, TLS edge, HSTS via the router annotation); AKS and generic clusters use an **Ingress** (`expose.kind: ingress`, HSTS belongs to the ingress controller). `deploy:verify` cross-checks the kind against `environments.<env>.cluster.type` both ways, so a Route can never target an AKS cluster.
- **Login**: AKS authenticates via Azure **OIDC** federation (`auth.method: oidc` with the `azure*Env` names); OpenShift via a bearer token (`auth.method: token`, `oc login`); anything else via a kubeconfig context (`auth.method: kubeconfig`).

## Appendix: compose simple mode

`deployment.flavor: "compose"` trades the chain for one host: `pnpm env:local up` (or `docker compose -f deploy/compose/docker-compose.yml up --build`) builds the same image (same Dockerfile, same digest-pinned bases, same read-only root filesystem) and serves it on port 3000 next to a digest-pinned `postgres:16-alpine` with a named volume, a `pg_isready` healthcheck and `DATABASE_URL` wired service-to-service. The app healthcheck probes the same `/healthz` the cluster probes; `pnpm env:local seed` applies the alembic migrations to the compose database. The database password is a host env var reference (`${POSTGRES_PASSWORD:-app}`) with a local-only default — the committed file never carries a deployed credential. It is the right mode for a laptop demo or a single VM. It cannot serve `sit` and beyond — `config:check` fails the combination — because promotion, approvals and rollback history are exactly the things a single host does not have.
