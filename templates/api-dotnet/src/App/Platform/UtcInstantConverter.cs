using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace App.Platform;

/// <summary>
/// Serializes timestamps as UTC instants with a trailing Z and no trailing
/// fractional zeros - "2025-01-01T12:00:00Z" - so response bodies and the
/// captured docs examples derived from them are byte-stable across machines
/// and stacks (BR-26).
/// </summary>
public sealed class UtcInstantConverter : JsonConverter<DateTimeOffset>
{
    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        return DateTimeOffset.Parse(reader.GetString() ?? "", CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);
    }

    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(value.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.FFFFFFF", CultureInfo.InvariantCulture) + "Z");
    }
}
