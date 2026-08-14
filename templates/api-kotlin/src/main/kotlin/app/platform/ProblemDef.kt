package app.platform

/**
 * One registered problem type (BR-23).
 *
 * @property code unique kebab-case code; doubles as the docs anchor and the `type` URI tail
 * @property status the HTTP status this problem is served with
 * @property title English, stable; consumers key on [code], humans read [title]
 */
public data class ProblemDef(
    public val code: String,
    public val status: Int,
    public val title: String,
)
