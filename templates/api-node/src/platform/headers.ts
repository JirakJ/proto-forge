import type { onRequestHookHandler } from "fastify";

// Security baseline headers (BRS §16) on every response — routes, problems, 404s.
// Registered as an onRequest hook: headers are set before any handler or parser can
// fail, so error responses carry them too. An API serves no documents, hence the
// deny-everything CSP and no-store cache policy.
export const securityHeaders: onRequestHookHandler = (_request, reply, done) => {
  void reply.header("x-content-type-options", "nosniff");
  void reply.header("referrer-policy", "strict-origin-when-cross-origin");
  void reply.header("x-frame-options", "DENY");
  void reply.header("cache-control", "no-store");
  void reply.header("content-security-policy", "default-src 'none'");
  done();
};
