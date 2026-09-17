# Known limitations and findings

This register describes version 0.12.0. It is a review aid, not a substitute for
GitHub issues or the security control catalogue.

## High priority

### Security coverage is partial by design

`security:catalogue` currently reports 21 controls: 7 enforced and 14 planned. It
maps 17 of 253 OWASP ASVS 5.0.0 Level 1/2 requirements to controls. Planned areas
include HSTS, trusted CORS configuration, cookie scope, cross-origin request
protection, sensitive browser storage, remediation policy, abuse resistance, mass-
assignment defense, Trusted Types, Permissions Policy, cross-origin isolation,
threat modeling, and artifact provenance.

Impact: generated conformance output must not be presented as full ASVS Level 2
conformance. Read `references/security-controls.json` and the generated report before
making a security claim.

### Backend capability parity is incomplete

The served `/docs` explorer, byte-identical `/openapi.json`, and enforced collection
pagination are scoped to `api-node`. The requirements register stages Python next,
then Java/Kotlin, then .NET. The shared performance-smoke workflow exists broadly,
but its live configuration and useful endpoint behavior still need stack-specific
review.

Impact: do not describe all five backend templates as having the Node template's
served documentation and pagination guarantees.

### The model a prompt-log entry names is a self-declaration

BR-50 requires every entry to name the model that executed it, and BR-46 derives
the commit's co-author trailer from that field. The field is written by the model
itself. Claude Code reports the running model to hooks only on `SessionStart` and
the model-switch events, so `.proto-forge/session.json` records what the harness
last reported, but no gate compares an entry's `model:` against that record — a
session that switched models between two entries would make such a comparison
wrong more often than right.

Impact: the trailer is mechanically consistent with the prompt log, and the prompt
log is consistent with the registry, but the chain starts at a statement the model
makes about itself. Review is what closes it. A harness that reports the model per
tool call would let `prompt:lint` cross-check the field; none does today.

## Medium priority

### Phase 1 instructions are web-specific despite multi-template scope

The main skill labels Phase 1 as universal, then gives exact Notes-demo deletion and
regeneration paths for the web-family tree. Backend templates also contain demo
slices, but their stack-specific cleanup contract is not enumerated in the main
pipeline with equivalent precision.

Impact: backend generation depends more heavily on template-local instructions and
agent interpretation, weakening the stated structural determinism. Add per-kind Phase
1 cleanup manifests or a template-owned machine-readable cleanup plan.

## Low priority

### The disclosure probe checks shape, not reachability

`SEC-041` is enforced by `disclosurePolicyStated`, which proves that
`docs/SECURITY.md` has a "Reporting a vulnerability" section naming a channel (a
URL, an address, or GitHub's private "Report a vulnerability" form) and a
response window in days. The shipped section names the
repository's GitHub private vulnerability reporting; a generated repository hosted
elsewhere must replace the channel, and the probe cannot tell a live channel from
a dead one.

Impact: the control proves a policy is stated, not that a report would arrive.
Review checks the channel at release; a pipeline probe never reaches the network
(NFR-16).

## Resolved in 0.12.0

- Every template ships pinned subagent definitions under `.claude/agents/` (BR-51,
  ADR 024): the routing decision is made by the harness, not remembered.
- The vulnerability-reporting policy reaches every generated repository and
  `SEC-041` is enforced (ADR 025); the root `SECURITY.md` was 0.11.0's half.

## Resolved in 0.11.0

Recorded so a reader of an older register can see what moved (ADR 023):

- The main skill's gate description had drifted from the enforcing code — the
  prose is regenerated and `skill:gates` fails the next drift (§17.3).
- The ARM64 self-hosted CI setup was internally inconsistent — the deploy
  toolchain step now selects its kubeconform and hadolint assets from `uname -m`.
- Tauri pinned dependencies but not the compiler — `src-tauri/rust-toolchain.toml`
  is the pin, CI reads it, and `shell:verify` fails a missing or floating channel.
- The decision table's T1 row was web-first — it now derives the target first and
  names T14/T24 as its first branch; T18 names the Kotlin and C# mechanisms.
- Local tooling artefacts and the session anchor are ignored at the root; the
  plugin CI job reads a root `.nvmrc`; the manifest descriptions read correctly.
