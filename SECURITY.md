# Security policy

This file is the vulnerability-reporting policy for the proto-forge plugin and
its templates (SSDF RV.1.3; control `SEC-041` in
`references/security-controls.json`). The security *baseline* a generated
application carries — headers, validation, scans, conformance — is described in
`docs/SECURITY.md`; this page is about what to do when you find a hole in it.

## Reporting a vulnerability

Report privately through GitHub's vulnerability reporting for this repository:
**Security → Report a vulnerability** at
<https://github.com/JirakJ/proto-forge/security/advisories/new>. Do not open a
public issue and do not attach a proof of concept to a pull request.

Include what you can of: the template or plugin gate affected, the version
(`package.json` at the root, or the `templateVersion` in a generated
repository's `.proto-forge/snapshot.json`), reproduction steps, and the impact
you believe it has. A report that reaches a generated repository rather than
the plugin — a control the template ships wrong — is still a report against
this repository; the fix lands in the template and reaches every future
generation.

## What to expect

| Step | Deadline |
| --- | --- |
| Acknowledgement of the report | 3 business days |
| Triage: confirmed, not reproducible, or out of scope — with a severity | 10 business days |
| Fix or documented mitigation for a confirmed high or critical finding | 30 days from triage |
| Fix for a confirmed medium or low finding | the next release |
| Coordinated disclosure | after the fix ships, or 90 days from the report, whichever is first |

Severity follows the CVSS v4 base score as read by the maintainer; a report may
argue for a different rating and the reasoning is answered in the advisory.

## Scope

In scope: the plugin gates under `scripts/`, the skills, every template under
`templates/`, and the delivery surfaces those templates ship (container images,
Helm charts, workflows). Out of scope: vulnerabilities in a generated
application's *own* domain code, and third-party advisories already recorded in
a template's triage ledger with a live expiry (`audit.toml`, `.trivyignore`,
`osv-scanner.toml`) — those are tracked, not unknown.

## Supported versions

The latest tagged release receives fixes. A finding against an older tag is
fixed forward; the advisory names the first fixed version.
