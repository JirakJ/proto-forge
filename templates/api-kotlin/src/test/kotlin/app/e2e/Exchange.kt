package app.e2e

/** One exchange: exactly what a consumer would have seen on the wire. */
data class Exchange(val status: Int, val contentType: String, val body: String)
