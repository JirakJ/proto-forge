# The scenario registry: PURE DATA, stdlib imports only. One scenario per
# (operation x outcome) — every operation's happy path and every problem it
# declares. The e2e conformance runner replays these against the app and the
# capture script turns the same replays into docs/api examples (BR-26), so a
# scenario missing here is an outcome nothing proves and nothing documents.
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class HarnessRequest:
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
    path: str
    body: dict[str, object] | None = None


@dataclass(frozen=True)
class HarnessExpect:
    status: int
    # Problem code the response body must carry when state is "problem".
    problem: str | None = None


@dataclass(frozen=True)
class HarnessCase:
    # `<operationId>-<state>-<n>` — addressable, unique.
    id: str
    operation_id: str
    state: Literal["happy", "problem"]
    # Why this scenario exists, for a reader of the docs examples.
    note: str
    request: HarnessRequest
    expect: HarnessExpect


# Fixed identities the seed creates (seed.py imports these): byte-stable ids
# make the captured examples byte-stable.
SEED_NOTE_ID = "11111111-1111-4111-8111-111111111111"
SEED_DELETE_TARGET_ID = "22222222-2222-4222-8222-222222222222"
SEED_CLOCK = "2025-01-01T12:00:00.000Z"
SEED_NOTE_TEXT = "Seeded note: the api-python walking skeleton keeps one durable example."
SEED_DELETE_TARGET_TEXT = "Second seeded note, deleted by the delete happy-path scenario."

_UNKNOWN_NOTE_ID = "99999999-9999-4999-8999-999999999999"

# Scenarios run in list order; the delete happy path consumes the second
# seeded note, never the first, so earlier reads stay valid.
cases: list[HarnessCase] = [
    HarnessCase(
        id="notes-list-happy-1",
        operation_id="notes-list",
        state="happy",
        note="Both seeded notes, oldest first.",
        request=HarnessRequest(method="GET", path="/notes"),
        expect=HarnessExpect(status=200),
    ),
    HarnessCase(
        id="notes-get-happy-1",
        operation_id="notes-get",
        state="happy",
        note="The permanent seeded note, fetched by its fixed id.",
        request=HarnessRequest(method="GET", path=f"/notes/{SEED_NOTE_ID}"),
        expect=HarnessExpect(status=200),
    ),
    HarnessCase(
        id="notes-get-problem-1",
        operation_id="notes-get",
        state="problem",
        note="A well-formed id no note exists under.",
        request=HarnessRequest(method="GET", path=f"/notes/{_UNKNOWN_NOTE_ID}"),
        expect=HarnessExpect(status=404, problem="note-not-found"),
    ),
    HarnessCase(
        id="notes-get-problem-2",
        operation_id="notes-get",
        state="problem",
        note="A path parameter that is not a uuid fails boundary validation.",
        request=HarnessRequest(method="GET", path="/notes/not-a-uuid"),
        expect=HarnessExpect(status=400, problem="validation-failed"),
    ),
    HarnessCase(
        id="notes-create-happy-1",
        operation_id="notes-create",
        state="happy",
        note="Creates a note; id and createdAt are stamped server-side.",
        request=HarnessRequest(
            method="POST",
            path="/notes",
            body={"text": "A brand new note created by the conformance suite."},
        ),
        expect=HarnessExpect(status=201),
    ),
    HarnessCase(
        id="notes-create-problem-1",
        operation_id="notes-create",
        state="problem",
        note="Empty text violates the Note model's minimum length.",
        request=HarnessRequest(method="POST", path="/notes", body={"text": ""}),
        expect=HarnessExpect(status=400, problem="validation-failed"),
    ),
    HarnessCase(
        id="notes-delete-happy-1",
        operation_id="notes-delete",
        state="happy",
        note="Deletes the second seeded note; 204 carries no body.",
        request=HarnessRequest(method="DELETE", path=f"/notes/{SEED_DELETE_TARGET_ID}"),
        expect=HarnessExpect(status=204),
    ),
    HarnessCase(
        id="notes-delete-problem-1",
        operation_id="notes-delete",
        state="problem",
        note="Deleting an id that never existed.",
        request=HarnessRequest(method="DELETE", path=f"/notes/{_UNKNOWN_NOTE_ID}"),
        expect=HarnessExpect(status=404, problem="note-not-found"),
    ),
    HarnessCase(
        id="notes-delete-problem-2",
        operation_id="notes-delete",
        state="problem",
        note="A non-uuid path parameter fails boundary validation.",
        request=HarnessRequest(method="DELETE", path="/notes/not-a-uuid"),
        expect=HarnessExpect(status=400, problem="validation-failed"),
    ),
]
