import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import type { z } from "zod";
import type { NoteService } from "../../../application/note/noteService.js";
import { validationDetail } from "../../../application/validation.js";
import { registerDocs, type DocsDeps } from "../../../platform/docs.js";
import { registerHealth } from "../../../platform/health.js";
import { securityHeaders } from "../../../platform/headers.js";
import type { Logger } from "../../../platform/logger.js";
import { AppProblem } from "../../../platform/problems.js";
import { makeHandlers, type OperationHandler } from "./handlers.js";
import { routes, type RouteDef } from "./routes.js";

const SERVICE_VERSION = "0.1.0";

export type AppDeps = {
  service: NoteService;
  logger: Logger;
  /** The committed contract + captured examples the platform serves (BR-47). */
  docs: DocsDeps;
  gitSha?: string;
};

export function buildApp({ service, logger, docs, gitSha = "dev" }: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", securityHeaders);
  registerHealth(app, { version: SERVICE_VERSION, gitSha });
  registerDocs(app, docs);
  wireRoutes(app, routes, makeHandlers(service));
  app.setNotFoundHandler(notFound);
  app.setErrorHandler(makeErrorHandler(logger));
  return app;
}

/**
 * The registry IS the wiring: every RouteDef becomes one Fastify route with
 * boundary validation from its schemas and dispatch by operationId (BR-25).
 * A def without a handler is a wiring bug, failed loudly at build time.
 */
export function wireRoutes(
  app: FastifyInstance,
  defs: readonly RouteDef[],
  handlers: ReadonlyMap<string, OperationHandler>,
): void {
  for (const def of defs) {
    const operation = handlers.get(def.operationId);
    if (operation === undefined) {
      throw new Error(`no handler registered for operation "${def.operationId}"`);
    }
    app.route({
      method: def.method,
      url: def.path,
      handler: makeRouteHandler(def, operation),
    });
  }
}

function makeRouteHandler(def: RouteDef, operation: OperationHandler) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const result = await operation({
      params: parsePart("params", def.request?.params, request.params),
      query: parsePart("query", def.request?.query, request.query),
      body: parsePart("body", def.request?.body, request.body),
    });
    if (result.body === null) {
      reply.code(result.status).send();
    } else {
      reply.code(result.status).send(result.body);
    }
  };
}

function parsePart(part: string, schema: z.ZodType | undefined, value: unknown): unknown {
  if (schema === undefined) {
    return undefined;
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppProblem("validation-failed", `${part}: ${validationDetail(result.error)}`);
  }
  return result.data;
}

function makeErrorHandler(logger: Logger) {
  return (error: unknown, request: FastifyRequest, reply: FastifyReply): void => {
    const known = knownProblem(error);
    if (known === null) {
      logger.error({ err: String(error) }, "unhandled error");
    }
    sendProblem(reply, known ?? new AppProblem("internal"), request.url);
  };
}

function knownProblem(error: unknown): AppProblem | null {
  if (error instanceof AppProblem) {
    return error;
  }
  // Fastify tags client payload failures (malformed JSON, empty json body) with 400.
  if (error instanceof Error && "statusCode" in error && error.statusCode === 400) {
    return new AppProblem("validation-failed", "body: malformed or missing JSON payload");
  }
  return null;
}

function notFound(request: FastifyRequest, reply: FastifyReply): void {
  sendProblem(reply, new AppProblem("route-not-found"), request.url);
}

function sendProblem(reply: FastifyReply, problem: AppProblem, instance: string): void {
  reply
    .code(problem.def.status)
    .header("content-type", "application/problem+json; charset=utf-8")
    .send(JSON.stringify(problem.body(instance)));
}
