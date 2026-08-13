package app.application;

import java.util.UUID;

/** Injected id source: production wires UUID.randomUUID, tests a counter. */
@FunctionalInterface
public interface IdGenerator {
  UUID next();
}
