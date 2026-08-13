from collections.abc import Iterable

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.adapters.inbound.http.app import build_app, wire_routes
from app.adapters.inbound.http.route_def import Endpoint, RouteDef
from app.application.note.__fixtures__.memory_repo import MemoryNoteRepository
from app.application.note.note_service import NoteService
from app.domain.note.__fixtures__.note_factory import make_note
from app.domain.note.model import Note
from app.platform.headers import SECURITY_HEADERS
from app.platform.logger import Logger

FIXED_NOW = "2025-06-01T08:30:00.000Z"
FIXED_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
UNKNOWN_ID = "99999999-9999-4999-8999-999999999999"


class RecordingLogger:
    """Records error events — a test double for the platform Logger protocol."""

    def __init__(self) -> None:
        self.errors: list[dict[str, object]] = []

    def info(self, event: str, **kwargs: object) -> None:
        return None

    def warning(self, event: str, **kwargs: object) -> None:
        return None

    def error(self, event: str, **kwargs: object) -> None:
        self.errors.append({"event": event, **kwargs})


def app_with(
    notes: Iterable[Note] = (), *, logger: Logger | None = None, git_sha: str = "dev"
) -> FastAPI:
    service = NoteService(
        repo=MemoryNoteRepository(notes), now=lambda: FIXED_NOW, new_id=lambda: FIXED_ID
    )
    if logger is None:
        return build_app(service, git_sha=git_sha)
    return build_app(service, logger=logger, git_sha=git_sha)


def client_for(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


class TestPlatformRoutesAndHeaders:
    def test_serves_healthz_with_the_full_security_header_set(self) -> None:
        response = client_for(app_with()).get("/healthz")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
        for name, value in SECURITY_HEADERS.items():
            assert response.headers[name] == value

    def test_reports_the_dev_git_sha_by_default_and_the_injected_one_when_given(self) -> None:
        dev = client_for(app_with()).get("/version")
        assert dev.json() == {"version": "0.1.0", "gitSha": "dev"}
        pinned = client_for(app_with(git_sha="abc1234")).get("/version")
        assert pinned.json() == {"version": "0.1.0", "gitSha": "abc1234"}


class TestTheFourNoteOperations:
    def test_notes_list_returns_every_note_as_json(self) -> None:
        note = make_note()
        response = client_for(app_with([note])).get("/notes")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/json")
        assert response.json() == [note.model_dump(by_alias=True, mode="json")]

    def test_notes_get_returns_the_note_under_the_id(self) -> None:
        note = make_note()
        response = client_for(app_with([note])).get(f"/notes/{note.id}")
        assert response.status_code == 200
        assert response.json() == note.model_dump(by_alias=True, mode="json")

    def test_notes_create_stamps_id_and_created_at_and_answers_201(self) -> None:
        response = client_for(app_with()).post("/notes", json={"text": "created over http"})
        assert response.status_code == 201
        assert response.json() == {
            "id": FIXED_ID,
            "text": "created over http",
            "createdAt": FIXED_NOW,
        }

    def test_notes_delete_answers_204_with_an_empty_body(self) -> None:
        note = make_note()
        response = client_for(app_with([note])).delete(f"/notes/{note.id}")
        assert response.status_code == 204
        assert response.text == ""


class TestDeclaredProblemPaths:
    def test_notes_get_emits_note_not_found_for_an_unknown_id(self) -> None:
        response = client_for(app_with()).get(f"/notes/{UNKNOWN_ID}")
        assert response.status_code == 404
        assert response.headers["content-type"] == "application/problem+json"
        assert response.json() == {
            "type": "/problems/note-not-found",
            "title": "No note exists under this id",
            "status": 404,
            "instance": f"/notes/{UNKNOWN_ID}",
            "code": "note-not-found",
        }

    def test_notes_delete_emits_note_not_found_for_an_unknown_id(self) -> None:
        response = client_for(app_with()).delete(f"/notes/{UNKNOWN_ID}")
        assert response.status_code == 404
        assert response.json()["code"] == "note-not-found"

    def test_rejects_a_non_uuid_path_parameter_at_the_boundary_naming_the_part(self) -> None:
        client = client_for(app_with())
        for method in ("GET", "DELETE"):
            response = client.request(method, "/notes/not-a-uuid")
            assert response.status_code == 400
            body = response.json()
            assert body["code"] == "validation-failed"
            assert body["detail"].startswith("path.id: ")

    def test_rejects_a_body_violating_the_model_naming_the_part(self) -> None:
        response = client_for(app_with()).post("/notes", json={"text": ""})
        assert response.status_code == 400
        body = response.json()
        assert body["code"] == "validation-failed"
        assert body["detail"].startswith("body.text: ")

    def test_problem_responses_carry_the_security_headers_too(self) -> None:
        response = client_for(app_with()).get(f"/notes/{UNKNOWN_ID}")
        for name, value in SECURITY_HEADERS.items():
            assert response.headers[name] == value


class TestUndeclaredFailurePaths:
    def test_answers_unknown_routes_with_the_route_not_found_problem(self) -> None:
        response = client_for(app_with()).get("/nope")
        assert response.status_code == 404
        assert response.headers["content-type"] == "application/problem+json"
        assert response.json() == {
            "type": "/problems/route-not-found",
            "title": "No route matches this method and path",
            "status": 404,
            "instance": "/nope",
            "code": "route-not-found",
        }

    def test_answers_a_wrong_verb_on_a_known_path_with_route_not_found(self) -> None:
        response = client_for(app_with()).patch("/notes")
        assert response.status_code == 404
        assert response.json()["code"] == "route-not-found"

    def test_maps_malformed_json_to_validation_failed_instead_of_a_500(self) -> None:
        response = client_for(app_with()).post(
            "/notes", content="{", headers={"content-type": "application/json"}
        )
        assert response.status_code == 400
        body = response.json()
        assert body["code"] == "validation-failed"
        assert body["detail"] == "body.1: JSON decode error"

    def test_maps_an_unexpected_error_to_the_internal_problem_and_logs_it(self) -> None:
        logger = RecordingLogger()
        app = app_with(logger=logger)
        wire_routes(app, [_synthetic_route("boom-error", "/boom-error", _raise_runtime_error)])
        response = client_for(app).get("/boom-error")
        assert response.status_code == 500
        assert response.json() == {
            "type": "/problems/internal",
            "title": "Unexpected server failure",
            "status": 500,
            "instance": "/boom-error",
            "code": "internal",
        }
        for name, value in SECURITY_HEADERS.items():
            assert response.headers[name] == value
        assert logger.errors == [{"event": "unhandled error", "err": "RuntimeError: kaput"}]

    def test_treats_a_framework_exception_outside_404_405_as_internal(self) -> None:
        app = app_with()
        wire_routes(app, [_synthetic_route("boom-teapot", "/boom-teapot", _raise_teapot)])
        response = client_for(app).get("/boom-teapot")
        assert response.status_code == 500
        assert response.json()["code"] == "internal"


def _raise_runtime_error(request: Request) -> dict[str, object]:
    message = "kaput"
    raise RuntimeError(message)


def _raise_teapot(request: Request) -> dict[str, object]:
    raise StarletteHTTPException(status_code=418)


def _synthetic_route(operation_id: str, path: str, endpoint: Endpoint) -> RouteDef:
    return RouteDef(
        operation_id=operation_id,
        method="GET",
        path=path,
        summary="Synthetic test route.",
        endpoint=endpoint,
        status_code=200,
        response_model=None,
        problems=[],
    )
