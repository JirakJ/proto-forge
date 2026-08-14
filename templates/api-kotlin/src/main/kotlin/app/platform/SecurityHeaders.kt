package app.platform

import io.ktor.server.application.ApplicationPlugin
import io.ktor.server.application.createApplicationPlugin
import io.ktor.server.response.header

// Security baseline headers (BRS §16) on every response - routes, problems, 404s.
// Installed as an application plugin so the headers are appended in the call phase,
// before any handler or parser can fail: an error response carries them too. An API
// serves no documents, hence the deny-everything CSP and the no-store cache policy.
public val SecurityHeaders: ApplicationPlugin<Unit> = createApplicationPlugin("SecurityHeaders") {
    onCall { call ->
        call.response.header("X-Content-Type-Options", "nosniff")
        call.response.header("X-Frame-Options", "DENY")
        call.response.header("Referrer-Policy", "strict-origin-when-cross-origin")
        call.response.header("Cache-Control", "no-store")
        call.response.header("Content-Security-Policy", "default-src 'none'")
    }
}
