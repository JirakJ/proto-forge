# @adr 010 - the Note demo domain
# The Note entity's single source of shape (BRS 12.2): the pydantic model IS the
# schema and the type — fixtures parse through it, the boundary validates with
# it, the contract emits from it. Nothing hand-duplicates the shape.
from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field


def _iso_datetime(value: str) -> str:
    """An ISO 8601 instant with an explicit offset, kept verbatim (byte-stable)."""
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as error:
        message = "value is not an ISO 8601 datetime"
        raise ValueError(message) from error
    if parsed.tzinfo is None:
        message = "an ISO datetime carries an explicit offset"
        raise ValueError(message)
    return value


IsoDateTime = Annotated[str, AfterValidator(_iso_datetime)]


class Note(BaseModel):
    """A stored note. `id` and `created_at` arrive stamped by the caller —
    the domain owns no clock and no id generator."""

    model_config = ConfigDict(frozen=True, populate_by_name=True)

    id: UUID
    text: str = Field(min_length=1, max_length=2000)
    created_at: IsoDateTime = Field(alias="createdAt")


class NoteCreate(BaseModel):
    """The creation shape: exactly the caller-supplied fields, nothing stamped."""

    model_config = ConfigDict(frozen=True)

    text: str = Field(min_length=1, max_length=2000)
