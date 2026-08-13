import pytest
from pydantic import BaseModel, ValidationError

from app.application.validation import validation_detail
from app.domain.note.model import Note


class _Inner(BaseModel):
    inner: str


class _Nested(BaseModel):
    outer: _Inner


def _capture(model: type[BaseModel], data: object) -> ValidationError:
    with pytest.raises(ValidationError) as caught:
        model.model_validate(data)
    return caught.value


class TestValidationDetail:
    def test_renders_one_path_message_line_per_issue_joined_with_semicolons(self) -> None:
        error = _capture(Note, {"id": "nope", "text": "", "createdAt": "nope"})
        assert validation_detail(error) == (
            "id: Input should be a valid UUID, invalid character: found `n` at 1; "
            "text: String should have at least 1 character; "
            "createdAt: Value error, value is not an ISO 8601 datetime"
        )

    def test_joins_nested_paths_with_dots(self) -> None:
        error = _capture(_Nested, {"outer": {}})
        assert validation_detail(error) == "outer.inner: Field required"

    def test_omits_the_path_prefix_for_a_root_level_issue(self) -> None:
        error = _capture(Note, "not-an-object")
        assert validation_detail(error) == (
            "Input should be a valid dictionary or instance of Note"
        )
