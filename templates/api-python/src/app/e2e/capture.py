# Docs example capture (BR-26): replays the harness scenarios and writes each
# exchange to docs/api/<operationId>/examples/<case-id>.json. Same pinned clock
# and ids as the conformance run, so reruns are byte-identical. Run with
# `uv run python -m app.e2e.capture`.
import json
from pathlib import Path

import httpx2 as httpx

from app.e2e.boot import boot_conformance_client, execute_case
from app.harness.cases import HarnessCase, cases

_DOCS_API_DIR = Path(__file__).resolve().parents[3] / "docs" / "api"


def example_for(harness_case: HarnessCase, response: httpx.Response) -> dict[str, object]:
    request: dict[str, object] = {
        "method": harness_case.request.method,
        "path": harness_case.request.path,
    }
    if harness_case.request.body is not None:
        request["body"] = harness_case.request.body
    return {
        "request": request,
        "response": {
            "status": response.status_code,
            "headers": {"content-type": response.headers.get("content-type", "")},
            "body": None if response.text == "" else response.json(),
        },
    }


def main() -> None:
    client = boot_conformance_client()
    for harness_case in cases:
        example = example_for(harness_case, execute_case(client, harness_case))
        directory = _DOCS_API_DIR / harness_case.operation_id / "examples"
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{harness_case.id}.json"
        path.write_text(json.dumps(example, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"captured {len(cases)} examples into docs/api")


if __name__ == "__main__":
    main()
