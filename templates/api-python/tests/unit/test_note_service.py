from collections.abc import Iterable

import pytest

from app.application.note.__fixtures__.memory_repo import MemoryNoteRepository
from app.application.note.note_service import NoteService
from app.domain.note.__fixtures__.note_factory import make_note
from app.domain.note.model import Note
from app.platform.problems import AppProblem

FIXED_NOW = "2025-06-01T08:30:00.000Z"
FIXED_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


def service_with(notes: Iterable[Note] = ()) -> NoteService:
    return NoteService(
        repo=MemoryNoteRepository(notes), now=lambda: FIXED_NOW, new_id=lambda: FIXED_ID
    )


def problem_code(caught: pytest.ExceptionInfo[AppProblem]) -> str:
    return caught.value.definition.code


class TestListNotes:
    def test_returns_every_note_oldest_first(self) -> None:
        older = make_note()
        newer = make_note()
        assert service_with([newer, older]).list_notes() == [older, newer]

    def test_returns_an_empty_list_from_an_empty_store(self) -> None:
        assert service_with().list_notes() == []


class TestGetNote:
    def test_returns_the_note_under_the_id(self) -> None:
        note = make_note()
        assert service_with([note]).get_note(str(note.id)) == note

    def test_raises_the_note_not_found_problem_for_an_unknown_id(self) -> None:
        with pytest.raises(AppProblem) as caught:
            service_with().get_note(FIXED_ID)
        assert problem_code(caught) == "note-not-found"
        assert caught.value.definition.status == 404


class TestCreateNote:
    def test_stamps_the_injected_id_and_clock_onto_valid_input(self) -> None:
        service = service_with()
        created = service.create_note({"text": "fresh"})
        assert created.model_dump(by_alias=True, mode="json") == {
            "id": FIXED_ID,
            "text": "fresh",
            "createdAt": FIXED_NOW,
        }
        assert service.get_note(FIXED_ID) == created

    def test_rejects_input_violating_the_model_with_a_field_level_detail(self) -> None:
        with pytest.raises(AppProblem) as caught:
            service_with().create_note({"text": ""})
        assert problem_code(caught) == "validation-failed"
        assert caught.value.definition.status == 400
        assert caught.value.detail is not None
        assert caught.value.detail.startswith("text: ")

    def test_rejects_a_non_dict_payload_with_a_root_level_detail(self) -> None:
        with pytest.raises(AppProblem) as caught:
            service_with().create_note(None)
        assert problem_code(caught) == "validation-failed"
        assert caught.value.detail == (
            "Input should be a valid dictionary or instance of NoteCreate"
        )


class TestDeleteNote:
    def test_removes_the_note_under_the_id(self) -> None:
        note = make_note()
        service = service_with([note])
        service.delete_note(str(note.id))
        assert service.list_notes() == []

    def test_raises_the_note_not_found_problem_when_nothing_was_deleted(self) -> None:
        with pytest.raises(AppProblem) as caught:
            service_with().delete_note(FIXED_ID)
        assert problem_code(caught) == "note-not-found"
