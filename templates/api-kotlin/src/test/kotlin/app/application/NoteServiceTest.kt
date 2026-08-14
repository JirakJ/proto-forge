package app.application

import app.domain.note.Note
import app.domain.note.NoteCreate
import app.fixtures.Factory
import app.fixtures.InMemoryNoteRepository
import app.fixtures.NoteFixtures
import app.fixtures.SequentialIdGenerator
import app.platform.AppProblem
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

class NoteServiceTest {

    private val now: Instant = Instant.parse("2025-01-01T12:00:00Z")

    private lateinit var repository: InMemoryNoteRepository
    private lateinit var ids: SequentialIdGenerator
    private lateinit var service: NoteService

    @BeforeTest
    fun freshService() {
        Factory.resetFactorySequence()
        repository = InMemoryNoteRepository()
        ids = SequentialIdGenerator()
        service = NoteService(repository, Clock.fixed(now, ZoneOffset.UTC), ids)
    }

    @Test
    fun listNotesReturnsOldestFirstWithIdTieBreak() {
        val older = NoteFixtures.NOTES()
        val newer = NoteFixtures.NOTES()
        val tied = Note(NoteFixtures.fixtureUuid(9), "Tied with the newer note.", newer.createdAt)
        repository.reset(listOf(tied, newer, older))

        assertEquals(listOf(older, newer, tied), service.listNotes())
    }

    @Test
    fun getNoteReturnsTheStoredNote() {
        val note = NoteFixtures.NOTES()
        repository.reset(listOf(note))

        assertEquals(note, service.getNote(note.id))
    }

    @Test
    fun getNoteThrowsTheRegisteredProblemWhenMissing() {
        val problem = assertFailsWith<AppProblem> { service.getNote(NoteFixtures.fixtureUuid(7)) }

        assertEquals("note-not-found", problem.def.code)
        assertEquals(404, problem.def.status)
    }

    @Test
    fun createNoteStampsInjectedIdAndClock() {
        val created = service.createNote(NoteFixtures.NOTE_CREATES())

        assertEquals(NoteFixtures.fixtureUuid(1), created.id)
        assertEquals("Fixture note 1", created.text)
        assertEquals(now, created.createdAt)
        assertEquals(listOf(created), repository.list())
    }

    @Test
    fun createNoteRejectsBlankTextAsTheRegisteredProblem() {
        val problem = assertFailsWith<AppProblem> { service.createNote(NoteCreate("")) }

        assertEquals("validation-failed", problem.def.code)
        assertEquals(400, problem.def.status)
        assertEquals("text: must not be blank", problem.detail)
        assertTrue(repository.list().isEmpty())
    }

    @Test
    fun createNoteJoinsMultipleViolationsSortedAndDeterministic() {
        val problem = assertFailsWith<AppProblem> {
            service.createNote(NoteCreate(" ".repeat(NoteCreate.MAX_TEXT + 1)))
        }

        assertEquals("text: must not be blank; text: size must be between 0 and 2000", problem.detail)
    }

    @Test
    fun deleteNoteRemovesTheRow() {
        val note = NoteFixtures.NOTES()
        repository.reset(listOf(note))

        service.deleteNote(note.id)

        assertTrue(repository.list().isEmpty())
        assertNull(repository.get(note.id))
    }

    @Test
    fun deleteNoteThrowsTheRegisteredProblemWhenMissing() {
        val problem = assertFailsWith<AppProblem> { service.deleteNote(UUID.randomUUID()) }

        assertEquals("note-not-found", problem.def.code)
    }

    @Test
    fun detailFormatsOneSortedLinePerViolation() {
        assertEquals(
            "text: must not be blank; text: size must be between 0 and 2000",
            NoteService.detail(listOf("text: size must be between 0 and 2000", "text: must not be blank")),
        )
    }

    @Test
    fun detailOfASingleViolationCarriesNoSeparator() {
        assertEquals("text: must not be blank", NoteService.detail(listOf("text: must not be blank")))
    }

    @Test
    fun theInjectedIdSourceIsTheOnlyOne() {
        assertEquals(NoteFixtures.fixtureUuid(1), ids.next())
        ids.reset()
        assertEquals(NoteFixtures.fixtureUuid(1), ids.next())
    }
}
