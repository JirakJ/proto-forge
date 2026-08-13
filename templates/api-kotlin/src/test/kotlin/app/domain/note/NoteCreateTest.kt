package app.domain.note

import app.fixtures.Factory
import app.fixtures.NoteFixtures
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer

// The payload owns its own constraints (§12.2): violations() IS the schema, so
// these cases are the specification of what "a valid note" means - not a
// paraphrase of a validation library's behaviour.
class NoteCreateTest {

    @BeforeTest
    fun resetFixtures() {
        Factory.resetFactorySequence()
    }

    @Test
    fun acceptsTextInsideTheDeclaredBounds() {
        assertEquals(emptyList(), NoteCreate("A note.").violations())
        assertEquals(emptyList(), NoteCreate("x".repeat(NoteCreate.MAX_TEXT)).violations())
    }

    @Test
    fun rejectsBlankText() {
        assertEquals(listOf("text: must not be blank"), NoteCreate("").violations())
        assertEquals(listOf("text: must not be blank"), NoteCreate("   ").violations())
    }

    @Test
    fun rejectsTextPastTheLimit() {
        assertEquals(
            listOf("text: size must be between 0 and 2000"),
            NoteCreate("x".repeat(NoteCreate.MAX_TEXT + 1)).violations(),
        )
    }

    @Test
    fun reportsEveryBrokenConstraintAtOnce() {
        assertEquals(
            listOf("text: must not be blank", "text: size must be between 0 and 2000"),
            NoteCreate(" ".repeat(NoteCreate.MAX_TEXT + 1)).violations(),
        )
    }

    @Test
    fun isValueShapedSoAPayloadCanBeComparedAndLogged() {
        val payload = NoteCreate("A note.")

        assertTrue(payload == payload)
        assertEquals(NoteCreate("A note."), payload)
        assertNotEquals(NoteCreate("Another note."), payload)
        @Suppress("EqualsBetweenInconvertibleTypes")
        assertFalse(payload.equals(42), "a foreign type is never equal to a NoteCreate")
        assertEquals(NoteCreate("A note.").hashCode(), payload.hashCode())
        assertNotEquals(NoteCreate("Another note.").hashCode(), payload.hashCode())
        assertTrue(payload.toString().contains("A note."), payload.toString())
        assertEquals("A note.", payload.component1())
        assertEquals(payload, payload.copy())
        assertEquals(NoteCreate("Edited."), payload.copy(text = "Edited."))
    }

    @Test
    fun parsesFromTheWireShapeTheContractDescribes() {
        assertEquals(
            NoteCreate("A note."),
            Json.decodeFromString(serializer<NoteCreate>(), "{\"text\":\"A note.\"}"),
        )
        assertEquals(
            "{\"text\":\"A note.\"}",
            Json.encodeToString(serializer<NoteCreate>(), NoteCreate("A note.")),
        )
    }

    @Test
    fun refusesAWireDocumentThatIsMissingAField() {
        // A request body without `text` is rejected by the decoder, not defaulted
        // to the empty string - which is why the handler can turn a
        // SerializationException into the registered validation-failed problem.
        assertEquals(
            "Field 'text' is required for type app.domain.note.NoteCreate, but it was missing",
            assertFailsWith<SerializationException> {
                Json.decodeFromString(serializer<NoteCreate>(), "{}")
            }.message,
        )
    }

    @Test
    fun theDescriptorIsTheContractTheEmitterReads() {
        val descriptor = NoteCreateSerializer.descriptor

        assertEquals("app.domain.note.NoteCreate", descriptor.serialName)
        assertEquals(listOf("text"), (0 until descriptor.elementsCount).map(descriptor::getElementName))
    }

    @Test
    fun fixturesSatisfyTheirOwnConstraints() {
        assertEquals(emptyList(), NoteFixtures.NOTE_CREATES().violations())
    }
}
