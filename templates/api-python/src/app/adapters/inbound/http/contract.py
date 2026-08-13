# The OpenAPI 3.1 document is FastAPI's native derivation of the route registry
# (BR-22): app.openapi() over the registry-wired app, normalized — keys sorted,
# framework validation noise stripped, the catalogue's Problem schema injected —
# so the same registry always yields the same bytes. Emitted by
# app/contract_emit.py, locked by contract:verify.
import json
from typing import Any

from app.adapters.inbound.http.app import build_app

PROBLEM_SCHEMA: dict[str, object] = {
    "type": "object",
    "description": "RFC 9457 problem document; `code` is the stable key into the problem catalogue.",
    "properties": {
        "type": {"type": "string"},
        "title": {"type": "string"},
        "status": {"type": "integer"},
        "detail": {"type": "string"},
        "instance": {"type": "string"},
        "code": {"type": "string"},
    },
    "required": ["type", "title", "status", "instance", "code"],
}

# FastAPI documents its own 422 + HTTPValidationError for any route with
# parameters. This service never emits 422: boundary failures are the
# registered "validation-failed" problem (400), so the framework's default is
# version noise the normalizer strips.
_NOISE_SCHEMAS = ("HTTPValidationError", "ValidationError")


def build_openapi_document() -> dict[str, Any]:
    document = build_app().openapi()
    _strip_validation_noise(document)
    document.setdefault("components", {}).setdefault("schemas", {})["Problem"] = PROBLEM_SCHEMA
    return document


def _strip_validation_noise(document: dict[str, Any]) -> None:
    schemas = document.get("components", {}).get("schemas", {})
    for name in _NOISE_SCHEMAS:
        schemas.pop(name, None)
    for operations in document.get("paths", {}).values():
        for operation in operations.values():
            operation.get("responses", {}).pop("422", None)


def emit_text() -> str:
    """Canonical JSON: recursively sorted keys, two-space indent, one trailing
    newline — byte-deterministic (BR-22)."""
    return json.dumps(build_openapi_document(), indent=2, sort_keys=True) + "\n"
