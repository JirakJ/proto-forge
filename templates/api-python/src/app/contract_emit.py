# @adr 008 - the committed contract is emitted, never edited
#
# Runnable module: `uv run python -m app.contract_emit > contract/openapi.json`.
# Canonical JSON with sorted keys and no timestamps — byte-deterministic
# (BR-22). Its stdout IS its output, not a log (tool surface, like src/app/e2e).
import sys

from app.adapters.inbound.http.contract import emit_text

sys.stdout.write(emit_text())
