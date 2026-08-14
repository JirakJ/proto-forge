package app.platform

// @adr 004 - every error is a registered problem type (BR-23)
//
// The problem catalogue is the backend's i18n-catalogue equivalent: the single
// source a consumer programs against and a frontend translates FROM. An error
// invented at a throw site is a contract change nobody reviewed - error:catalog
// fails an unregistered shape, a duplicate code, and an entry no code can emit.
//
// Responses are RFC 9457 problem+json, always English (the register's §13: the
// backend does not translate; it emits stable codes).
public object Problems {

    /** The catalogue. Keys equal each entry's `code` - consistency enforces it. */
    public val PROBLEMS: Map<String, ProblemDef> = mapOf(
        "validation-failed" to ProblemDef("validation-failed", 400, "The request does not match the operation's schema"),
        "note-not-found" to ProblemDef("note-not-found", 404, "No note exists under this id"),
        "route-not-found" to ProblemDef("route-not-found", 404, "No route matches this method and path"),
        "internal" to ProblemDef("internal", 500, "Unexpected server failure"),
    )

    /** Look a definition up by code; an unknown code is a programming error, failed loudly. */
    public fun byCode(code: String): ProblemDef = PROBLEMS[code]
        ?: throw IllegalArgumentException(
            "unregistered problem code \"$code\" - register it in Problems first (BR-23)",
        )
}
