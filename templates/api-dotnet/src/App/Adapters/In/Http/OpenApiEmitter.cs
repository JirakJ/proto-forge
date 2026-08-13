using System.ComponentModel.DataAnnotations;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using App.Platform;

namespace App.Adapters.In.Http;

// @adr 008 - the emitter derives, the registry decides (BR-22)
//
// The OpenAPI document is a pure derivation of RouteRegistry plus the domain
// records' own annotations - never of handler introspection, so it cannot drift
// from the single source. `dotnet run -- --emit-openapi` prints the raw document
// with NO socket, NO database and NO host; scripts/contract-verify.mjs pipes it
// through the shared normalizer (sorted keys, volatile members stripped) and
// byte-compares against the committed contract/openapi.json.
public static class OpenApiEmitter
{
    public static string Emit()
    {
        var document = new JsonObject
        {
            ["openapi"] = "3.1.0",
            ["info"] = new JsonObject { ["title"] = "proto-forge-service", ["version"] = "0.1.0" },
            ["paths"] = Paths(),
            ["components"] = new JsonObject { ["schemas"] = Schemas() },
        };
        return document.ToJsonString(new JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        });
    }

    private static JsonObject Paths()
    {
        var paths = new JsonObject();
        foreach (var def in RouteRegistry.ROUTES)
        {
            var item = paths[def.Path] as JsonObject;
            if (item is null)
            {
                item = new JsonObject();
                paths[def.Path] = item;
            }
            item[def.Method.ToLowerInvariant()] = Operation(def);
        }
        return paths;
    }

    private static JsonObject Operation(RouteDef def)
    {
        var operation = new JsonObject
        {
            ["operationId"] = def.OperationId,
            ["summary"] = def.Summary,
        };
        var parameters = PathParameters(def.Path);
        if (parameters.Count > 0)
        {
            operation["parameters"] = parameters;
        }
        if (def.RequestType is not null)
        {
            operation["requestBody"] = new JsonObject
            {
                ["content"] = new JsonObject
                {
                    ["application/json"] = new JsonObject { ["schema"] = Ref(def.RequestType.Name) },
                },
                ["required"] = true,
            };
        }
        operation["responses"] = Responses(def);
        return operation;
    }

    private static JsonArray PathParameters(string path)
    {
        var parameters = new JsonArray();
        foreach (var segment in path.Split('/'))
        {
            if (segment.StartsWith('{') && segment.EndsWith('}'))
            {
                parameters.Add(new JsonObject
                {
                    ["in"] = "path",
                    ["name"] = segment[1..^1],
                    ["required"] = true,
                    ["schema"] = new JsonObject { ["type"] = "string", ["format"] = "uuid" },
                });
            }
        }
        return parameters;
    }

    private static JsonObject Responses(RouteDef def)
    {
        var responses = new JsonObject();
        foreach (var (status, shape) in def.ResponsesByStatus.OrderBy(entry => entry.Key))
        {
            responses[status.ToString(System.Globalization.CultureInfo.InvariantCulture)] = SuccessResponse(shape);
        }
        // Every operation implicitly carries 500: the kernel middleware maps any
        // unregistered failure to the catalogue's "internal" problem.
        var byStatus = def.Problems
            .Append("internal")
            .Select(Problems.ByCode)
            .GroupBy(problem => problem.Status)
            .OrderBy(group => group.Key);
        foreach (var group in byStatus)
        {
            responses[group.Key.ToString(System.Globalization.CultureInfo.InvariantCulture)] = new JsonObject
            {
                ["description"] = string.Join("; ", group.Select(problem => problem.Title)),
                ["content"] = new JsonObject
                {
                    ["application/problem+json"] = new JsonObject { ["schema"] = Ref("Problem") },
                },
            };
        }
        return responses;
    }

    private static JsonObject SuccessResponse(ResponseShape shape)
    {
        if (shape.Type is null)
        {
            return new JsonObject { ["description"] = "No content." };
        }
        JsonNode schema = shape.Array
            ? new JsonObject { ["type"] = "array", ["items"] = Ref(shape.Type.Name) }
            : Ref(shape.Type.Name);
        return new JsonObject
        {
            ["description"] = "Success.",
            ["content"] = new JsonObject { ["application/json"] = new JsonObject { ["schema"] = schema } },
        };
    }

    private static JsonObject Schemas()
    {
        var types = RouteRegistry.ROUTES
            .SelectMany(def => def.ResponsesByStatus.Values
                .Select(shape => shape.Type)
                .Append(def.RequestType))
            .OfType<Type>()
            .DistinctBy(type => type.Name)
            .OrderBy(type => type.Name, StringComparer.Ordinal);
        var schemas = new JsonObject();
        foreach (var type in types)
        {
            schemas[type.Name] = RecordSchema(type);
        }
        schemas["Problem"] = ProblemSchema();
        return schemas;
    }

    /// <summary>The record's components ARE the schema (§12.2): properties, formats, constraints.</summary>
    private static JsonObject RecordSchema(Type type)
    {
        var properties = new JsonObject();
        var required = new JsonArray();
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                     .OrderBy(property => property.Name, StringComparer.Ordinal))
        {
            var name = JsonNamingPolicy.CamelCase.ConvertName(property.Name);
            var schema = PropertySchema(property);
            properties[name] = schema;
            required.Add(name);
        }
        return new JsonObject
        {
            ["type"] = "object",
            ["properties"] = properties,
            ["required"] = required,
        };
    }

    private static JsonObject PropertySchema(PropertyInfo property)
    {
        var schema = property.PropertyType switch
        {
            var t when t == typeof(Guid) => new JsonObject { ["type"] = "string", ["format"] = "uuid" },
            var t when t == typeof(DateTimeOffset) => new JsonObject { ["type"] = "string", ["format"] = "date-time" },
            var t when t == typeof(int) => new JsonObject { ["type"] = "integer", ["format"] = "int32" },
            _ => new JsonObject { ["type"] = "string" },
        };
        var length = property.GetCustomAttribute<StringLengthAttribute>();
        if (length is not null)
        {
            schema["maxLength"] = length.MaximumLength;
        }
        return schema;
    }

    private static JsonObject ProblemSchema()
    {
        return new JsonObject
        {
            ["type"] = "object",
            ["description"] = "RFC 9457 problem document; `code` is the stable key into the problem catalogue.",
            ["properties"] = new JsonObject
            {
                ["type"] = new JsonObject { ["type"] = "string" },
                ["title"] = new JsonObject { ["type"] = "string" },
                ["status"] = new JsonObject { ["type"] = "integer", ["format"] = "int32" },
                ["detail"] = new JsonObject { ["type"] = "string" },
                ["instance"] = new JsonObject { ["type"] = "string" },
                ["code"] = new JsonObject { ["type"] = "string" },
            },
            ["required"] = new JsonArray("code", "instance", "status", "title", "type"),
        };
    }

    private static JsonObject Ref(string name)
    {
        return new JsonObject { ["$ref"] = "#/components/schemas/" + name };
    }
}
