package app.platform

import kotlinx.serialization.json.Json

// The one JSON codec the service uses, configured once in the kernel: no pretty
// printing on the wire, no unknown keys accepted (an unexpected member is a
// contract violation the boundary must reject, not silently drop), and absent
// optionals omitted rather than serialised as null - the shape the contract
// describes is the shape that leaves the process.
public val AppJson: Json = Json {
    prettyPrint = false
    ignoreUnknownKeys = false
    explicitNulls = false
    encodeDefaults = true
}
