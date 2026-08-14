package app.application

import java.util.UUID

/** Injected id source: production wires UUID.randomUUID, tests a counter. */
public fun interface IdGenerator {
    public fun next(): UUID
}
