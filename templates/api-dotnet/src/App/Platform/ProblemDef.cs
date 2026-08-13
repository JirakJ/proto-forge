namespace App.Platform;

/// <summary>
/// One registered problem type (BR-23).
/// </summary>
/// <param name="Code">unique kebab-case code; doubles as the docs anchor and the <c>type</c> URI tail</param>
/// <param name="Status">the HTTP status this problem is served with</param>
/// <param name="Title">English, stable; consumers key on <c>code</c>, humans read <c>title</c></param>
public sealed record ProblemDef(string Code, int Status, string Title);
