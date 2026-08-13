package app.harness

/**
 * One scenario: an operation crossed with an outcome. PURE DATA - the e2e
 * conformance runner replays these against the Ktor test application and the
 * capture writer turns the same replays into docs/api examples (BR-26).
 *
 * @property id `<operationId>-<state>-<n>` - addressable, unique
 * @property operationId the registry entry the scenario exercises (BR-25)
 * @property state "happy" or "problem"
 * @property note why this scenario exists, for a reader of the docs examples
 * @property method HTTP method
 * @property path request path
 * @property body JSON request body, or null for none
 * @property expectStatus expected response status
 * @property expectProblem problem code the body must carry when state is "problem"; else null
 */
data class HarnessCase(
    val id: String,
    val operationId: String,
    val state: String,
    val note: String,
    val method: String,
    val path: String,
    val body: String?,
    val expectStatus: Int,
    val expectProblem: String?,
)

// The scenario registry: PURE DATA, no application imports. One scenario per
// (operation x outcome) - every operation's happy path and every problem it
// declares. The e2e conformance runner replays these against the test
// application and the capture writer turns the same replays into docs/api
// examples (BR-26), so a scenario missing here is an outcome nothing proves and
// nothing documents. The ids and paths mirror api-node's harness exactly: the
// same nine scenarios, so a consumer reading either template's docs sees the
// same walking skeleton.
object HarnessCases {

    // Fixed identities the seed creates (HarnessSeed uses these): byte-stable ids
    // make the captured examples byte-stable.
    const val SEED_NOTE_ID = "11111111-1111-4111-8111-111111111111"
    const val SEED_DELETE_TARGET_ID = "22222222-2222-4222-8222-222222222222"
    const val SEED_CLOCK = "2025-01-01T12:00:00Z"
    const val SEED_NOTE_TEXT = "Seeded note: the api-kotlin walking skeleton keeps one durable example."
    const val SEED_DELETE_TARGET_TEXT = "Second seeded note, deleted by the delete happy-path scenario."

    private const val UNKNOWN_NOTE_ID = "99999999-9999-4999-8999-999999999999"

    // Scenarios run in list order; the delete happy path consumes the second
    // seeded note, never the first, so earlier reads stay valid.
    val CASES: List<HarnessCase> = listOf(
        HarnessCase(
            "notes-list-happy-1",
            "notes-list",
            "happy",
            "Both seeded notes, oldest first.",
            "GET", "/notes", null, 200, null,
        ),
        HarnessCase(
            "notes-get-happy-1",
            "notes-get",
            "happy",
            "The permanent seeded note, fetched by its fixed id.",
            "GET", "/notes/$SEED_NOTE_ID", null, 200, null,
        ),
        HarnessCase(
            "notes-get-problem-1",
            "notes-get",
            "problem",
            "A well-formed id no note exists under.",
            "GET", "/notes/$UNKNOWN_NOTE_ID", null, 404, "note-not-found",
        ),
        HarnessCase(
            "notes-get-problem-2",
            "notes-get",
            "problem",
            "A path parameter that is not a uuid fails boundary validation.",
            "GET", "/notes/not-a-uuid", null, 400, "validation-failed",
        ),
        HarnessCase(
            "notes-create-happy-1",
            "notes-create",
            "happy",
            "Creates a note; id and createdAt are stamped server-side.",
            "POST", "/notes", "{\"text\":\"A brand new note created by the conformance suite.\"}", 201, null,
        ),
        HarnessCase(
            "notes-create-problem-1",
            "notes-create",
            "problem",
            "Empty text violates the Note schema's blank constraint.",
            "POST", "/notes", "{\"text\":\"\"}", 400, "validation-failed",
        ),
        HarnessCase(
            "notes-delete-happy-1",
            "notes-delete",
            "happy",
            "Deletes the second seeded note; 204 carries no body.",
            "DELETE", "/notes/$SEED_DELETE_TARGET_ID", null, 204, null,
        ),
        HarnessCase(
            "notes-delete-problem-1",
            "notes-delete",
            "problem",
            "Deleting an id that never existed.",
            "DELETE", "/notes/$UNKNOWN_NOTE_ID", null, 404, "note-not-found",
        ),
        HarnessCase(
            "notes-delete-problem-2",
            "notes-delete",
            "problem",
            "A non-uuid path parameter fails boundary validation.",
            "DELETE", "/notes/not-a-uuid", null, 400, "validation-failed",
        ),
    )
}
