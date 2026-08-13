# Problem catalogue

Every client-visible failure this service can emit is a registered RFC 9457
problem type (BR-23), served as `application/problem+json`. The catalogue below
is the single source a consumer programs against and a frontend translates
from: responses always carry the stable `code` plus an English `title`, and a
`detail` member appears only when the failure has field-level context worth
relaying (validation issues name the offending request part and field). The
`type` member is a stable relative URI, `/problems/<code>`, and `instance` is
the request path that produced the failure. Codes are append-only: removing or
renaming one is a breaking contract change. The source of truth is
`src/platform/problems.ts`; the `error:catalog` gate fails an unregistered
shape, a duplicate code, and an entry no code can emit.

| Code | Status | Title | When it happens |
| ---- | ------ | ----- | --------------- |
| `validation-failed` | 400 | The request does not match the operation's schema | A request part (params, query or body) fails its zod schema at the route boundary, the create payload fails the domain schema, or the JSON body cannot be parsed at all. `detail` names the part and field. |
| `note-not-found` | 404 | No note exists under this id | `notes-get` or `notes-delete` addresses a well-formed uuid that no stored note carries. |
| `route-not-found` | 404 | No route matches this method and path | The method/path pair matches no registered operation and no platform route — the wrong verb on a known path included. |
| `internal` | 500 | Unexpected server failure | Any error that is not a registered problem reaches the global error handler. The cause is logged server-side; the response body never leaks it. Every operation can implicitly emit this. |
