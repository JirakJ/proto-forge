package app.adapters.`in`.http

import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.Routing
import io.ktor.server.routing.route

// @adr 008 - the registry IS the wiring
/**
 * Installs every [RouteDef] into Ktor's routing generically: one `route(path,
 * method)` per row, dispatching to the handler registered under the same
 * operationId (BR-25). A row without a handler - or a handler no row declares -
 * is a wiring bug, failed loudly at startup rather than discovered by a 404.
 *
 * The registrar is the only place a [RouteDef] becomes a route, which is what
 * keeps the registry the single place a path exists.
 */
public fun Routing.registerRoutes(routes: List<RouteDef>, handlers: Map<String, OperationHandler>) {
    val declared = routes.map { it.operationId }.toSet()
    val orphans = handlers.keys - declared
    check(orphans.isEmpty()) { "handler(s) without a registry entry: ${orphans.sorted().joinToString(", ")}" }
    for (def in routes) {
        val handler = handlers[def.operationId]
            ?: error("no handler registered for operation \"${def.operationId}\"")
        route(def.path, HttpMethod.parse(def.method)) {
            handle {
                call.write(handler.handle(call))
            }
        }
    }
}

/**
 * A handler keyed by the registry's operationId. It reads what it needs off the
 * call and returns the outcome; the registrar owns status, content type and the
 * write, so no handler can invent a response shape of its own.
 */
public fun interface OperationHandler {
    public suspend fun handle(call: ApplicationCall): OperationResult
}

/** A handler's outcome: an HTTP status and an already-encoded JSON body (null = no content). */
public data class OperationResult(public val status: Int, public val json: String?)

private suspend fun ApplicationCall.write(result: OperationResult) {
    val status = HttpStatusCode.fromValue(result.status)
    if (result.json == null) {
        respond(status)
    } else {
        respondText(result.json, ContentType.Application.Json, status)
    }
}
