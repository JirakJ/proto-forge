package app.platform

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlinx.serialization.json.jsonPrimitive

class ProblemsTest {

    @Test
    fun everyKeyEqualsItsEntrysCode() {
        for ((key, def) in Problems.PROBLEMS) {
            assertEquals(key, def.code, "one name per problem (BR-23)")
        }
    }

    @Test
    fun byCodeReturnsTheRegisteredDefinition() {
        val def = Problems.byCode("note-not-found")

        assertEquals(404, def.status)
        assertEquals("No note exists under this id", def.title)
    }

    @Test
    fun byCodeRefusesAnUnregisteredCode() {
        assertFailsWith<IllegalArgumentException> { Problems.byCode("ghost-error") }
    }

    @Test
    fun appProblemBodyIsTheRfc9457Document() {
        val body = AppProblem("note-not-found").body("/notes/x")

        assertEquals("/problems/note-not-found", body["type"]?.jsonPrimitive?.content)
        assertEquals("No note exists under this id", body["title"]?.jsonPrimitive?.content)
        assertEquals("404", body["status"]?.jsonPrimitive?.content)
        assertEquals("/notes/x", body["instance"]?.jsonPrimitive?.content)
        assertEquals("note-not-found", body["code"]?.jsonPrimitive?.content)
        assertFalse(body.containsKey("detail"), "no detail member unless the failure has one")
    }

    @Test
    fun appProblemCarriesItsDetailWhenGiven() {
        val body = AppProblem("validation-failed", "text: must not be blank").body("/notes")

        assertEquals("text: must not be blank", body["detail"]?.jsonPrimitive?.content)
        assertEquals("400", body["status"]?.jsonPrimitive?.content)
    }

    @Test
    fun theDefinitionIsValueShaped() {
        assertEquals(ProblemDef("x", 400, "X"), ProblemDef("x", 400, "X"))
    }
}
