# Conformance boot: the whole HTTP stack over the seeded in-memory port fake
# with clock and id source pinned to constants, so every response body is
# byte-stable across machines and runs (BR-26).
#
# This file lives in src/app/e2e deliberately: a conformance entry must touch
# the inbound adapter, the port fake AND the harness at once, which no single
# architecture element is allowed to do — e2e is composition, like main.py, and
# is excluded from the production build and coverage thresholds. It composes
# the __fixtures__ port fake because Python has no in-process real Postgres:
# the real-database tier is tests/integration against Testcontainers Postgres,
# mandatory in CI (BRS 15/19 per-stack escape, ADR 003/022) — what this run
# proves is the wiring, the contract and the error surface, which do not
# depend on the engine behind the port.
from collections.abc import Callable

import httpx2 as httpx
from fastapi.testclient import TestClient

from app.adapters.inbound.http.app import build_app
from app.application.note.__fixtures__.memory_repo import MemoryNoteRepository
from app.application.note.note_service import NoteService
from app.harness.cases import SEED_CLOCK, HarnessCase
from app.harness.seed import seed_notes


def boot_conformance_client() -> TestClient:
    repo = MemoryNoteRepository()
    seed_notes(repo)
    service = NoteService(repo=repo, now=lambda: SEED_CLOCK, new_id=fixed_id_sequence())
    app = build_app(service)
    return TestClient(app, raise_server_exceptions=False)


def execute_case(client: TestClient, harness_case: HarnessCase) -> httpx.Response:
    if harness_case.request.body is None:
        return client.request(harness_case.request.method, harness_case.request.path)
    return client.request(
        harness_case.request.method, harness_case.request.path, json=harness_case.request.body
    )


def fixed_id_sequence() -> Callable[[], str]:
    counter = 0

    def next_id() -> str:
        nonlocal counter
        counter += 1
        return f"00000000-0000-4000-8000-{counter:012d}"

    return next_id
