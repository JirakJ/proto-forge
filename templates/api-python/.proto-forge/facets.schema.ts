// The single source of brief interpretation (BRS §7.1).
// Phase 0 normalizes any brief into exactly this typed structure.
// Two briefs whose facets are equal are, by definition, "the same brief" (BR-14):
// identity is the PAIR (facetsVersion, sha256 of the normalized document), with
// absent optional subtrees omitted from the serialization, never written as null.
import { z } from "zod";

// Present iff the brief asks for a service/API to be BUILT. A brief that only
// CONSUMES an API keeps the v1 shape (persistence: "api") and no backend key.
export const BackendFacetSchema = z.object({
  // Named in the brief or escalated — never guessed. There is no default stack,
  // because a defaulted stack would make two different intents hash identical.
  stack: z.enum(["node", "java", "kotlin", "python", "dotnet"]),
  externalSystems: z
    .array(
      z.object({
        name: z.string().regex(/^[A-Z][A-Za-z0-9]+$/), // PascalCase, like entities
        kind: z.enum(["rest", "soap", "db", "queue", "email", "file", "payment", "identity", "other"]),
        direction: z.enum(["inbound", "outbound", "both"]),
        contract: z.string().optional(), // path/URL to the external spec, when the brief gives one
      }),
    )
    .default([]),
  // One engine. A second engine is off-table => escalation (T22).
  persistence: z.enum(["postgres", "none"]),
  messaging: z.enum(["none", "outbox", "broker"]).default("none"),
  authModel: z.enum(["none", "apiKey", "jwt", "oidc"]).default("none"),
});

export const FacetSchema = z.object({
  facetsVersion: z.literal(2).default(2),
  entities: z.array(
    z.object({
      name: z.string().regex(/^[A-Z][A-Za-z0-9]+$/), // PascalCase domain noun
      fields: z.array(
        z.object({
          name: z.string(),
          type: z.enum(["string", "number", "boolean", "date", "enum", "ref"]),
          of: z.string().optional(), // target entity when type=ref
          values: z.array(z.string()).optional(), // members when type=enum
          required: z.boolean().default(true),
        }),
      ),
    }),
  ),
  flows: z.array(
    z.object({
      name: z.string(), // e.g. "create-invoice"
      actor: z.string(), // role name or "anon"
      steps: z.array(z.string()), // ordered user-visible steps
    }),
  ),
  roles: z.array(z.string()).default(["user"]), // authz roles; drives T8
  persistence: z.enum(["local", "api", "none"]), // drives T5 vs T6 (frontend data story)
  apiContract: z.string().optional(), // path/URL to OpenAPI when persistence=api
  locales: z.array(z.string()).default(["en"]), // en always included
  nonFunctional: z
    .object({
      offlineCapable: z.boolean().default(false),
      realtime: z.boolean().default(false),
    })
    .default({}),
  backend: BackendFacetSchema.optional(), // absent => frontend-only brief (v1 behaviour)
});
export type Facets = z.infer<typeof FacetSchema>;

// Normalization rules (fixed, so the mapping is reproducible):
// - Entity names PascalCase, field names camelCase; no synonym invention.
// - A flow verb the brief doesn't state is never added; missing detail => escalation.
// - persistence inferred: OpenAPI/endpoint ref => "api"; "save/store/persist" without a
//   service => "local"; neither => "none".
// - backend exists iff the brief asks to BUILD a service; backend.stack is never
//   defaulted (T22 escalation when unnamed).
// - The architecture style is NOT a facet — it is a pure function of facets
//   (T15-T17), recorded at generation time in .proto-forge/architecture.json and
//   re-derived by arch:verify. A brief demanding a contradicting style escalates.
// - Facets written to .proto-forge/facets.json and hashed; (facetsVersion, hash) is
//   the brief identity.
