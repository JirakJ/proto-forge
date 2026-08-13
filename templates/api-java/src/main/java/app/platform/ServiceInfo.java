package app.platform;

/**
 * What /version reports.
 *
 * @param version the service's own version
 * @param gitSha git commit the running build was cut from; "dev" outside CI
 */
public record ServiceInfo(String version, String gitSha) {}
