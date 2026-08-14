# notes-delete — `DELETE /notes/{id}`

Deletes a note by its uuid path parameter. Deletion is definite: the `204`
response carries no body, and a second delete of the same id is a
`note-not-found`, never a silent success — the repository port reports whether
a row actually existed.

Declared problems: `note-not-found` (404) when the uuid is well-formed but no
note exists under it (`examples/notes-delete-problem-1.json`), and
`validation-failed` (400) when the path parameter is not a uuid
(`examples/notes-delete-problem-2.json`). The implicit `internal` (500) applies
as everywhere — see [problems.md](../problems.md).

Captured example (`examples/notes-delete-happy-1.json` — the second seeded note
exists precisely so this scenario can consume it):

```json
{
  "request": {
    "method": "DELETE",
    "path": "/notes/22222222-2222-4222-8222-222222222222"
  },
  "response": {
    "body": null,
    "headers": {
      "content-type": ""
    },
    "status": 204
  }
}
```
