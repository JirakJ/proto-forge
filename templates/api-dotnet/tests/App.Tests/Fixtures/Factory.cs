using System.ComponentModel.DataAnnotations;

namespace App.Tests.Fixtures;

// Fixture data is built from the constraints it must not drift from: every
// produced value is VALIDATED against the domain's DataAnnotations schema, so
// a drifted default fails loudly at the call site naming the field (BR-12).
// Deterministic by construction - values derive from a counter reset by the
// caller, never from Random or the clock, so two runs see byte-identical
// fixtures. stub:scan enforces the discipline: a fixture field that is not a
// DefineFactory(...) is a hand-written literal waiting to drift.
public static class Factory
{
    private static int sequence;

    /// <summary>The per-test counter; reset it before each test.</summary>
    public static int NextSequence()
    {
        return Interlocked.Increment(ref sequence);
    }

    public static void ResetFactorySequence()
    {
        Interlocked.Exchange(ref sequence, 0);
    }

    /// <summary>
    /// Build a factory: <paramref name="defaults"/> receives the sequence number
    /// so ids can vary per instance while staying deterministic. Every produced
    /// value is validated - the factory cannot produce a value the domain would
    /// reject.
    /// </summary>
    public static Func<T> DefineFactory<T>(Func<int, T> defaults)
        where T : notnull
    {
        return () =>
        {
            var value = defaults(NextSequence());
            var violations = new List<ValidationResult>();
            if (!Validator.TryValidateObject(value, new ValidationContext(value), violations, validateAllProperties: true))
            {
                throw new InvalidOperationException(
                    "fixture violates its domain constraints: " + string.Join("; ", violations.Select(v => v.ErrorMessage)));
            }
            return value;
        };
    }
}
