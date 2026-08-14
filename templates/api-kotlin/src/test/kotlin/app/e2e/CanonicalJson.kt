package app.e2e

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * Canonical JSON with recursively sorted keys and two-space indentation - the
 * same bytes `JSON.stringify(sortKeysDeep(x), null, 2)` yields in the node gate
 * corpus, so captured examples and the emitted contract stay diffable across
 * stacks (BR-22 / BR-26).
 */
object CanonicalJson {

    fun write(element: JsonElement): String = buildString {
        render(element, 0, this)
        append('\n')
    }

    private fun render(element: JsonElement, depth: Int, out: StringBuilder) {
        when (element) {
            is JsonObject -> renderObject(element, depth, out)
            is JsonArray -> renderArray(element, depth, out)
            // Scalars: kotlinx's own toString is valid JSON for text, numbers,
            // booleans and null - the same guarantee the node side relies on.
            else -> out.append(element.toString())
        }
    }

    private fun renderObject(element: JsonObject, depth: Int, out: StringBuilder) {
        val names = element.keys.sorted()
        if (names.isEmpty()) {
            out.append("{}")
            return
        }
        out.append("{\n")
        names.forEachIndexed { index, name ->
            indent(depth + 1, out)
            out.append('"').append(name).append("\": ")
            render(requireNotNull(element[name]), depth + 1, out)
            out.append(if (index < names.size - 1) ",\n" else "\n")
        }
        indent(depth, out)
        out.append('}')
    }

    private fun renderArray(element: JsonArray, depth: Int, out: StringBuilder) {
        if (element.isEmpty()) {
            out.append("[]")
            return
        }
        out.append("[\n")
        element.forEachIndexed { index, item ->
            indent(depth + 1, out)
            render(item, depth + 1, out)
            out.append(if (index < element.size - 1) ",\n" else "\n")
        }
        indent(depth, out)
        out.append(']')
    }

    private fun indent(depth: Int, out: StringBuilder) {
        out.append("  ".repeat(depth))
    }
}
