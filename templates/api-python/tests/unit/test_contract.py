import json
import runpy
from typing import Any

import pytest

from app.adapters.inbound.http.app import problem_responses
from app.adapters.inbound.http.contract import build_openapi_document, emit_text


def operation(document: dict[str, Any], path: str, method: str) -> dict[str, Any]:
    entry = document["paths"].get(path, {}).get(method)
    if entry is None:
        message = f"document has no {method} {path}"
        raise AssertionError(message)
    assert isinstance(entry, dict)
    return entry


class TestBuildOpenapiDocumentOverTheRealRegistry:
    document = build_openapi_document()

    def test_is_deterministic_byte_for_byte(self) -> None:
        assert emit_text() == emit_text()

    def test_sorts_every_objects_keys_canonically(self) -> None:
        text = emit_text()
        assert text == json.dumps(json.loads(text), indent=2, sort_keys=True) + "\n"
        assert text.endswith("}\n")

    def test_groups_the_four_operations_under_two_templated_paths(self) -> None:
        assert sorted(self.document["paths"]) == ["/notes", "/notes/{id}"]
        assert operation(self.document, "/notes", "get")["operationId"] == "notes-list"
        assert operation(self.document, "/notes", "post")["operationId"] == "notes-create"
        assert operation(self.document, "/notes/{id}", "get")["operationId"] == "notes-get"
        assert operation(self.document, "/notes/{id}", "delete")["operationId"] == "notes-delete"

    def test_renders_path_params_as_required_parameters_and_bodies_as_request_body(self) -> None:
        get = operation(self.document, "/notes/{id}", "get")
        (param,) = get["parameters"]
        assert param["name"] == "id"
        assert param["in"] == "path"
        assert param["required"] is True
        create = operation(self.document, "/notes", "post")
        assert "parameters" not in create
        assert create["requestBody"]["required"] is True

    def test_declares_every_success_every_declared_problem_and_the_implicit_500(self) -> None:
        get = operation(self.document, "/notes/{id}", "get")
        assert sorted(get["responses"]) == ["200", "400", "404", "500"]
        assert get["responses"]["404"]["content"] == {
            "application/problem+json": {"schema": {"$ref": "#/components/schemas/Problem"}}
        }
        listing = operation(self.document, "/notes", "get")
        assert sorted(listing["responses"]) == ["200", "500"]
        delete = operation(self.document, "/notes/{id}", "delete")
        assert "204" in delete["responses"]
        assert "content" not in delete["responses"]["204"]

    def test_strips_the_framework_422_noise_entirely(self) -> None:
        for operations in self.document["paths"].values():
            for entry in operations.values():
                assert "422" not in entry["responses"]
        assert "HTTPValidationError" not in self.document["components"]["schemas"]
        assert "ValidationError" not in self.document["components"]["schemas"]

    def test_ships_the_shared_problem_schema_and_a_version_stable_info_block(self) -> None:
        assert self.document["info"] == {"title": "proto-forge-service", "version": "0.1.0"}
        problem = self.document["components"]["schemas"]["Problem"]
        assert problem["required"] == ["type", "title", "status", "instance", "code"]

    def test_documents_the_domain_models_natively(self) -> None:
        schemas = self.document["components"]["schemas"]
        assert "Note" in schemas
        assert "NoteCreate" in schemas
        assert schemas["Note"]["required"] == ["id", "text", "createdAt"]


class TestProblemResponses:
    def test_merges_two_problems_sharing_a_status_into_one_response(self) -> None:
        responses = problem_responses(["note-not-found", "route-not-found"])
        assert responses[404]["description"] == (
            "No note exists under this id; No route matches this method and path"
        )

    def test_refuses_a_problem_code_the_catalogue_does_not_register(self) -> None:
        with pytest.raises(ValueError, match='unknown problem code "unregistered-problem"'):
            problem_responses(["unregistered-problem"])


class TestEmitModule:
    def test_writes_exactly_the_canonical_document_to_stdout(
        self, capsys: pytest.CaptureFixture[str]
    ) -> None:
        runpy.run_module("app.contract_emit", run_name="__main__")
        out = capsys.readouterr().out
        assert out == emit_text()
        assert out.endswith("\n")
