package app.harness;

import java.util.List;

// The scenario registry: PURE DATA, no application imports. One scenario per
// (operation x outcome) - every operation's happy path and every problem it
// declares. The e2e conformance runner replays these against the MockMvc slice
// and the capture writer turns the same replays into docs/api examples (BR-26),
// so a scenario missing here is an outcome nothing proves and nothing documents.
public final class HarnessCases {

  // Fixed identities the seed creates (HarnessSeed uses these): byte-stable ids
  // make the captured examples byte-stable.
  public static final String SEED_NOTE_ID = "11111111-1111-4111-8111-111111111111";
  public static final String SEED_DELETE_TARGET_ID = "22222222-2222-4222-8222-222222222222";
  public static final String SEED_CLOCK = "2025-01-01T12:00:00Z";
  public static final String SEED_NOTE_TEXT =
      "Seeded note: the api-java walking skeleton keeps one durable example.";
  public static final String SEED_DELETE_TARGET_TEXT =
      "Second seeded note, deleted by the delete happy-path scenario.";

  private static final String UNKNOWN_NOTE_ID = "99999999-9999-4999-8999-999999999999";

  // Scenarios run in list order; the delete happy path consumes the second
  // seeded note, never the first, so earlier reads stay valid.
  public static final List<HarnessCase> CASES = List.of(
      new HarnessCase(
          "notes-list-happy-1",
          "notes-list",
          "happy",
          "Both seeded notes, oldest first.",
          "GET", "/notes", null, 200, null),
      new HarnessCase(
          "notes-get-happy-1",
          "notes-get",
          "happy",
          "The permanent seeded note, fetched by its fixed id.",
          "GET", "/notes/" + SEED_NOTE_ID, null, 200, null),
      new HarnessCase(
          "notes-get-problem-1",
          "notes-get",
          "problem",
          "A well-formed id no note exists under.",
          "GET", "/notes/" + UNKNOWN_NOTE_ID, null, 404, "note-not-found"),
      new HarnessCase(
          "notes-get-problem-2",
          "notes-get",
          "problem",
          "A path parameter that is not a uuid fails boundary validation.",
          "GET", "/notes/not-a-uuid", null, 400, "validation-failed"),
      new HarnessCase(
          "notes-create-happy-1",
          "notes-create",
          "happy",
          "Creates a note; id and createdAt are stamped server-side.",
          "POST", "/notes", "{\"text\":\"A brand new note created by the conformance suite.\"}", 201, null),
      new HarnessCase(
          "notes-create-problem-1",
          "notes-create",
          "problem",
          "Empty text violates the Note schema's blank constraint.",
          "POST", "/notes", "{\"text\":\"\"}", 400, "validation-failed"),
      new HarnessCase(
          "notes-delete-happy-1",
          "notes-delete",
          "happy",
          "Deletes the second seeded note; 204 carries no body.",
          "DELETE", "/notes/" + SEED_DELETE_TARGET_ID, null, 204, null),
      new HarnessCase(
          "notes-delete-problem-1",
          "notes-delete",
          "problem",
          "Deleting an id that never existed.",
          "DELETE", "/notes/" + UNKNOWN_NOTE_ID, null, 404, "note-not-found"),
      new HarnessCase(
          "notes-delete-problem-2",
          "notes-delete",
          "problem",
          "A non-uuid path parameter fails boundary validation.",
          "DELETE", "/notes/not-a-uuid", null, 400, "validation-failed"));

  private HarnessCases() {}
}
