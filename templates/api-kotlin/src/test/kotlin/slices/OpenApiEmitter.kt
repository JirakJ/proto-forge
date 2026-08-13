package slices

import app.adapters.`in`.http.ResponseShape
import app.adapters.`in`.http.RouteDef
import app.platform.ProblemDef
import app.platform.Problems
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.SerialKind
import kotlinx.serialization.descriptors.StructureKind
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// @adr 008 - the registry emits, nothing introspects a running server (BR-22)
//
// Ktor has no springdoc, and that turns out to be the better position: the
// contract is DERIVED from the two declarations that already exist - the route
// registry (ids, methods, paths, summaries, declared problems) and the
// kotlinx.serialization descriptors the domain types carry - rather than
// scraped off a booted application. No socket, no reflection over annotations,
// no second source of truth. The raw document goes through the SHARED
// normalizer (scripts/contract-normalize.mjs: sorted keys, volatile members
// stripped) before it is byte-compared against the committed spec, so the same
// registry always yields the same bytes.
object OpenApiEmitter {

    private const val OPENAPI_VERSION = "3.1.0"
    private const val PROBLEM_SCHEMA = "Problem"
    private const val PROBLEM_MEDIA_TYPE = "application/problem+json"
    private const val JSON_MEDIA_TYPE = "application/json"

    /** descriptor serialName -> OpenAPI `format`. The scalars declare their own names (NoteWire.kt). */
    private val FORMATS = mapOf(
        "java.util.UUID" to "uuid",
        "java.time.Instant" to "date-time",
    )

    private val PATH_PARAMETER = Regex("\\{([^}]+)}")

    fun emit(routes: List<RouteDef>, title: String, version: String): JsonObject {
        val components = sortedMapOf<String, JsonObject>()
        components[PROBLEM_SCHEMA] = problemSchema()
        val paths = linkedMapOf<String, MutableMap<String, JsonObject>>()
        for (route in routes) {
            paths.getOrPut(route.path) { linkedMapOf() }[route.method.lowercase()] = operation(route, components)
        }
        return buildJsonObject {
            put("openapi", OPENAPI_VERSION)
            put("info", buildJsonObject { put("title", title); put("version", version) })
            put(
                "paths",
                buildJsonObject {
                    for ((path, byMethod) in paths) {
                        put(path, buildJsonObject { for ((method, op) in byMethod) put(method, op) })
                    }
                },
            )
            put("components", buildJsonObject { put("schemas", buildJsonObject { for ((n, s) in components) put(n, s) }) })
        }
    }

    private fun operation(route: RouteDef, components: MutableMap<String, JsonObject>): JsonObject = buildJsonObject {
        put("operationId", route.operationId)
        put("summary", route.summary)
        val parameters = pathParameters(route.path)
        if (parameters.isNotEmpty()) {
            put("parameters", JsonArray(parameters))
        }
        route.requestSchema?.let { schema ->
            put(
                "requestBody",
                buildJsonObject {
                    put("required", true)
                    put("content", buildJsonObject { put(JSON_MEDIA_TYPE, mediaType(reference(schema, components))) })
                },
            )
        }
        put("responses", responses(route, components))
    }

    /**
     * A path parameter is declared by the path itself. The registry states no
     * narrower type than "a string in the path", and the emitter refuses to invent
     * one: the uuid rule lives in the handler and shows up as the registered
     * `validation-failed` problem, which the responses below already describe.
     */
    private fun pathParameters(path: String): List<JsonObject> =
        PATH_PARAMETER.findAll(path).map { match ->
            buildJsonObject {
                put("name", match.groupValues[1])
                put("in", "path")
                put("required", true)
                put("schema", buildJsonObject { put("type", "string") })
            }
        }.toList()

    private fun responses(route: RouteDef, components: MutableMap<String, JsonObject>): JsonObject {
        val byStatus = sortedMapOf<Int, JsonObject>()
        for ((status, shape) in route.responsesByStatus.toSortedMap()) {
            byStatus[status] = successResponse(shape, components)
        }
        // Every operation implicitly carries 500: the problem pages map any
        // unregistered failure to the catalogue's "internal" problem.
        val codes = route.problems + "internal"
        for ((status, defs) in problemsByStatus(codes)) {
            byStatus[status] = buildJsonObject {
                put("description", defs.joinToString("; ") { it.title })
                put("content", buildJsonObject { put(PROBLEM_MEDIA_TYPE, mediaType(problemReference())) })
            }
        }
        return buildJsonObject { for ((status, response) in byStatus) put(status.toString(), response) }
    }

    private fun successResponse(shape: ResponseShape, components: MutableMap<String, JsonObject>): JsonObject {
        val schema = shape.schema ?: return buildJsonObject { put("description", "No content.") }
        val item = reference(schema, components)
        val body = if (shape.array) {
            buildJsonObject { put("type", "array"); put("items", item) }
        } else {
            item
        }
        return buildJsonObject {
            put("description", "Success.")
            put("content", buildJsonObject { put(JSON_MEDIA_TYPE, mediaType(body)) })
        }
    }

    private fun problemsByStatus(codes: List<String>): Map<Int, List<ProblemDef>> {
        val byStatus = sortedMapOf<Int, MutableList<ProblemDef>>()
        for (code in codes) {
            val problem = Problems.byCode(code)
            byStatus.getOrPut(problem.status) { mutableListOf() }.add(problem)
        }
        return byStatus
    }

    private fun mediaType(schema: JsonObject): JsonObject = buildJsonObject { put("schema", schema) }

    private fun problemReference(): JsonObject = buildJsonObject {
        put("\$ref", "#/components/schemas/$PROBLEM_SCHEMA")
    }

    /**
     * A named structure becomes a component and a `$ref`; anything else is
     * inlined. Registering before recursing keeps a self-referential type from
     * looping forever.
     */
    private fun reference(descriptor: SerialDescriptor, components: MutableMap<String, JsonObject>): JsonObject {
        if (descriptor.kind != StructureKind.CLASS) {
            return schema(descriptor, components)
        }
        val name = descriptor.serialName.substringAfterLast('.').removeSuffix("?")
        if (!components.containsKey(name)) {
            components[name] = JsonObject(emptyMap())
            components[name] = objectSchema(descriptor, components)
        }
        return buildJsonObject { put("\$ref", "#/components/schemas/$name") }
    }

    private fun schema(descriptor: SerialDescriptor, components: MutableMap<String, JsonObject>): JsonObject =
        when (descriptor.kind) {
            StructureKind.CLASS -> reference(descriptor, components)
            StructureKind.LIST -> buildJsonObject {
                put("type", "array")
                put("items", reference(descriptor.getElementDescriptor(0), components))
            }
            StructureKind.MAP -> buildJsonObject {
                put("type", "object")
                put("additionalProperties", reference(descriptor.getElementDescriptor(1), components))
            }
            SerialKind.ENUM -> buildJsonObject {
                put("type", "string")
                put("enum", buildJsonArray { descriptor.elementNames().forEach { add(JsonPrimitive(it)) } })
            }
            else -> primitiveSchema(descriptor)
        }

    private fun primitiveSchema(descriptor: SerialDescriptor): JsonObject = buildJsonObject {
        when (descriptor.kind) {
            PrimitiveKind.BOOLEAN -> put("type", "boolean")
            PrimitiveKind.BYTE, PrimitiveKind.SHORT, PrimitiveKind.INT -> {
                put("type", "integer")
                put("format", "int32")
            }
            PrimitiveKind.LONG -> {
                put("type", "integer")
                put("format", "int64")
            }
            PrimitiveKind.FLOAT, PrimitiveKind.DOUBLE -> put("type", "number")
            else -> put("type", "string")
        }
        FORMATS[descriptor.serialName]?.let { put("format", it) }
    }

    private fun objectSchema(descriptor: SerialDescriptor, components: MutableMap<String, JsonObject>): JsonObject =
        buildJsonObject {
            put("type", "object")
            put(
                "properties",
                buildJsonObject {
                    for (index in 0 until descriptor.elementsCount) {
                        put(descriptor.getElementName(index), schema(descriptor.getElementDescriptor(index), components))
                    }
                },
            )
            val required = (0 until descriptor.elementsCount)
                .filterNot { descriptor.isElementOptional(it) }
                .map { descriptor.getElementName(it) }
            if (required.isNotEmpty()) {
                put("required", buildJsonArray { required.forEach { add(JsonPrimitive(it)) } })
            }
        }

    /** The kernel's RFC 9457 document, stated once here because the kernel builds it by hand. */
    private fun problemSchema(): JsonObject = buildJsonObject {
        put("type", "object")
        put("description", "RFC 9457 problem document; `code` is the stable key into the problem catalogue.")
        put(
            "properties",
            buildJsonObject {
                put("type", buildJsonObject { put("type", "string") })
                put("title", buildJsonObject { put("type", "string") })
                put("status", buildJsonObject { put("type", "integer"); put("format", "int32") })
                put("detail", buildJsonObject { put("type", "string") })
                put("instance", buildJsonObject { put("type", "string") })
                put("code", buildJsonObject { put("type", "string") })
            },
        )
        put(
            "required",
            buildJsonArray {
                listOf("type", "title", "status", "instance", "code").forEach { add(JsonPrimitive(it)) }
            },
        )
    }

    private fun SerialDescriptor.elementNames(): List<String> =
        (0 until elementsCount).map { getElementName(it) }
}
