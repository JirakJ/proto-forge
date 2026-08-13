from uuid import UUID

import pytest
from pydantic import ValidationError

from app.domain.note.__fixtures__.note_factory import make_note, make_note_create
from app.domain.note.model import Note, NoteCreate


class TestNote:
    def test_accepts_a_factory_built_note_and_keeps_its_fields_verbatim(self) -> None:
        note = make_note()
        assert Note.model_validate(note) == note
        assert note.id == UUID("00000000-0000-4000-8000-000000000001")
        assert note.created_at == "2025-01-01T00:00:01.000Z"

    def test_rejects_a_non_uuid_id(self) -> None:
        note = make_note()
        with pytest.raises(ValidationError):
            Note.model_validate({**note.model_dump(by_alias=True), "id": "not-a-uuid"})

    def test_rejects_a_created_at_that_is_not_an_iso_datetime(self) -> None:
        note = make_note()
        with pytest.raises(ValidationError) as caught:
            Note.model_validate({**note.model_dump(by_alias=True), "createdAt": "yesterday"})
        assert caught.value.errors()[0]["msg"] == (
            "Value error, value is not an ISO 8601 datetime"
        )

    def test_rejects_a_created_at_without_an_explicit_offset(self) -> None:
        note = make_note()
        with pytest.raises(ValidationError) as caught:
            Note.model_validate(
                {**note.model_dump(by_alias=True), "createdAt": "2025-01-01T00:00:01"}
            )
        assert caught.value.errors()[0]["msg"] == (
            "Value error, an ISO datetime carries an explicit offset"
        )

    def test_accepts_text_at_exactly_the_2000_character_ceiling(self) -> None:
        note = make_note(text="x" * 2000)
        assert len(note.text) == 2000

    def test_rejects_empty_text_and_text_past_the_ceiling(self) -> None:
        note = make_note().model_dump(by_alias=True)
        with pytest.raises(ValidationError):
            Note.model_validate({**note, "text": ""})
        with pytest.raises(ValidationError):
            Note.model_validate({**note, "text": "x" * 2001})

    def test_populates_by_field_name_and_serializes_by_alias(self) -> None:
        note = Note(id=UUID(int=1), text="named", created_at="2025-01-01T00:00:00Z")
        assert note.model_dump(by_alias=True)["createdAt"] == "2025-01-01T00:00:00Z"


class TestNoteCreate:
    def test_accepts_only_the_text_field(self) -> None:
        assert make_note_create() == NoteCreate(text="Fixture note 1")

    def test_ignores_fields_outside_the_creation_shape(self) -> None:
        parsed = NoteCreate.model_validate({"text": "kept", "id": "dropped"})
        assert parsed.model_dump() == {"text": "kept"}

    def test_rejects_a_missing_text_field(self) -> None:
        with pytest.raises(ValidationError):
            NoteCreate.model_validate({})
