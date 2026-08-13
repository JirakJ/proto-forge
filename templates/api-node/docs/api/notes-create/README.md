# notes-create — `POST /notes`

Creates a note from a JSON body of the shape `{ "text": string }`, where `text`
is 1 to 2000 characters. The server stamps everything else: `id` comes from the
injected id source (crypto.randomUUID in production) and `createdAt` from the
injected clock, which is why the captured example below shows the conformance
run's pinned constants. The `201` response returns the complete Note object.
Unknown body fields are stripped, not rejected.

Declared problems: `validation-failed` (400) when the body is missing, is not
valid JSON, or violates the schema — `detail` names the offending field (see
`examples/notes-create-problem-1.json`). The implicit `internal` (500) applies
as everywhere — see [problems.md](../problems.md).

Captured example (`examples/notes-create-happy-1.json`):

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
      "createdAt": "2025-01-01T12:00:00.000Z",
      "id": "00000000-0000-4000-8000-000000000001",
      "text": "A brand new note created by the conformance suite."
    },
    "headers": {
      "content-type": "application/json; charset=utf-8"
    },
    "status": 201
  }
}
```
