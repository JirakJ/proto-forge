namespace App.Platform;

/// <summary>
/// What /version reports.
/// </summary>
/// <param name="Version">the service's own version</param>
/// <param name="GitSha">git commit the running build was cut from; "dev" outside CI</param>
public sealed record ServiceInfo(string Version, string GitSha);
