package app.e2e

import app.adapters.`in`.http.ResponseShape
import app.adapters.`in`.http.RouteRegistry
import app.harness.HarnessCase
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.elementNames
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

// The assertion half of the conformance run: status, problem codes and response
// shapes are held to the registry's own declarations (BR-25/BR-26) - a scenario
// expecting a status its operation does not declare is a harness bug, failed
// loudly. The shape oracle is the serialization descriptor the registry carries,
// which is the SAME descriptor the contract is emitted from: the response, the
// spec and the docs example cannot disagree without something here going red.
object Conformance {

    private val PARSER = Json { ignoreUnknownKeys = true }

    fun check(harnessCase: HarnessCase, exchange: Exchange): List<String> {
        if (exchange.status != harnessCase.expectStatus) {
            return listOf(
                "${harnessCase.id}: expected status ${harnessCase.expectStatus}, " +
                    "got ${exchange.status} (body: ${exchange.body})",
            )
        }
        return if (harnessCase.expectProblem != null) {
            checkProblemBody(harnessCase, exchange.body)
        } else {
            checkSuccessBody(harnessCase, exchange.body)
        }
    }

    private fun checkProblemBody(harnessCase: HarnessCase, body: String): List<String> {
        val parsed = PARSER.parseToJsonElement(body) as? JsonObject
            ?: return listOf("${harnessCase.id}: expected a problem document, got $body")
        val code = parsed["code"]?.jsonPrimitive?.content
        return if (code == harnessCase.expectProblem) {
            emptyList()
        } else {
            listOf("${harnessCase.id}: expected problem code \"${harnessCase.expectProblem}\", got $code")
        }
    }

    private fun checkSuccessBody(harnessCase: HarnessCase, body: String): List<String> {
        val schema = successShape(harnessCase).schema
        if (schema == null) {
            return if (body.isEmpty()) {
                emptyList()
            } else {
                listOf("${harnessCase.id}: expected an empty body, got $body")
            }
        }
        val parsed = PARSER.parseToJsonElement(body)
        return when {
            !successShape(harnessCase).array -> checkShape(harnessCase.id, parsed, schema)
            parsed !is JsonArray -> listOf("${harnessCase.id}: expected a JSON array, got $body")
            else -> parsed.flatMap { checkShape(harnessCase.id, it, schema) }
        }
    }

    /** The descriptor's elements ARE the response schema (§12.2): exact field set, no extras. */
    private fun checkShape(caseId: String, element: JsonElement, schema: SerialDescriptor): List<String> {
        if (element !is JsonObject) {
            return listOf("$caseId: expected a JSON object, got $element")
        }
        val expected = schema.elementNames.toList()
        val missing = expected
            .filterNot { element.containsKey(it) }
            .map { "$caseId: response body misses the ${schema.simpleName()} field \"$it\"" }
        val extras = if (element.size == expected.size) {
            emptyList()
        } else {
            listOf(
                "$caseId: response body carries ${element.size} fields, the " +
                    "${schema.simpleName()} schema declares ${expected.size}",
            )
        }
        return missing + extras
    }

    private fun successShape(harnessCase: HarnessCase): ResponseShape {
        val route = RouteRegistry.ROUTES.firstOrNull { it.operationId == harnessCase.operationId }
            ?: error("case \"${harnessCase.id}\" names unknown operation \"${harnessCase.operationId}\"")
        return route.responsesByStatus[harnessCase.expectStatus]
            ?: error(
                "case \"${harnessCase.id}\" expects status ${harnessCase.expectStatus}, " +
                    "which \"${harnessCase.operationId}\" does not declare",
            )
    }

    private fun SerialDescriptor.simpleName(): String = serialName.substringAfterLast('.')
}
