using System.Globalization;

namespace App.Adapters.Out.Persistence;

/// <summary>
/// DATABASE_URL arrives as a postgres:// url (the cross-stack convention every
/// proto-forge backend shares - one Secret shape per environment, BR-29); Npgsql
/// speaks key-value connection strings. This is the one translation point. A
/// value that already looks like a key-value string passes through untouched.
/// </summary>
public static class DatabaseUrl
{
    public static string ToConnectionString(string databaseUrl)
    {
        if (!databaseUrl.StartsWith("postgres://", StringComparison.Ordinal)
            && !databaseUrl.StartsWith("postgresql://", StringComparison.Ordinal))
        {
            return databaseUrl;
        }
        var uri = new Uri(databaseUrl);
        var parts = new List<string>
        {
            "Host=" + uri.Host,
            "Port=" + (uri.Port > 0 ? uri.Port : 5432).ToString(CultureInfo.InvariantCulture),
            "Database=" + uri.AbsolutePath.TrimStart('/'),
        };
        var userInfo = uri.UserInfo.Split(':', 2);
        if (userInfo[0] is not "")
        {
            parts.Add("Username=" + Uri.UnescapeDataString(userInfo[0]));
        }
        if (userInfo.Length == 2)
        {
            parts.Add("Password=" + Uri.UnescapeDataString(userInfo[1]));
        }
        return string.Join(";", parts);
    }
}
