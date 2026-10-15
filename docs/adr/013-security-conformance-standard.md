# ADR 013: The security bar is a named external standard, referenced rather than transcribed

- Status: accepted
- Date: 2026-08-17
- Prompt-log: docs/specs/2026-08-17-security-layer-design.md (security layer, stated by the operator as "the highest clearly defined standards providing reproducible output")

## Context

The templates carry a real security baseline and have from the start: a strict CSP, one sanctioned raw-HTML sink, zod validation at every boundary, `pnpm audit` as a hard stop, a deterministic CycloneDX SBOM, a byte-pinned seed, digest-pinned non-root containers, keyless cosign signatures, trivy, an offline `deploy:verify`. It is enforced by gates rather than by reviewer memory, which is the property that matters most.

It is also **defined by itself**. A grep across this repository for `OWASP|ASVS|SLSA|SSDF|NIST|CIS` returned nothing at all. Every control was chosen because it is good practice, and nothing says *whose* practice, or against which published bar the result can be re-checked. That is enough to be secure and not enough to say so: "it is secure" is a claim only the author can evaluate.

The operator asked for the highest **clearly defined** standard producing a **reproducible** output. Both adjectives are doing work. "Clearly defined" rules out maturity models and prose guidance in favour of a standard with numbered, individually verifiable requirements. "Reproducible" rules out a report that changes when nothing in the repository did.

## Decision

**OWASP ASVS 5.0 Level 2 is the application bar**, SLSA v1.1 Build Level 3 covers the supply chain, and NIST SSDF SP 800-218 supplies the process vocabulary. ASVS is the only widely-adopted standard that states application security as 345 individually checkable requirements rather than principles, which is precisely what "clearly defined" requires.

**Level 2, not Level 3.** L2 is 253 requirements (L1 ∪ L2) and is the level ASVS itself recommends for applications handling sensitive data. L3 asks for properties a generated prototype cannot honestly hold — hardware-backed key storage, environment segregation, a formal per-feature threat model — and answering a third of a standard with "not applicable" produces a weaker claim than a lower bar fully held. L3 is available as a per-project ratchet in `.proto-forge/config.json`; BR-17's rule applies unchanged, so tightening is free and dropping below the default needs a waiver with an ADR and an expiry.

**The standard is vendored and pinned, not transcribed.** `references/standards/asvs-5.0.0.flat.json` is OWASP's own machine-readable release, pinned by tag and sha256. `references/security-controls.json` cites `req_id`s into it and copies neither the requirement text nor its level, because a level copied into the catalogue is a second source of truth that will disagree with the first.

The pin is the release tag `v5.0.0_release`, **never** `latest`. The `latest` asset is OWASP's rolling "Bleeding Edge" build; today it is byte-identical to the 5.0.0 release (`8201b20e…`), and that is a coincidence of the moment, not a property a reproducibility claim may rest on.

**`security:catalogue` resolves every citation.** This gate exists because of a failure observed while writing the design it implements. The first draft cited Trusted Types as an ASVS requirement — 5.0 does not mention Trusted Types anywhere — put SRI at Level 2 when it is Level 3, and placed cookie attributes in V7 when they are in V3. Each number was written from memory, each looked plausible, and none was correct. A conformance claim built on unresolvable requirement ids is worse than no claim at all, because it reads as rigour. So the gate resolves every cited id against the vendored file and rejects any that sits above the binding profile.

**Controls beyond the standard must say they are ours.** proto-forge tightens past ASVS in several places — Trusted Types, Permissions-Policy, cross-origin isolation — and each is worth having. Each is recorded with an empty `requires` and a mandatory `rationale`, so a reader can always tell which obligations come from OWASP and which are this project's own opinion. Presenting our strictness as the standard's demand would misinform exactly the reader the standard exists to serve.

**`planned` carries no probe.** A control that is an identified gap says so and names the stage that closes it. It may not name a probe, because a probe that does not run reads as coverage. An admitted gap is information; a green tick with nothing behind it is not.

## Consequences

A generated application can state which standard, which version and which level it is measured against, and anyone can re-derive the mapping from the repository alone. The catalogue starts honest rather than complete: 6 controls enforced, 15 planned, and 17 of 253 L2 requirements claimed — the gate prints that ratio on every run precisely so the gap cannot be mistaken for coverage.

The cost is that adding a control now means resolving its requirement against the published standard rather than recalling it, which is slower and is the entire point.

The reproducibility half of the operator's request is decided in the design and delivered from stage E2: the output splits into `conformance.json` (the claim, derived only from repository content, byte-reproducible, hash-gated) and `findings.sarif` (the observation, threshold-gated, never hashed). No report embedding scanner findings can be byte-stable, because CVE feeds move under a fixed commit; a single artefact would have to lie about determinism or omit findings.

## Alternatives considered

**ASVS Level 3 everywhere** — the highest bar, and dishonest here: a large share of its requirements would be "not applicable" or a documented gap, which weakens the claim more than the higher label strengthens it.

**ASVS alone, without SLSA and SSDF** — leaves the supply chain and the build unnamed, when Build L3 is very nearly held already (digest pins, keyless signing, identity verification before deploy) and only generated provenance is missing.

**Transcribing the requirements into the catalogue** — no vendored file to keep in sync, at the cost of the exact failure this ADR was written around; a transcribed standard drifts and nothing detects it.

**Adopting an off-the-shelf scanner's ruleset (OpenSSF Scorecard, Semgrep ASVS packs)** — least code to own, but it needs the network, which NFR-16 forbids inside `verify`, its output is not deterministic, and it does not cover the application controls the templates actually implement. Useful as a CI supplement; wrong as the definition.

**Mapping to the EU Cyber Resilience Act as the primary bar** — CRA becomes mandatory for products placed on the EU market in December 2027 and is worth mapping to later. It is a regulation rather than a technical standard, and its harmonized standards are still being drafted, so a mapping today would be interpretation rather than machine-verifiable conformance.
