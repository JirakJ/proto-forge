// The platform kernel's public surface: problem catalogue, structured logging,
// security headers and health routes. Part of the byte-pinned seed (§13).
export { AppProblem, problems, type ProblemCode, type ProblemDef } from "./problems.js";
export { createLogger, noopLogger, type Logger } from "./logger.js";
export { securityHeaders } from "./headers.js";
export { registerHealth, type ServiceInfo } from "./health.js";
