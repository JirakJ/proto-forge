from datetime import UTC, datetime, timedelta

from app.domain.__fixtures__.factory import define_factory
from app.domain.note.model import Note, NoteCreate

_EPOCH = datetime(2025, 1, 1, tzinfo=UTC)


def _fixture_uuid(seq: int) -> str:
    """Deterministic uuid for sequence `seq` (version/variant bits fixed by hand)."""
    return f"00000000-0000-4000-8000-{seq:012d}"


def _fixture_instant(seq: int) -> str:
    return (_EPOCH + timedelta(seconds=seq)).strftime("%Y-%m-%dT%H:%M:%S") + ".000Z"


make_note = define_factory(
    Note,
    lambda seq: {
        "id": _fixture_uuid(seq),
        "text": f"Fixture note {seq}",
        "createdAt": _fixture_instant(seq),
    },
)

make_note_create = define_factory(NoteCreate, lambda seq: {"text": f"Fixture note {seq}"})
