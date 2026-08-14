package app.platform

/**
 * What /version reports.
 *
 * @property version the service's own version
 * @property gitSha git commit the running build was cut from; "dev" outside CI
 */
public data class ServiceInfo(
    public val version: String,
    public val gitSha: String,
)
