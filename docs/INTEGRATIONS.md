# Integrations and external writes

proto-forge treats every outward-facing effect as a consented, staged-first action.
This page covers the JIRA and Confluence integrations, the external-record model,
and the environment and deployment consent rules that share the same doctrine.

## Doctrine

- No generation phase performs an external write as a side effect.
- Every outward command stages a payload first and prints what it would send.
- A live write needs several independent conditions, and no single flag turns
  everything on.
- Every object that was actually created or published gets a local record with
  provenance and an owner list.

## Configuration

Integrations live under `integrations` in `.proto-forge/config.json` and are off by
default:

```json
{
  "integrations": {
    "jira": {
      "enabled": true,
      "dryRun": true,
      "baseUrl": "https://acme.atlassian.net",
      "projectKey": "APP",
      "issueType": "Task",
      "createFor": ["adr", "blocked-gate", "waiver"],
      "tokenEnv": "JIRA_API_TOKEN",
      "userEnv": "JIRA_USER"
    },
    "confluence": {
      "enabled": true,
      "dryRun": true,
      "baseUrl": "https://acme.atlassian.net/wiki",
      "spaceKey": "APP",
      "parentPageId": "12345",
      "publish": ["architecture", "adr-index", "component-catalog", "security"],
      "tokenEnv": "CONFLUENCE_API_TOKEN",
      "userEnv": "CONFLUENCE_USER"
    }
  },
  "guardrails": {
    "network": { "allow": true, "allowedHosts": ["acme.atlassian.net"] }
  }
}
```

`tokenEnv` and `userEnv` name environment variables. The configuration never
contains a credential, and `env:verify` fails on a secret-shaped committed value.

## Commands

| Command | Behavior |
| --- | --- |
| `pnpm sync:jira` | Stages ticket payloads for the configured events into `.proto-forge/outbox/`. |
| `pnpm sync:confluence` | Stages page payloads for the configured documentation sets. |
| `pnpm sync:jira --commit --approve` | Performs the live write when every condition below holds. |
| `pnpm sync:pull --page <id> [--affects a,b]` | Fetches a Confluence page into a `pull` record and lets you declare which local files it affects. |
| `pnpm sync:status [--fail-on-drift]` | Reports which external records changed upstream and which local files that touches. |
| `pnpm sync:auto` | Runs after each accepted-ADR commit and at release. Sends live only for an integration with committed `autoPropagate: true`; otherwise stages and states why nothing was sent. |
| `pnpm external:verify` | Verifies the provenance of every record under `docs/external/`; part of `verify`. |

## Conditions for a live write

All of the following must hold at once:

1. the integration is `enabled`;
2. `dryRun` is `false`;
3. the network guardrail is on and the host is in `allowedHosts`;
4. either the per-run `--commit --approve` flags were given by the operator, or
   `autoPropagate: true` is committed in the configuration;
5. the named environment variables hold the credentials.

`autoPropagate` stands in for the per-run approval and for nothing else. Committing
it is the operator's standing, reviewed consent to unattended propagation. The
model never types `--approve` on its own.

## External records

Every sent object, published page, or pulled page produces an MDX record under
`docs/external/` that names the remote object, the local subject it represents,
the owners, and the sync timestamp. External systems named in a backend brief also
receive a record with their contract when the brief provides one. `external:verify`
fails a record without provenance or an owner.

## Environments and deployment consent

The same doctrine governs delivery:

- an environment exists only by being declared and enabled in `config.json`;
  values files, the deployment table, and the CD plan are derived from it;
- `deploy:plan` prints what a promotion would do; the actual promotion is a CI
  stage that runs only for enabled environments;
- image signing and verification are on by default; turning them off removes the
  proof that what runs is what CI built;
- secrets travel by environment-variable name, never by value.

## What integrations never do

- serve as evidence of application correctness;
- run during a `verify` lane;
- create objects in a project other people work in without an explicit, recorded
  consent;
- read credentials from the repository.

## Related pages

- [Generated repository](GENERATED_REPOSITORY.md) for the outbox and config files.
- [Security](SECURITY.md) for the secrets and trust-boundary rules.
