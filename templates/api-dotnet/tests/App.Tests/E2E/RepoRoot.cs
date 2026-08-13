namespace App.Tests.E2E;

/// <summary>
/// The capture and conformance runs write artefacts into the repository
/// (docs/api examples, the conformance summary); the test host's working
/// directory is the build output, so the root is found by walking up to the
/// directory that carries .proto-forge/.
/// </summary>
public static class RepoRoot
{
    public static string Find()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            if (Directory.Exists(Path.Combine(current.FullName, ".proto-forge")))
            {
                return current.FullName;
            }
            current = current.Parent!;
        }
        throw new InvalidOperationException("no .proto-forge directory above " + AppContext.BaseDirectory);
    }
}
