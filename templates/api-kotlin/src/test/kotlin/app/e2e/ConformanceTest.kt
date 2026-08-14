package app.e2e

import app.harness.HarnessCases
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertTrue
import org.junit.jupiter.api.Tag
import slices.SliceFixture

// @adr 003 - the e2e conformance run (test:e2e is the last verify step)
//
// Replays every harness scenario against the Ktor test application and holds
// each response to the registry's own declarations - status, problem codes,
// shape. This is the pass/fail gate OUTSIDE the coverage percentage: the wiring,
// the registrar and the problem pages are proven by exercising them, not by
// counting their lines.
class ConformanceTest {

    @Test
    @Tag("conformance")
    fun everyHarnessScenarioConformsToTheRegistry() = testApplication {
        val fixture = SliceFixture()
        application { fixture.install(this) }
        fixture.rewind()

        val failures = HarnessCases.CASES.flatMap { harnessCase ->
            Conformance.check(harnessCase, replay(harnessCase))
        }

        assertTrue(failures.isEmpty(), "conformance failures:\n${failures.joinToString("\n")}")
        // The machine fact for quality:report (BR-36): scripts/e2e-conformance.mjs
        // captures this line (the conformance task shows test stdout) and records
        // .proto-forge/e2e-results.json from it - the documented status is a
        // derivation of THIS run, never a typed claim.
        @Suppress("ForbiddenMethodCall")
        println("conformance: ${HarnessCases.CASES.size} scenarios green")
    }
}
