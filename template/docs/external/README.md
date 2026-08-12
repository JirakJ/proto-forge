# External sync records

Everything this repository pushed to — or pulled from — Confluence and JIRA lives here as
one MDX file per remote object, versioned with the code and reviewable in an ordinary
diff. **The records are the ledger**: there is no second store.

## The frontmatter answers the operator's questions

| Field | Answers |
| --- | --- |
| `source`, `id`, `url` | which remote object, and where to open it |
| `remoteVersion`, `remoteUpdatedAt` | which revision we last agreed on |
| `syncedAt` | when we last agreed |
| `direction` | which way the truth flows: `push` (local files are the source) or `pull` (the page is upstream) |
| `affectedFiles` | which local files the object concerns — so drift reports name files, not just page ids |

`external:verify` (mandatory gate) fails on a missing field, a URL off the configured
host, a non-ISO timestamp, an affected file that does not exist — and on an **empty**
`affectedFiles`, because a record that affects nothing is worse than no record.

## Where records come from

- `pnpm sync:confluence --commit` / `pnpm sync:jira --commit` write a `push` record per
  object they create or update, with `affectedFiles` **derived** from the documents the
  payload was built from.
- `pnpm sync:pull --page <id> [--affects a,b]` fetches a page into a `pull` record, body
  converted back to Markdown. `affectedFiles` cannot be derived on a pull — an upstream
  page's relationship to local files is a human judgement — so it is reused from an
  existing record for the same page, or declared with `--affects`. Declaring nothing
  writes the record and **fails**, naming the flag to re-run with.
- `pnpm sync:status [--fail-on-drift]` compares every record against the remote and
  reports `up to date`, `changed upstream` (with the affected files listed beneath), or
  `MISSING upstream`.

All three honour the network guardrail: no socket opens unless
`guardrails.network.allow` is on and the host is allowlisted. Reading needs no
`--approve` — it is not an outward-facing effect — but it is still a network call.

## Editing a record by hand

Edit `affectedFiles` freely: that field is a human judgement and keeping it current is
the point. Do not hand-edit `remoteVersion` / `remoteUpdatedAt` — they are what
`sync:status` compares against, and a hand-advanced revision silences the drift report
the record exists to produce.
