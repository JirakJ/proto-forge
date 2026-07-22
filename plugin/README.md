# proto-forge plugin — published in agentic-os

The distributable plugin (BRS §17.1) lives in the agentic-os marketplace:
`~/work/agentic-os/plugins/proto-forge` (github.com/JirakJ/agentic-os), released as
`proto-forge/v0.1.0`, sha-pinned in its `marketplace.json`.

This directory is intentionally empty of manifests — the plugin manifest is owned by
agentic-os to keep a single source of plugin metadata. The canonical skill (engine) is
this parent directory; the release ritual (rsync → `make release` → sha pin) is
documented in the plugin's README in agentic-os.
