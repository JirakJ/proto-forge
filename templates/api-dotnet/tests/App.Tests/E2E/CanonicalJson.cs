using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace App.Tests.E2E;

/// <summary>
/// Canonical JSON with recursively sorted keys and two-space indentation - the
/// same bytes JSON.stringify(sortKeysDeep(x), null, 2) yields in the node gate
/// corpus, so captured examples stay diffable across stacks (BR-26).
/// </summary>
public static class CanonicalJson
{
    private static readonly JsonSerializerOptions Scalar = new()
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public static string Write(JsonNode? node)
    {
        var output = new StringBuilder();
        Render(node, 0, output);
        output.Append('\n');
        return output.ToString();
    }

    private static void Render(JsonNode? node, int depth, StringBuilder output)
    {
        switch (node)
        {
            case JsonObject obj:
                {
                    var names = obj.Select(pair => pair.Key).OrderBy(name => name, StringComparer.Ordinal).ToList();
                    if (names.Count == 0)
                    {
                        output.Append("{}");
                        return;
                    }
                    output.Append("{\n");
                    for (var i = 0; i < names.Count; i++)
                    {
                        Indent(depth + 1, output);
                        output.Append('"').Append(names[i]).Append("\": ");
                        Render(obj[names[i]], depth + 1, output);
                        output.Append(i < names.Count - 1 ? ",\n" : "\n");
                    }
                    Indent(depth, output);
                    output.Append('}');
                    return;
                }
            case JsonArray array:
                {
                    if (array.Count == 0)
                    {
                        output.Append("[]");
                        return;
                    }
                    output.Append("[\n");
                    for (var i = 0; i < array.Count; i++)
                    {
                        Indent(depth + 1, output);
                        Render(array[i], depth + 1, output);
                        output.Append(i < array.Count - 1 ? ",\n" : "\n");
                    }
                    Indent(depth, output);
                    output.Append(']');
                    return;
                }
            case null:
                output.Append("null");
                return;
            default:
                // Scalars: ToJsonString is valid JSON for text, numbers, booleans.
                // Relaxed escaping so ' and + stay literal - the same bytes
                // JSON.stringify produces in the node gate corpus.
                output.Append(node.ToJsonString(Scalar));
                return;
        }
    }

    private static void Indent(int depth, StringBuilder output)
    {
        output.Append(string.Concat(Enumerable.Repeat("  ", depth)));
    }
}
