# @adr 008 - the route registry is the contract's single source
#
# Every HTTP operation is one entry in the registry (routes.py), and nowhere
# else: the FastAPI wiring, the OpenAPI contract, the docs examples and the e2e
# conformance suite are all DERIVED from that table. A route registered ad hoc
# on the app instance would be an operation the contract cannot see — opid:scan
# fails the literal, and this dataclass makes the endpoint, the success shape
# and the problem list required rather than polite.
#
# operation_id is the backend's addressability surface (BR-25): kebab-case
# `<resource>-<verb>`, unique across the app, the same grammar as the
# frontend's testids — contract clients, docs examples and e2e scenarios all
# key on it.
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

HttpMethod = Literal["GET", "POST", "PUT", "PATCH", "DELETE"]

# A FastAPI endpoint function; its typed signature IS the boundary validation
# (BRS 16): path/query/body models are declared as parameters, and FastAPI
# rejects a request that does not parse before any handler code runs.
Endpoint = Callable[..., object]


@dataclass(frozen=True)
class RouteDef:
    # kebab-case `<resource>-<verb>`, unique (BR-25).
    operation_id: str
    method: HttpMethod
    # FastAPI-style path, e.g. `/notes/{id}`. Never inlined at a call site.
    path: str
    # One sentence for the contract's `summary`.
    summary: str
    endpoint: Endpoint
    # The success status; error statuses come from the problem catalogue.
    status_code: int
    # The success shape (a pydantic model or list thereof); None = no body (204).
    response_model: object | None
    # Problem codes (keys of the problem catalogue) this operation can emit (BR-23).
    problems: list[str]
