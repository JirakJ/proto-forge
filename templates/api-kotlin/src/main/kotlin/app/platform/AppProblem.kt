package app.platform

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

/**
 * The only throwable a handler may use for a client-visible failure (BR-23). Its
 * constructor accepts only registered codes - an unknown code fails at the throw
 * site, and the error:catalog gate fails the build before it gets that far.
 */
public class AppProblem(
    code: String,
    public val detail: String? = null,
) : RuntimeException(Problems.byCode(code).title) {

    public val def: ProblemDef = Problems.byCode(code)

    /**
     * The RFC 9457 body, member order fixed: `type` is a stable relative URI under
     * /problems/, `detail` appears only when the failure carries one, and `code` is
     * the stable key a consumer programs against.
     */
    public fun body(instance: String): JsonObject = buildJsonObject {
        put("type", JsonPrimitive("/problems/${def.code}"))
        put("title", JsonPrimitive(def.title))
        put("status", JsonPrimitive(def.status))
        if (detail != null) {
            put("detail", JsonPrimitive(detail))
        }
        put("instance", JsonPrimitive(instance))
        put("code", JsonPrimitive(def.code))
    }
}
