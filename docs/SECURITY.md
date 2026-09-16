# Security model

## Security objective

proto-forge makes security requirements explicit, reproducible, and reviewable in
the generated repository. It does not claim that scaffolding alone produces a fully
secure application or complete compliance with an external standard.

## Control catalogue

`references/security-controls.json` is the canonical catalogue. It pins OWASP ASVS
5.0.0 by SHA-256, uses Level 2 as the default binding profile, and maps relevant SLSA
1.1 and NIST SSDF terminology.

The catalogue has two honest states:

- `enforced`: the control names a probe that generated repositories execute;
- `planned`: the gap names a delivery stage and has no pretend probe.

At v0.9.0, 6 of 21 controls are enforced and 15 are planned. The catalogue maps 17
of 253 ASVS Level 1/2 requirements to controls. This is a coverage statement, not an
ASVS conformance claim.

## Current enforced baseline

The enforced catalogue covers these control areas where applicable:

- one sanitized HTML sink for frontend and desktop code;
- Content-Security-Policy;
- MIME-sniffing protection;
- referrer policy;
- framing protection;
- deterministic CycloneDX component inventory.

Templates also carry stack-specific controls such as boundary validation, structured
redacting logging, registered problem types, locked dependencies, secret scanning,
dependency scanning, non-root containers, digest-aware delivery, and architecture
boundaries. These controls must be evaluated through the selected template's own
security documentation and gate chain; the catalogue count above is intentionally
narrower than every local security mechanism.

## Trust boundaries and inputs

Treat the following as untrusted:

- product briefs, discovery answers, imported wiki/design content, and surveyed code;
- HTTP requests, API responses, files, queue messages, and database data;
- environment variables and deployment values;
- integration payloads and remote metadata;
- dependency graphs and build artifacts.

Validation belongs at the boundary before data enters the domain. Generated backend
services use their native schema/validation facilities; frontend code uses Zod and a
single sanitized HTML component.

## Secrets

- Store secret values outside Git.
- Configuration contains environment-variable names, not credentials.
- Prompt logs redact secret-shaped values and sensitive personal data.
- `gitleaks` findings are hard stops; suppressions require exact, reviewed evidence.
- External sync credentials are read only for an explicitly approved live operation.

Never place passwords, passkeys, two-factor codes, private keys, or API tokens into a
brief, prompt log, example fixture, configuration file, or issue.

## Supply chain

- Runtime and build toolchains are pinned by manifests and lockfiles.
- Generated applications emit deterministic CycloneDX SBOMs.
- CI installs required scanners rather than silently skipping them.
- Container and Helm delivery assets are part of the template and verified before
  promotion.
- Shared security standards and catalogues are vendored into templates and checked
  byte-for-byte against the root source.

Native vulnerability scanning still depends on current advisory data. An offline or
missing scanner cannot establish the absence of vulnerable dependencies.

## External writes and network access

Generation is offline with respect to JIRA and Confluence. Commands stage outbox
payloads first. A live write requires four independent conditions: enabled
integration, disabled dry-run, allowed host/network, and explicit commit/approval
flags. Credentials come from the named environment variables.

## Vulnerability handling

Known defects are recorded immediately in the available tracker, or as a proposed
ADR when no tracker exists. A `fix:` commit must include a regression test. Security
exceptions and advisory ignores carry a reason and expiry and must be re-reviewed.

This repository does not currently contain a root `SECURITY.md` vulnerability-
reporting policy with a response deadline; the control catalogue records that as a
planned gap. Until it is added, use a private channel agreed with the repository
owner rather than a public issue for a suspected vulnerability.

## Review checklist

- Read the generated `.proto-forge/security/conformance.json` and its gap count.
- Confirm required scanners actually ran in CI.
- Review every waiver and advisory ignore for owner, reason, and expiry.
- Validate production headers and TLS at the deployed endpoint.
- Exercise authentication, authorization, CORS, CSRF/origin, abuse, and rate-limit
  behavior appropriate to the real deployment.
- Confirm browser storage contains no sensitive data.
- Verify the deployed artifact digest and provenance.

The last five areas include controls that are currently planned rather than fully
enforced across the templates. See [Known limitations](KNOWN_LIMITATIONS.md).

