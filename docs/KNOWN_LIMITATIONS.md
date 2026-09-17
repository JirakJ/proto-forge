# Known limitations and findings

This register describes version 0.11.0. It is a review aid, not a substitute for
GitHub issues or the security control catalogue.

## High priority

### Security coverage is partial by design

`security:catalogue` currently reports 21 controls: 6 enforced and 15 planned. It
maps 17 of 253 OWASP ASVS 5.0.0 Level 1/2 requirements to controls. Planned areas
include HSTS, trusted CORS configuration, cookie scope, cross-origin request
protection, sensitive browser storage, remediation policy, abuse resistance, mass-
assignment defense, Trusted Types, Permissions Policy, cross-origin isolation,
threat modeling, vulnerability reporting, and artifact provenance.

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

### The vulnerability-reporting policy exists at the root only

Control `SEC-041` asks every generated repository to name a private reporting
channel and a response deadline. The root `SECURITY.md` now does (GitHub private
vulnerability reporting; acknowledgement, triage, fix and disclosure deadlines),
but the templates' `docs/SECURITY.md` still describe the baseline controls
without a reporting section, so the control stays `planned`.

Impact: a generated application inherits no disclosure channel of its own. Add a
reporting section to every template's `docs/SECURITY.md` (with the channel and
deadlines as operator-filled fields the stub scan rejects when left empty), then
flip `SEC-041` to `enforced` with a `sec:conformance` probe behind it.

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
