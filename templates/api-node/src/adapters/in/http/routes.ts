import type { z } from "zod";

// @adr 008 - the route registry is the contract's single source
//
// Every HTTP operation is one entry HERE, and nowhere else: the Fastify wiring,
// the OpenAPI contract, the docs examples and the e2e conformance suite are all
// DERIVED from this table. A route registered ad hoc on the server instance would
// be an operation the contract cannot see — opid:scan fails the literal, and the
// registry type makes the schema and problem list required rather than polite.
//
// operationId is the backend's addressability surface (BR-25): kebab-case
// `<resource>-<verb>`, unique across the app, the same grammar as the frontend's
// testids — contract clients, docs examples and e2e scenarios all key on it.

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RouteDef = {
  /** kebab-case `<resource>-<verb>`, unique (BR-25). */
  operationId: string;
  method: HttpMethod;
  /** Fastify-style path, e.g. `/notes/:id`. Never inlined at a call site. */
  path: string;
  /** One sentence for the contract's `summary`. */
  summary: string;
  /** zod schemas validated at the boundary (BRS §16). Absent = no input of that kind. */
  request?: {
    params?: z.ZodType;
    query?: z.ZodType;
    body?: z.ZodType;
  };
  /** Success shapes by status code. Error shapes come from `problems` (BR-23). */
  responses: Record<number, z.ZodType | null>;
  /** Problem codes (keys of the problem catalogue) this operation can emit. */
  problems: string[];
};

// The demo `Note` slice registers its routes here; a generated service replaces
// them with the brief's operations (facet order). The array is the iteration
// order of the contract and the docs.
import { noteRoutes } from "./noteRoutes.js";

export const routes: RouteDef[] = [...noteRoutes];
