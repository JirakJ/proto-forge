package app.adapters.`in`.http

import kotlinx.serialization.descriptors.SerialDescriptor

// @adr 008 - the route registry's row type
/**
 * One HTTP operation: its addressable id, wire shape and declared problems. The
 * rows are plain data with named arguments, so they stay declarative and
 * mechanically parseable - opid:scan, error:catalog and the docs gates all read
 * the `operationId = "…"` / `problems = listOf(…)` declarations off the registry
 * sources, and the contract emitter reads the descriptors.
 *
 * @property operationId kebab-case `<resource>-<verb>`, unique (BR-25)
 * @property method HTTP method name, e.g. `GET`
 * @property path Ktor-style path, e.g. `/notes/{id}`. Never inlined at a call site.
 * @property summary one sentence for the contract's `summary`
 * @property requestSchema kotlinx.serialization descriptor of the JSON request body; null = no body
 * @property responsesByStatus success shapes by status code; error shapes come from [problems]
 * @property problems problem codes (keys of the catalogue) this operation can emit (BR-23)
 */
public data class RouteDef(
    public val operationId: String,
    public val method: String,
    public val path: String,
    public val summary: String,
    public val requestSchema: SerialDescriptor? = null,
    public val responsesByStatus: Map<Int, ResponseShape> = emptyMap(),
    public val problems: List<String> = emptyList(),
)

/**
 * A success shape: the JSON body's element descriptor, and whether the body is an
 * array of it. A null [schema] means "no content".
 */
public data class ResponseShape(
    public val schema: SerialDescriptor?,
    public val array: Boolean = false,
)
