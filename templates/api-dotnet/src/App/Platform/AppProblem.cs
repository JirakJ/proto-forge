namespace App.Platform;

/// <summary>
/// The only exception a handler may use for a client-visible failure (BR-23). Its
/// constructor accepts only registered codes — an unknown code fails at the throw
/// site, and the error:catalog gate fails the build before it gets that far.
/// </summary>
public sealed class AppProblem : Exception
{
    public AppProblem(string code)
        : this(code, null)
    {
    }

    public AppProblem(string code, string? detail)
        : base(Platform.Problems.ByCode(code).Title)
    {
        Def = Platform.Problems.ByCode(code);
        Detail = detail;
    }

    public ProblemDef Def { get; }

    public string? Detail { get; }

    /// <summary>The RFC 9457 body, in field order. <c>type</c> is a stable relative URI under /problems/.</summary>
    public IReadOnlyList<KeyValuePair<string, object>> Body(string instance)
    {
        var body = new List<KeyValuePair<string, object>>
        {
            new("type", "/problems/" + Def.Code),
            new("title", Def.Title),
            new("status", Def.Status),
        };
        if (Detail is not null)
        {
            body.Add(new("detail", Detail));
        }
        body.Add(new("instance", instance));
        body.Add(new("code", Def.Code));
        return body;
    }
}
