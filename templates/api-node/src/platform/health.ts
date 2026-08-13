import type { FastifyInstance } from "fastify";

export type ServiceInfo = {
  version: string;
  /** Git commit the running build was cut from; "dev" outside CI. */
  gitSha: string;
};

// PLATFORM routes, deliberately outside the route registry and the contract:
// /healthz and /version are infrastructure a load balancer or deploy probe talks
// to, not API surface a consumer programs against — so they carry no operationId,
// no docs examples and no contract entry.
export function registerHealth(app: FastifyInstance, info: ServiceInfo): void {
  app.get("/healthz", () => ({ status: "ok" }));
  app.get("/version", () => ({ version: info.version, gitSha: info.gitSha }));
}
