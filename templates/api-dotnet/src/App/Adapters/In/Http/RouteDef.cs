namespace App.Adapters.In.Http;

// @adr 008 - the route registry's row type
/// <summary>
/// One HTTP operation: its addressable id, wire shape and declared problems. The
/// init-only record keeps definitions declarative and mechanically parseable -
/// opid:scan, error:catalog and the docs gates all read the object-initializer
/// assignments to <see cref="OperationId"/> and <see cref="Problems"/> off the
/// registry sources.
/// </summary>
public sealed record RouteDef
{
    /// <summary>kebab-case <c>&lt;resource&gt;-&lt;verb&gt;</c>, unique (BR-25).</summary>
    public required string OperationId { get; init; }

    /// <summary>HTTP method name, e.g. <c>GET</c>.</summary>
    public required string Method { get; init; }

    /// <summary>Route template, e.g. <c>/notes/{id}</c>. Never inlined at a call site.</summary>
    public required string Path { get; init; }

    /// <summary>One sentence for the contract's <c>summary</c>.</summary>
    public required string Summary { get; init; }

    /// <summary>JSON request-body type; null = no body.</summary>
    public Type? RequestType { get; init; }

    /// <summary>Success shapes by status code; error shapes come from <see cref="Problems"/>.</summary>
    public required IReadOnlyDictionary<int, ResponseShape> ResponsesByStatus { get; init; }

    /// <summary>Problem codes (keys of the catalogue) this operation can emit (BR-23).</summary>
    public required IReadOnlyList<string> Problems { get; init; }
}

/// <summary>A success shape: the JSON body's element type; null type means "no content".</summary>
public sealed record ResponseShape(Type? Type, bool Array);
