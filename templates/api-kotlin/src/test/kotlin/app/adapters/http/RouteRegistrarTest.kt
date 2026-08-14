package app.adapters.http

import app.adapters.`in`.http.OperationHandler
import app.adapters.`in`.http.OperationResult
import app.adapters.`in`.http.ResponseShape
import app.adapters.`in`.http.RouteDef
import app.adapters.`in`.http.RouteRegistry
import app.adapters.`in`.http.registerRoutes
import app.domain.note.Note
import io.ktor.client.request.get
import io.ktor.server.routing.routing
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.serialization.serializer

// The registrar's two loud failures. A registry row nothing implements, or a
// handler no row declares, is a wiring bug that a 404 would otherwise disguise
// as a missing feature - so both are refused at install time, with the name of
// the operation in the message.
class RouteRegistrarTest {

    private val row = RouteDef(
        operationId = "notes-list",
        method = "GET",
        path = "/notes",
        summary = "List every note, oldest first.",
    )

    @Test
    fun aRegistryRowWithNoHandlerRefusesToInstall() = testApplication {
        application {
            val failure = assertFailsWith<IllegalStateException> {
                routing { registerRoutes(listOf(row), emptyMap()) }
            }
            assertTrue(failure.message.orEmpty().contains("notes-list"), failure.message.orEmpty())
            assertTrue(failure.message.orEmpty().contains("no handler registered"), failure.message.orEmpty())
        }
        client.get("/healthz")
    }

    @Test
    fun aHandlerNoRowDeclaresRefusesToInstall() = testApplication {
        application {
            val failure = assertFailsWith<IllegalStateException> {
                routing {
                    registerRoutes(listOf(row), mapOf("notes-ghost" to OperationHandler { OperationResult(200, "{}") }))
                }
            }
            assertTrue(failure.message.orEmpty().contains("notes-ghost"), failure.message.orEmpty())
        }
        client.get("/healthz")
    }

    @Test
    fun aRowIsValueShapedSoTheRegistryCanBeComparedAndLogged() {
        val same = RouteDef(
            operationId = "notes-list",
            method = "GET",
            path = "/notes",
            summary = "List every note, oldest first.",
        )

        assertEquals(same, row)
        assertEquals(same.hashCode(), row.hashCode())
        assertTrue(row.toString().contains("notes-list"), row.toString())
        assertEquals(row, row.copy())
        assertEquals("notes-get", row.copy(operationId = "notes-get").operationId)
        assertEquals("notes-list", row.component1())
        assertNull(row.requestSchema)
        assertEquals(emptyMap(), row.responsesByStatus)
        assertEquals(emptyList(), row.problems)
    }

    @Test
    fun aResponseShapeIsValueShapedToo() {
        val shape = ResponseShape(serializer<Note>().descriptor, array = true)

        assertEquals(shape, ResponseShape(serializer<Note>().descriptor, array = true))
        assertEquals(shape.hashCode(), ResponseShape(serializer<Note>().descriptor, array = true).hashCode())
        assertTrue(shape.array)
        assertEquals(shape, shape.copy())
        assertTrue(shape.toString().contains("array"), shape.toString())
        assertNull(ResponseShape(null).schema)
        assertEquals(serializer<Note>().descriptor, shape.component1())
    }

    @Test
    fun anOperationResultIsValueShapedToo() {
        val result = OperationResult(204, null)

        assertEquals(result, OperationResult(204, null))
        assertEquals(result.hashCode(), OperationResult(204, null).hashCode())
        assertEquals(204, result.component1())
        assertNull(result.component2())
        assertEquals(OperationResult(200, "{}"), result.copy(status = 200, json = "{}"))
        assertTrue(result.toString().contains("204"), result.toString())
    }

    @Test
    fun theShippedRegistryDeclaresEveryDemoOperationOnce() {
        val ids = RouteRegistry.ROUTES.map { it.operationId }

        assertEquals(listOf("notes-list", "notes-get", "notes-create", "notes-delete"), ids)
        assertEquals(ids.size, ids.toSet().size, "operation ids are unique across the app (BR-25)")
    }
}
