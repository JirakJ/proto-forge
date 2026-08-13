using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace App.Platform;

// Structured, redacting logging only (NFR-12): production code logs through this
// kernel wrapper, never Console.* and never a bare ILogger. The redaction list is
// the PII denylist - a value keyed by one of these names never leaves the process
// in clear text, even when a caller slips.
public sealed partial class AppLogger
{
    [GeneratedRegex("password|passwd|secret|token|authorization|ssn|creditcard|email", RegexOptions.IgnoreCase)]
    private static partial Regex Pii();

    private static ILoggerFactory factory = LoggerFactory.Create(logging => logging.AddConsole());

    private readonly ILogger delegateLogger;

    private AppLogger(ILogger delegateLogger)
    {
        this.delegateLogger = delegateLogger;
    }

    /// <summary>The composition root hands the host's factory in; everything else just calls Get.</summary>
    public static void Configure(ILoggerFactory hostFactory)
    {
        factory = hostFactory;
    }

    /// <summary>The one way production code obtains a logger.</summary>
    public static AppLogger Get(Type owner)
    {
        return new AppLogger(factory.CreateLogger(owner.FullName ?? owner.Name));
    }

    /// <summary>Structured call: a message plus alternating key/value pairs.</summary>
    public void Info(string message, params object?[] keyValues)
    {
        delegateLogger.LogInformation("{Line}", Render(message, keyValues));
    }

    public void Warn(string message, params object?[] keyValues)
    {
        delegateLogger.LogWarning("{Line}", Render(message, keyValues));
    }

    public void Error(string message, params object?[] keyValues)
    {
        delegateLogger.LogError("{Line}", Render(message, keyValues));
    }

    public void Error(string message, Exception cause, params object?[] keyValues)
    {
        delegateLogger.LogError(cause, "{Line}", Render(message, keyValues));
    }

    /// <summary>message key=value ..., with PII-named values replaced by [redacted].</summary>
    internal static string Render(string message, params object?[] keyValues)
    {
        var output = new StringBuilder(message);
        for (var i = 0; i + 1 < keyValues.Length; i += 2)
        {
            var key = Convert.ToString(keyValues[i], System.Globalization.CultureInfo.InvariantCulture) ?? "null";
            var value = Pii().IsMatch(key) ? "[redacted]" : keyValues[i + 1];
            output.Append(' ').Append(key).Append('=').Append(value);
        }
        return output.ToString();
    }
}
