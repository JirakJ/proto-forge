# ADR 019: The scalability floor — paginated collections, a perf-smoke stage

- Status: accepted
- Date: 2026-08-22
- Prompt-log: docs/specs/2026-08-22-production-output-bar-design.md (stated by the operator: "we care not only about functionality but about scalability, performance, security and above all fully optimized resource use")

## Context

The register already holds the deterministic halves of performance: the web
bundle budget (NFR-02), the backend dependency budget (NFR-13, which records
*why* micro-latency budgets on shared runners are noise), container resource
limits and probes on every rendered Deployment (NFR-15). Two gaps remained. The
demo list endpoint returned a top-level array — every generated service
inherited an unbounded collection, the classic scalability defect no unit test
catches because fixtures are small. And nothing anywhere *measured* a built
image: one that stopped booting, errored under load, regressed latency by an
order of magnitude or doubled in size sailed through every offline gate.

## Decision

**Collections are paginated, and the contract is where it is checked (NFR-29).**
`contract:verify` fails a GET whose 200 is a top-level array, and requires
`limit` plus `offset` or `cursor` query parameters on any GET whose 200 embeds
an array. The demo Note slice ships the envelope (`items`, `total`, `limit`,
`offset`), pages in the engine (LIMIT/OFFSET plus a count), caps `limit` at 200
with a default of 50, and covers both pages and the over-limit rejection in
unit, conformance and captured-example form — generated services inherit the
pattern instead of re-deciding it. The repository port offers **no unpaged
listing at all**, so the unbounded collection cannot even be typed. The contract
emitter also learned to render requests from zod's *input* view (a defaulted
query parameter is optional to the caller) and responses from the *output* view
— one schema, two honest projections.

**Performance and resource use are a pipeline stage with coarse ceilings
(NFR-30).** `package.yml` gains a `perf smoke` stage: it boots the freshly
built image, drives a fixed 15-second, 25-worker load against the platform's
DB-free endpoints with a dependency-free node driver, and enforces only what a
shared runner can honestly hold — zero errors, zero non-2xx, p95 under
1000 ms, image size under 400 MB — while publishing latency percentiles,
throughput, container memory under load and image size to the job summary as
the trend record. The stage is gated by `deployment.perfSmoke` in the committed
config (surfaced through `deploy-cli plan`), so the byte-shared workflow stays
identical across templates while each stack turns it on with one reviewed
config line; `api-node` ships it on. `deploy:verify` fails a workflow that lost
the stage or its budget envs. Raising a ceiling is an ADR, the budget doctrine.

## Consequences

An unpaginated collection now fails the fast lane at `contract:verify`, on
every stack the check has reached (api-node first; the staging table widens
it). A gross runtime regression fails the pipeline before the image is pushed,
and the published trend makes "fully optimized resource use" a reviewable claim
instead of a hope. The smoke's honest limit is stated in the rule: it drives
the DB-free platform endpoints; the DB-path load story lands with each stack's
migrate-in-image story.

## Alternatives considered

- **p95 micro-budgets per endpoint**: NFR-13 already records why that flakes on
  shared runners; the coarse ceiling plus a published trend catches what
  actually reaches production undetected.
- **k6/autocannon**: real load tools, but each is a pinned install and a
  runtime dependency of the pipeline; a 30-line node driver on the runner's own
  toolchain measures the same coarse signals with nothing to supply-chain.
- **Enforcing pagination in the route-registry type**: stack-specific and
  invisible to consumers; the emitted contract is the one artefact every stack
  shares and every consumer sees.
