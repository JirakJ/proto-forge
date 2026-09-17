# Known limitations and findings

This register describes version 0.10.0. It is a review aid, not a substitute for
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

### ARM64 self-hosted CI setup is internally inconsistent

The root verification workflow says binary installs select assets from `uname -m`
for ARM64 runners. The gitleaks and OSV steps do so, but the deploy-toolchain step
downloads `kubeconform-linux-amd64` and `hadolint-Linux-x86_64` unconditionally.

Impact: an ARM64 runner can fail before template verification even though the workflow
comments state ARM64 support. The deploy-toolchain install needs architecture-aware
asset selection or an explicit x86-only runner constraint.

### The main skill's gate description has drifted from the enforcing code

`SKILL.md` states that there are 13 mandatory gates and lists the web `verify`
chain without `env:verify`, `deploy:verify`, `contract:client`, `sec:conformance`,
`quality:report`, and `status:verify`. The web template's `scripts/config.mjs`
lists 17 mandatory gates (adding `env`, `deploy`, `client`, and `status`) and its
`package.json` chain contains all six of the omitted commands. The generated
`AGENTS.md` already carries the current list; the skill does not.

Impact: an agent reading the skill as the normative pipeline underestimates which
gates need a waiver and which commands the full lane runs. No plugin gate compares
the skill's prose against the template's `MANDATORY_GATES` or `verify` script, so
the drift is silent. Either regenerate that paragraph from the template
configuration or add a citation-style check that fails on disagreement.

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

### Tauri pins dependencies, not the Rust compiler in the repository

The Tauri gate checks exact `tauri`/`tauri-build` versions and `Cargo.lock`. CI installs
Rust 1.97.1, while local troubleshooting recommends `rustup default stable`; there is
no committed `rust-toolchain.toml` and the shell gate does not compare a compiler
version.

Impact: local and CI compiler versions may diverge even though documentation calls the
toolchain pinned. Commit one Rust toolchain source and make CI and the gate consume it.

### The main decision table retains a web-first T1 rule

T1 says every received brief copies `templates/web/`, while later T14 and T24 rows
derive backend workspaces and desktop targets. `SKILL.md` contains the newer target
derivation, but the supposedly exhaustive decision table does not state that T14/T24
override T1.

Impact: an agent following the table literally can copy an unnecessary web template
for backend-only or desktop-only work. Refactor T1 into target derivation plus a
frontend-only row, or make precedence explicit and executable.

### Phase 1 instructions are web-specific despite multi-template scope

The main skill labels Phase 1 as universal, then gives exact Notes-demo deletion and
regeneration paths for the web-family tree. Backend templates also contain demo
slices, but their stack-specific cleanup contract is not enumerated in the main
pipeline with equivalent precision.

Impact: backend generation depends more heavily on template-local instructions and
agent interpretation, weakening the stated structural determinism. Add per-kind Phase
1 cleanup manifests or a template-owned machine-readable cleanup plan.

### Decision row T18 names domain mechanisms for three of five stacks

T18 spells out the per-entity artefacts for TypeScript (Zod), Java (JPA plus
validation), and Python (Pydantic plus SQLAlchemy). Kotlin (Exposed) and C# (EF
Core) are registered backend stacks but have no mechanism named in the table; the
detail lives only in those templates' own documentation.

Impact: the table is described as exhaustive, yet two stacks depend on template-
local guidance for a Phase 2 decision. Add the Kotlin and .NET mechanisms to T18
or state explicitly that the template's `AGENTS.md` owns that detail.

## Low priority

### No root vulnerability-reporting policy

Control `SEC-041` is `planned`, and the repository has no root `SECURITY.md` naming
a private reporting channel and a response deadline. Generated repositories inherit
the same gap.

Impact: a reporter has no documented path other than a public issue. Add a root
policy with a channel and a deadline, then flip the control once generated
repositories carry it too.

### Local tooling artefacts are not ignored at the root

`.claude-flow/`, `.claude/proven-config.json`, and `.claude/.proven-config-version`
appear as untracked files in every working tree that uses the operator's
orchestration tooling (also inside a template directory whenever a shell session
runs commands from there), and `.claude/session-anchor.md` is tracked although it is a
per-session note. The root `.gitignore` covers only `.DS_Store`, logs,
`node_modules/`, and `.scratch/`.

Impact: `git status` noise makes real changes harder to spot, and the tracked
session anchor churns on every compaction. Ignore the tooling directories and
decide whether the anchor belongs in history.

### The plugin CI job borrows a template's Node pin

The root has no `.nvmrc`; the plugin job in `verify.yml` reads
`templates/web/.nvmrc`, and the contributor guide tells readers to run `nvm use 22`
against a file that does not exist at the root.

Impact: a template Node bump silently changes the plugin's CI runtime, and local
onboarding instructions do not match the tree. Add a root `.nvmrc` matching the
`engines` range and point the plugin job at it.

### Manifest descriptions contain a grammatical slip

`.claude-plugin/marketplace.json` and `plugin/.claude-plugin/plugin.json` describe
"a SPIN/DAPA discovery skill a survey skill that inventories an existing system",
missing the comma and conjunction between the two skills. The text is shown in
the plugin store listing.

Impact: cosmetic, but it is the first sentence a prospective user reads. Fix the
sentence in both manifests in one release bump.
