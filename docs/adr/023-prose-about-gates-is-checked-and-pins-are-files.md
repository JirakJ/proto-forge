# ADR 023: Prose about the gates is checked against the seed, and a toolchain pin is a file in the tree

- Status: accepted
- Date: 2026-09-17
- Prompt-log: docs/KNOWN_LIMITATIONS.md as of 0.10.0 (the register of findings this record closes: "The main skill's gate description has drifted from the enforcing code", "Tauri pins dependencies, not the Rust compiler in the repository", "ARM64 self-hosted CI setup is internally inconsistent", "The main decision table retains a web-first T1 rule", "Decision row T18 names domain mechanisms for three of five stacks", "No root vulnerability-reporting policy", "Local tooling artefacts are not ignored at the root", "The plugin CI job borrows a template's Node pin", "Manifest descriptions contain a grammatical slip")

## Context

The 0.9.1 documentation pass produced an evidence-backed register of what the
repository claimed and did not hold. Two of its findings share a cause worth a
record: a statement that lives only in prose or only in a workflow literal
drifts from the thing it describes, and nothing notices.

`SKILL.md` told an agent there were thirteen mandatory gates and listed a
`verify` chain six commands short of the template's — the seed had grown, the
sentence had not, and no gate compared them (BR-46's precedent: a claim nobody
verifies is a claim that rots). The Tauri template called its toolchain pinned
while the compiler version existed only as a literal in `verify.yml`, so a
local `rustup default stable` and CI compiled with different toolchains under
the same word "pinned". The same workflow chose scanner binaries from
`uname -m` and then downloaded `kubeconform-linux-amd64` and
`hadolint-Linux-x86_64` unconditionally, so its ARM64 comment described a
capability two steps did not have.

The remaining findings were smaller and of the same family: a decision table
whose T1 row said "copy the web template" while T14 and T24 derived other
targets; a T18 row naming domain mechanisms for three of five stacks; no root
vulnerability-reporting policy behind control `SEC-041`; per-session tooling
files and a session anchor tracked or noisy at the root; the plugin CI job
reading a template's `.nvmrc`; and a manifest description missing a comma in
the sentence a prospective user reads first.

## Decision

**§17.3 — the skill's gate prose is checked.** A plugin gate, `skill:gates`,
parses the web seed's `MANDATORY_GATES` and its `package.json` `verify` script
and fails when the two sentences in `SKILL.md` that state them are not exactly
those lists, in order. The prose is regenerated to match today and says, next
to the chain, that it is checked. The web chain is the one compared, because it
is the one the skill shows; every other template's chain lives in its own
`package.json` per the template registry.

**A toolchain pin is a file.** `templates/desktop-tauri/src-tauri/rust-toolchain.toml`
names the exact channel; rustup honours it locally, CI reads it (`sed` on the
file, never a repeated literal), and `shell:verify` fails a missing file or a
channel that is not `X.Y.Z` — BR-37 amended, two new selftest cases. The same
principle puts a root `.nvmrc` behind the plugin CI job instead of a template's.

**CI chooses every binary from the machine.** The deploy-toolchain step picks
the kubeconform and hadolint assets from `uname -m` like the scanner steps do;
both projects publish `arm64` assets at the pinned versions.

**The rest, as stated in the register.** T1 derives targets first and names
T14/T24 as its first branch rather than its exceptions; T18 names Kotlin (an
immutable data class with hand-written validation, Exposed only in the
adapter) and C# (`sealed record` + `DataAnnotations`, EF Core only on the
adapter's entity) from those templates' own ADR 010 texts; `SECURITY.md` at
the root names GitHub private vulnerability reporting as the channel and
states acknowledgement, triage, fix and disclosure deadlines; the root
`.gitignore` covers the orchestration tooling's files and the session anchor
leaves history; the two manifests gain their comma.

## Consequences

`SEC-041` stays `planned`: the root policy exists, but the control asks every
generated repository to carry one, and the templates' `docs/SECURITY.md` do not
yet — that flip is the templates' change, recorded in the register as the
remaining gap. The Tauri snapshot is regenerated for the changed gate script.
An operator who pinned Rust locally with `rustup default` sees the file win the
moment cargo runs inside `src-tauri/`, which is the intended surprise.

## Alternatives considered

- **Generating the SKILL.md paragraph from the config at release time:** a
  generated paragraph in a hand-edited file is a merge hazard; a gate that
  fails on drift keeps the file hand-edited and honest.
- **A `rust-toolchain` file without the shell gate check:** rustup would honour
  it, but nothing would stop a later edit to `channel = "stable"` — the same
  drift with a shorter fuse.
