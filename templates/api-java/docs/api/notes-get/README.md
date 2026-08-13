# notes-get — `GET /notes/{id}`

Fetches a single note by its uuid path parameter. The `id` is converted at the
route boundary before any handler runs: a malformed uuid never reaches the
service or the database. The `200` response is one Note object — `id` (uuid),
`text` (1 to 2000 characters) and `createdAt` (ISO instant).

Declared problems: `note-not-found` (404) when the uuid is well-formed but no
note exists under it, and `validation-failed` (400) when the path parameter is
not a uuid (see `examples/notes-get-problem-1.json` and
`examples/notes-get-problem-2.json`). The implicit `internal` (500) applies as
everywhere — see [problems.md](../problems.md).

Captured example (`examples/notes-get-happy-1.json`):

```json
{
  "request": {
    "method": "GET",
    "path": "/notes/11111111-1111-4111-8111-111111111111"
  },
  "response": {
    "body": {
      "createdAt": "2025-01-01T12:00:00Z",
      "id": "11111111-1111-4111-8111-111111111111",
      "text": "Seeded note: the api-java walking skeleton keeps one durable example."
    },
    "headers": {
      "content-type": "application/json"
    },
    "status": 200
  }
}
```
