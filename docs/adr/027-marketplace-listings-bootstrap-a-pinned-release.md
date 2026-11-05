# ADR 027: Marketplace listings bootstrap a pinned release

- Status: accepted
- Date: 2026-11-05
- Prompt-log: CHANGELOG.md 0.13.0 (an invitation to list proto-forge on the Agensi skill marketplace)

## Context

Agensi (agensi.io) sells and distributes SKILL.md skills to agents through its own
connector. Its delivery model is incompatible with this plugin as published:

- an upload holds at most 1,000 files (100 when submitted from an agent); this
  repository tracks about 2,300;
- a buyer's agent is served `SKILL.md` plus at most 200 other text files per
  listing, fetched on demand;
- the agent is told never to save fetched skill content into the project or a
  skills folder, and a bundled script runs alone from a temporary file and cannot
  read the rest of the package.

proto-forge's first action is to copy a template **byte for byte** into the user's
new project (Phase 0). Uploading the repository would fail the file limit; trimming
it to fit would ship a skill that cannot scaffold — which the marketplace's
money-back guarantee would refund and its review would rightly reject.

## Decision

A marketplace listing ships a **bootstrap**, not the plugin:

- `distribution/agensi/SKILL.template.md` — a skill that discloses the download, runs
  the bootstrap, then hands over to the real `SKILL.md` with every relative path
  resolved against the downloaded root.
- `distribution/agensi/bootstrap.template.mjs` — a dependency-free script that
  clones this repository over HTTPS at one release tag into the user's cache
  directory and accepts the checkout only when `HEAD` equals that tag's commit and
  no tracked file is modified. A cached checkout that fails either check is
  refused, never repaired or used.
- `scripts/agensi-package.mjs` stamps the tag and its commit from git (never typed
  by hand), refuses a tag that does not exist or whose own `package.json` disagrees
  with its name, enforces the marketplace's published limits (file count, 20 KB per
  script, characters per listing, zip size), checks that the script parses, and
  writes a byte-reproducible zip plus its SHA-256. Its selftest proves each refusal.
- `.github/workflows/agensi-package.yml` attaches that zip to every published
  GitHub release, built from the release tag.

The listing is free. The plugin is MIT-licensed and public; the listing is a
discovery channel, not a paywall.

## Consequences

- One HTTPS request to github.com on first use, disclosed in the listing and in the
  skill; later runs are offline. A machine that cannot reach GitHub cannot use the
  listing, and the bootstrap says so with a remedy instead of degrading.
- Moving or re-pointing a released tag breaks every listing that pins it, by
  design: the commit check turns a silent supply-chain change into a refusal.
  RELEASE.md's rule never to move a tag is now load-bearing for distribution too.
- Each release ships its own package; the listing is updated to the newest one in
  the same release cycle, so the marketplace never lags the plugin.
