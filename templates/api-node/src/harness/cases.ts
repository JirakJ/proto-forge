// The scenario registry: PURE DATA, no imports. One scenario per
// (operation x outcome) — every operation's happy path and every problem it
// declares. The e2e conformance runner replays these against the app and the
// capture script turns the same replays into docs/api examples (BR-26), so a
// scenario missing here is an outcome nothing proves and nothing documents.

export type HarnessCase = {
  /** `<operationId>-<state>-<n>` — addressable, unique. */
  id: string;
  operationId: string;
  state: "happy" | "problem";
  /** Why this scenario exists, for a reader of the docs examples. */
  note: string;
  request: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    body?: Record<string, unknown>;
  };
  expect: {
    status: number;
    /** Problem code the response body must carry when state is "problem". */
    problem?: string;
  };
};

// Fixed identities the seed creates (seed.ts imports these): byte-stable ids
// make the captured examples byte-stable.
export const SEED_NOTE_ID = "11111111-1111-4111-8111-111111111111";
export const SEED_DELETE_TARGET_ID = "22222222-2222-4222-8222-222222222222";
export const SEED_CLOCK = "2025-01-01T12:00:00.000Z";
export const SEED_NOTE_TEXT = "Seeded note: the api-node walking skeleton keeps one durable example.";
export const SEED_DELETE_TARGET_TEXT = "Second seeded note, deleted by the delete happy-path scenario.";

const UNKNOWN_NOTE_ID = "99999999-9999-4999-8999-999999999999";

// Scenarios run in array order; the delete happy path consumes the second
// seeded note, never the first, so earlier reads stay valid.
export const cases: HarnessCase[] = [
  {
    id: "notes-list-happy-1",
    operationId: "notes-list",
    state: "happy",
    note: "Both seeded notes, oldest first.",
    request: { method: "GET", path: "/notes" },
    expect: { status: 200 },
  },
  {
    id: "notes-get-happy-1",
    operationId: "notes-get",
    state: "happy",
    note: "The permanent seeded note, fetched by its fixed id.",
    request: { method: "GET", path: `/notes/${SEED_NOTE_ID}` },
    expect: { status: 200 },
  },
  {
    id: "notes-get-problem-1",
    operationId: "notes-get",
    state: "problem",
    note: "A well-formed id no note exists under.",
    request: { method: "GET", path: `/notes/${UNKNOWN_NOTE_ID}` },
    expect: { status: 404, problem: "note-not-found" },
  },
  {
    id: "notes-get-problem-2",
    operationId: "notes-get",
    state: "problem",
    note: "A path parameter that is not a uuid fails boundary validation.",
    request: { method: "GET", path: "/notes/not-a-uuid" },
    expect: { status: 400, problem: "validation-failed" },
  },
  {
    id: "notes-create-happy-1",
    operationId: "notes-create",
    state: "happy",
    note: "Creates a note; id and createdAt are stamped server-side.",
    request: {
      method: "POST",
      path: "/notes",
      body: { text: "A brand new note created by the conformance suite." },
    },
    expect: { status: 201 },
  },
  {
    id: "notes-create-problem-1",
    operationId: "notes-create",
    state: "problem",
    note: "Empty text violates the Note schema's minimum length.",
    request: { method: "POST", path: "/notes", body: { text: "" } },
    expect: { status: 400, problem: "validation-failed" },
  },
  {
    id: "notes-delete-happy-1",
    operationId: "notes-delete",
    state: "happy",
    note: "Deletes the second seeded note; 204 carries no body.",
    request: { method: "DELETE", path: `/notes/${SEED_DELETE_TARGET_ID}` },
    expect: { status: 204 },
  },
  {
    id: "notes-delete-problem-1",
    operationId: "notes-delete",
    state: "problem",
    note: "Deleting an id that never existed.",
    request: { method: "DELETE", path: `/notes/${UNKNOWN_NOTE_ID}` },
    expect: { status: 404, problem: "note-not-found" },
  },
  {
    id: "notes-delete-problem-2",
    operationId: "notes-delete",
    state: "problem",
    note: "A non-uuid path parameter fails boundary validation.",
    request: { method: "DELETE", path: "/notes/not-a-uuid" },
    expect: { status: 400, problem: "validation-failed" },
  },
];
