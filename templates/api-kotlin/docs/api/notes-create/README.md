# notes-create — `POST /notes`

Creates a note from a JSON body of the shape `{ "text": string }`. The text is
validated against the domain constraints (non-blank, at most 2000 characters)
inside the application service; `id` and `createdAt` are stamped server-side
from the injected id source and clock, never accepted from the client. The
`201` response is the stored Note object.

Declared problems: `validation-failed` (400) when the text violates the
constraints or the JSON body is malformed or missing — `detail` names the
offending field per violation, sorted and deterministic (see
`examples/notes-create-problem-1.json`). The implicit `internal` (500) applies
as everywhere — see [problems.md](../problems.md).

**The length limit is enforced here, not in the schema.** The committed
contract describes `text` as `{"type": "string"}` with no `maxLength`: the
2000-character rule lives in `NoteCreate.violations()`, which is the single
place it is declared and enforced, and a `SerialDescriptor` carries no
constraint metadata to derive it from (ADR 008 records the limit; ADR 010
records why the rule lives where it does). A client that sends more gets the
`validation-failed` problem above with `text: size must be between 0 and 2000`
in `detail` — the widening is in the spec, never in the service.

Captured example (`examples/notes-create-happy-1.json` — the fixture id source
makes the stamped id byte-stable):

```json
{
  "request": {
    "body": {
      "text": "A brand new note created by the conformance suite."
    },
    "method": "POST",
    "path": "/notes"
  },
  "response": {
    "body": {
      "createdAt": "2025-01-01T12:00:00Z",
      "id": "00000000-0000-4000-8000-000000000001",
      "text": "A brand new note created by the conformance suite."
    },
    "headers": {
      "content-type": "application/json"
    },
    "status": 201
  }
}
```
