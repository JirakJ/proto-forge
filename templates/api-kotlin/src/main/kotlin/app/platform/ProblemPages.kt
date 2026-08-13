package app.platform

import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.install
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respondText

// @adr 004 - the one place errors become responses (RFC 9457, BR-23)
//
// Every client-visible failure leaves this install as application/problem+json
// built from the registered catalogue. A registered AppProblem passes through;
// anything else is logged server-side and served as the generic "internal" - the
// response body never leaks a stack trace or an exception message (BRS §16).
// Ktor's own unmatched-path 404 never reaches a client either: the kernel's
// fallback route turns it into the registered "route-not-found" problem, so a
// consumer sees one error shape and only one.
public fun Application.installProblemPages() {
    install(StatusPages) {
        exception<AppProblem> { call, cause ->
            call.respondProblem(cause)
        }
        exception<Throwable> { call, cause ->
            LOG.error("unhandled error", cause, "err", cause::class.qualifiedName)
            call.respondProblem(AppProblem("internal"))
        }
    }
}

/** The single writer of a problem response: status, content type and body agree by construction. */
public suspend fun ApplicationCall.respondProblem(problem: AppProblem) {
    respondText(
        text = AppJson.encodeToString(problem.body(request.local.uri)),
        contentType = ContentType("application", "problem+json"),
        status = HttpStatusCode.fromValue(problem.def.status),
    )
}

private val LOG = AppLogger.get("app.platform.ProblemPages")
