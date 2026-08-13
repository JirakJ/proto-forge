# @adr 003 - e2e conformance: replay every harness scenario against the booted
# stack and hold the responses to the registry's own models. Run with
# `uv run python -m app.e2e.run`; exits 1 with a readable diff on any mismatch.
import sys

import httpx2 as httpx
from pydantic import TypeAdapter, ValidationError

from app.adapters.inbound.http.routes import routes
from app.application.validation import validation_detail
from app.e2e.boot import boot_conformance_client, execute_case
from app.harness.cases import HarnessCase, cases

_routes_by_id = {route.operation_id: route for route in routes}


def check_case(harness_case: HarnessCase, response: httpx.Response) -> list[str]:
    if response.status_code != harness_case.expect.status:
        return [
            f"{harness_case.id}: expected status {harness_case.expect.status}, "
            f"got {response.status_code} (body: {response.text})"
        ]
    if harness_case.expect.problem is not None:
        return _check_problem_body(harness_case, response)
    return _check_success_body(harness_case, response)


def _check_problem_body(harness_case: HarnessCase, response: httpx.Response) -> list[str]:
    body = response.json()
    code = body.get("code") if isinstance(body, dict) else None
    if code != harness_case.expect.problem:
        return [f'{harness_case.id}: expected problem code "{harness_case.expect.problem}", got {code!r}']
    return []


def _check_success_body(harness_case: HarnessCase, response: httpx.Response) -> list[str]:
    model = _success_model(harness_case)
    if model is None:
        if response.text == "":
            return []
        return [f"{harness_case.id}: expected an empty body, got {response.text}"]
    try:
        TypeAdapter(model).validate_python(response.json())
    except ValidationError as error:
        return [
            f"{harness_case.id}: response does not match the {harness_case.operation_id} "
            f"{harness_case.expect.status} model: {validation_detail(error)}"
        ]
    return []


def _success_model(harness_case: HarnessCase) -> object | None:
    route = _routes_by_id.get(harness_case.operation_id)
    if route is None:
        message = f'case "{harness_case.id}" names unknown operation "{harness_case.operation_id}"'
        raise ValueError(message)
    if route.status_code != harness_case.expect.status:
        message = (
            f'case "{harness_case.id}" expects status {harness_case.expect.status}, '
            f'which "{harness_case.operation_id}" does not declare'
        )
        raise ValueError(message)
    return route.response_model


def main() -> int:
    client = boot_conformance_client()
    failures: list[str] = []
    for harness_case in cases:
        failures.extend(check_case(harness_case, execute_case(client, harness_case)))
    if failures:
        print("conformance failures:")
        for failure in failures:
            print(failure)
        return 1
    print(f"conformance: {len(cases)} scenarios green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
