# Deployment

The delivery chain is **declared once**, in `.proto-forge/config.json` under `environments{}`, and everything else is derived from that declaration: the per-environment values files under `deploy/chart/values/`, the table below, and the CD plan. `pnpm env:verify` fails the build the moment any copy drifts, so this page cannot quietly describe a chain that no longer exists. The template ships with **only `dev` enabled**; enabling `sit`, `uat`, `test` or `prod` is a reviewed config diff plus a values file — never a regeneration.

## Environments

The table between the markers is generated — edit the config, then run `node scripts/env-verify.mjs --write`. Hand-edits fail `env:verify`, which is the point: an operator reading this table is reading the config, not somebody's memory of it.

<!-- env-table:begin -->
| env | enabled | cluster.type | approval | url |
| --- | --- | --- | --- | --- |
| local | yes | — | — | http://localhost:5173 |
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
3. Every deploy ends with the smoke test (`node deploy/smoke.mjs --url <env-url> --expect-sha <sha>`): the release is not "done" until the new pod answers with the deployed commit's sha and the strict header set.

## DevSecOps stages

| Stage | Runs | Enforced by | On failure |
| --- | --- | --- | --- |
| verify | every push and PR | `.github/workflows/verify.yml` | the commit is not mergeable; nothing downstream runs |
| package (build → trivy scan → SBOM → push → cosign sign) | after green verify on `main` and on tags | `package.yml` (ships with the delivery pipelines) | no image is pushed; findings at or above `deployment.scan.severityThreshold` stop the release |
| deploy dev | after a successful package on `main` | `cd.yml` (ships with the delivery pipelines) | `helm --atomic` rolls back on its own; the smoke test failing fails the job loudly |
| promote (sit → uat → test → prod) | on tags, per enabled environment, in order | `cd.yml` (ships with the delivery pipelines) | the chain stops at the failing environment; earlier environments keep the release, later ones never see it |

`verify` itself never opens a socket: everything cluster-shaped it checks (`deploy:verify`) runs against the committed artefacts and vendored schemas, offline. The stages that do talk to registries and clusters are exactly the named workflow jobs above and nothing else.

## Secrets contract

Secret **values** exist only in the cluster (as `Secret` objects) and in CI (as GitHub environment secrets). The repository carries **names only**, in three places:

- `deploy/chart/values/<env>.yaml` → `envFromSecrets: []` lists the Secret object names the pod loads via `envFrom`. The platform team creates those Secrets in the environment's namespace before the first deploy; a deploy referencing a missing Secret fails visibly at rollout, which is the correct failure.
- `.proto-forge/config.json` → `environments.<env>.auth.*Env` fields name the **environment variables** CI reads to log in to the cluster (token, kubeconfig path, or the Azure OIDC triplet). `config:check` rejects anything in a `*Env` field that does not look like an env var name — a pasted credential fails the build before it can land.
- `.env.example` documents the app's own build-time keys, values empty or commented. `env:verify` fails any committed delivery file whose secret-shaped key carries a real value.

## Runbook

All commands run from the repository root; `<env>` is an enabled environment.

- **Deploy** (what CD runs, reproducible by an operator with cluster access): `helm upgrade --install <release> deploy/chart -f deploy/chart/values/<env>.yaml -n <namespace> --atomic --history-max 5 --set image.repository=<registry>/<app> --set image.digest=sha256:<digest>`
- **Verify a deploy landed**: `node deploy/smoke.mjs --url <env-url> --expect-sha <sha>` — asserts `/version.json` answers 200 with the expected sha and the strict security headers.
- **Roll back**: `helm rollback <release> -n <namespace>` (the previous release, kept by `--history-max`, which `deployment.helm.keepHistory` pins at 5). `--atomic` already rolls back a failed upgrade on its own.
- **Scale**: change `replicas` in the environment's values file and deploy — a reviewed diff. `kubectl scale` is for incidents; the next deploy resets it to the declared value.
- **Logs**: `kubectl logs -n <namespace> deploy/<release>` (OpenShift: `oc logs`). The container writes to stdout/stderr only; there are no log files in the pod, its filesystem is read-only.

## OpenShift vs AKS

- **UIDs**: OpenShift's restricted SCC assigns an **arbitrary UID** per namespace. The chart therefore sets `runAsNonRoot: true` and deliberately no `runAsUser` — `deploy:verify` fails a hardcoded UID. The image (`nginx-unprivileged`) runs unprivileged out of the box, and every path nginx writes is an `emptyDir` mount, so the arbitrary UID needs no filesystem tricks.
- **Exposure**: OpenShift terminates at a **Route** (`expose.kind: route`, TLS edge, HSTS via the router annotation); AKS and generic clusters use an **Ingress** (`expose.kind: ingress`, HSTS belongs to the ingress controller). `deploy:verify` cross-checks the kind against `environments.<env>.cluster.type` both ways, so a Route can never target an AKS cluster.
- **Login**: AKS authenticates via Azure **OIDC** federation (`auth.method: oidc` with the `azure*Env` names); OpenShift via a bearer token (`auth.method: token`, `oc login`); anything else via a kubeconfig context (`auth.method: kubeconfig`).

## Appendix: compose simple mode

`deployment.flavor: "compose"` trades the chain for one host: `docker compose -f deploy/compose/docker-compose.yml up --build` builds the same image (same Dockerfile, same digest-pinned bases, same read-only root filesystem with tmpfs mounts) and serves it on port 8080 with the same healthcheck target the cluster probes. It is the right mode for a laptop demo or a single VM. It cannot serve `sit` and beyond — `config:check` fails the combination — because promotion, approvals and rollback history are exactly the things a single host does not have.
