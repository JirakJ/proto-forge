// The platform kernel's public surface: problem catalogue, structured logging,
// security headers, health routes and the served contract explorer (BR-47).
// Part of the byte-pinned seed (§13).
export { AppProblem, problems, type ProblemCode, type ProblemDef } from "./problems.js";
export { createLogger, noopLogger, type Logger } from "./logger.js";
export { securityHeaders } from "./headers.js";
export { registerHealth, type ServiceInfo } from "./health.js";
export { registerDocs, loadDocsFromDisk, type DocsDeps } from "./docs.js";
