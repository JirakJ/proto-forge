package app.fixtures;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.IntFunction;
import java.util.function.Supplier;

// Fixture data is built from the constraints it must not drift from: every
// produced value is VALIDATED against the domain's jakarta-validation schema, so
// a drifted default fails loudly at the call site naming the field (BR-12).
// Deterministic by construction - values derive from a counter reset before each
// test (FactoryReset), never from Math.random or the clock, so two runs see
// byte-identical fixtures. stub:scan enforces the discipline: a fixture field
// that is not a defineFactory(...) is a hand-written literal waiting to drift.
public final class Factory {

  private static final AtomicInteger SEQUENCE = new AtomicInteger();
  private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

  /** The per-test counter. Reset by FactoryReset before each test. */
  public static int nextSequence() {
    return SEQUENCE.incrementAndGet();
  }

  public static void resetFactorySequence() {
    SEQUENCE.set(0);
  }

  /**
   * Build a factory: {@code defaults} receives the sequence number so ids can vary
   * per instance while staying deterministic. Every produced value is validated -
   * the factory cannot produce a value the domain would reject.
   */
  public static <T> Supplier<T> defineFactory(IntFunction<T> defaults) {
    return () -> {
      T value = defaults.apply(nextSequence());
      Set<ConstraintViolation<T>> violations = VALIDATOR.validate(value);
      if (!violations.isEmpty()) {
        throw new IllegalStateException("fixture violates its domain constraints: " + violations);
      }
      return value;
    };
  }

  private Factory() {}
}
