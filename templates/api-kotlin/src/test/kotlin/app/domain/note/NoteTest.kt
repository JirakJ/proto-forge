package app.domain.note

import app.fixtures.Factory
import app.fixtures.NoteFixtures
import java.time.Instant
import java.util.UUID
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer

// The domain entity is a data class, so the compiler writes part of it: equality,
// hashing, rendering, copying and destructuring are behaviour a consumer relies
// on (the repository de-duplicates by equality, the conformance replay compares
// whole notes), and the 1.00 floor on app.domain covers generated members exactly
// like hand-written ones. That is the point of the floor, not an accident of it.
class NoteTest {

    private val id = UUID.fromString("00000000-0000-4000-8000-000000000001")
    private val other = UUID.fromString("00000000-0000-4000-8000-000000000002")
    private val at = Instant.parse("2025-01-01T12:00:00Z")
    private val note = Note(id, "A note.", at)

    @BeforeTest
    fun resetFixtures() {
        Factory.resetFactorySequence()
    }

    @Test
    fun carriesItsThreeComponents() {
        val (noteId, text, createdAt) = note

        assertEquals(id, noteId)
        assertEquals("A note.", text)
        assertEquals(at, createdAt)
    }

    @Test
    fun equalsIsIdentityThenFieldByField() {
        assertTrue(note == note, "the same instance is equal to itself")
        assertEquals(note, Note(id, "A note.", at))
        assertNotEquals(note, Note(other, "A note.", at))
        assertNotEquals(note, Note(id, "Another note.", at))
        assertNotEquals(note, Note(id, "A note.", at.plusSeconds(1)))
        @Suppress("EqualsBetweenInconvertibleTypes")
        assertFalse(note.equals("not a note"), "a foreign type is never equal to a Note")
    }

    @Test
    fun hashCodeAgreesWithEquality() {
        assertEquals(note.hashCode(), Note(id, "A note.", at).hashCode())
        assertNotEquals(note.hashCode(), Note(other, "A note.", at).hashCode())
    }

    @Test
    fun rendersEveryFieldForALogLine() {
        val rendered = note.toString()

        assertTrue(rendered.contains(id.toString()), rendered)
        assertTrue(rendered.contains("A note."), rendered)
        assertTrue(rendered.contains(at.toString()), rendered)
    }

    @Test
    fun copyReplacesOnlyWhatItIsGiven() {
        assertEquals(note, note.copy())
        assertEquals(Note(id, "Edited.", at), note.copy(text = "Edited."))
        assertEquals(Note(other, "Edited.", at.plusSeconds(5)), note.copy(other, "Edited.", at.plusSeconds(5)))
    }

    @Test
    fun serialisesToTheWireShapeTheContractDescribes() {
        val json = Json.encodeToString(serializer<Note>(), note)

        assertEquals(
            "{\"id\":\"00000000-0000-4000-8000-000000000001\",\"text\":\"A note.\"," +
                "\"createdAt\":\"2025-01-01T12:00:00Z\"}",
            json,
        )
        assertEquals(note, Json.decodeFromString(serializer<Note>(), json))
    }

    @Test
    fun refusesAWireDocumentThatIsMissingAField() {
        // The decoder is part of the contract: a document without every declared
        // member is rejected at the boundary, never defaulted into a Note. Each
        // field earns its own case, because "which one is missing" is the message
        // a consumer has to act on.
        assertEquals(
            "Field 'id' is required for type app.domain.note.Note, but it was missing",
            assertFailsWith<SerializationException> { Json.decodeFromString(serializer<Note>(), "{}") }.message,
        )
        assertEquals(
            "Field 'text' is required for type app.domain.note.Note, but it was missing",
            assertFailsWith<SerializationException> {
                Json.decodeFromString(serializer<Note>(), "{\"id\":\"$id\"}")
            }.message,
        )
        assertEquals(
            "Field 'createdAt' is required for type app.domain.note.Note, but it was missing",
            assertFailsWith<SerializationException> {
                Json.decodeFromString(serializer<Note>(), "{\"id\":\"$id\",\"text\":\"A note.\"}")
            }.message,
        )
    }

    @Test
    fun theDescriptorIsTheContractTheEmitterReads() {
        val descriptor = NoteSerializer.descriptor

        assertEquals("app.domain.note.Note", descriptor.serialName)
        assertEquals(listOf("id", "text", "createdAt"), (0 until descriptor.elementsCount).map(descriptor::getElementName))
        assertEquals("java.util.UUID", descriptor.getElementDescriptor(0).serialName)
        assertEquals("java.time.Instant", descriptor.getElementDescriptor(2).serialName)
    }

    @Test
    fun theScalarSerialisersDeclareTheirContractFormatsAndRoundTrip() {
        // The two scalars are public wire types: the emitter reads their serialName
        // for the OpenAPI `format`, and a generated client uses them in both
        // directions - so both directions are proven here.
        assertEquals("java.util.UUID", UuidSerializer.descriptor.serialName)
        assertEquals("java.time.Instant", InstantSerializer.descriptor.serialName)
        assertEquals("\"$id\"", Json.encodeToString(UuidSerializer, id))
        assertEquals(id, Json.decodeFromString(UuidSerializer, "\"$id\""))
        assertEquals("\"2025-01-01T12:00:00Z\"", Json.encodeToString(InstantSerializer, at))
        assertEquals(at, Json.decodeFromString(InstantSerializer, "\"2025-01-01T12:00:00Z\""))
    }

    @Test
    fun fixturesAreDeterministicAndValidated() {
        val first = NoteFixtures.NOTES()
        val second = NoteFixtures.NOTES()

        assertEquals(NoteFixtures.fixtureUuid(1), first.id)
        assertEquals(NoteFixtures.fixtureUuid(2), second.id)
        assertTrue(first.createdAt < second.createdAt)
    }
}
