package app.fixtures;

import app.application.IdGenerator;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

/** Deterministic id source for tests and captures: 00000000-0000-4000-8000-…N. */
public final class SequentialIdGenerator implements IdGenerator {

  private final AtomicInteger counter = new AtomicInteger();

  @Override
  public UUID next() {
    return NoteFixtures.fixtureUuid(counter.incrementAndGet());
  }

  public void reset() {
    counter.set(0);
  }
}
