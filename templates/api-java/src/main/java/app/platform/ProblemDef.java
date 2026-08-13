package app.platform;

/**
 * One registered problem type (BR-23).
 *
 * @param code unique kebab-case code; doubles as the docs anchor and the {@code type} URI tail
 * @param status the HTTP status this problem is served with
 * @param title English, stable; consumers key on {@code code}, humans read {@code title}
 */
public record ProblemDef(String code, int status, String title) {}
