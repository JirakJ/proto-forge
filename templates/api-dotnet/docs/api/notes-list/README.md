# notes-list — `GET /notes`

Lists every stored note, oldest first: results are ordered by `createdAt` with
`id` as the tie-break, so the order is total and stable across runs. The
operation takes no parameters and no body. The `200` response is a JSON array
of Note objects — `id` (uuid), `text` (1 to 2000 characters) and `createdAt`
(ISO instant) — and an empty store yields an empty array rather than an error.

Declared problems: none of its own. Like every operation it can emit the
implicit `internal` (500) problem — see [problems.md](../problems.md).

Captured example (`examples/notes-list-happy-1.json`, replayed by the e2e
conformance suite against the seeded fixture repository):

```json
{
  "request": {
    "method": "GET",
    "path": "/notes"
  },
  "response": {
    "body": [
      {
        "createdAt": "2025-01-01T12:00:00Z",
        "id": "11111111-1111-4111-8111-111111111111",
        "text": "Seeded note: the api-dotnet walking skeleton keeps one durable example."
      },
      {
        "createdAt": "2025-01-01T12:00:00Z",
        "id": "22222222-2222-4222-8222-222222222222",
        "text": "Second seeded note, deleted by the delete happy-path scenario."
      }
    ],
    "headers": {
      "content-type": "application/json"
    },
    "status": 200
  }
}
```
