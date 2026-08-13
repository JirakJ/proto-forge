# notes-delete — `DELETE /notes/:id`

Deletes the note under the given uuid path parameter. Deletion is verified, not
assumed: the operation reports success only when a row actually existed and was
removed. The `204` response carries no body and no content type — there is
nothing to represent once the note is gone. Deleting the same id twice
therefore yields `note-not-found` on the second attempt; the operation is not
idempotent in its response, only in its effect.

Declared problems: `note-not-found` (404) when no note exists under a
well-formed uuid (`examples/notes-delete-problem-1.json`) and
`validation-failed` (400) when the path parameter is not a uuid
(`examples/notes-delete-problem-2.json`). The implicit `internal` (500) applies
as everywhere — see [problems.md](../problems.md).

Captured example (`examples/notes-delete-happy-1.json`):

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
