// The single source of brief interpretation (BRS §7.1).
// Phase 0 normalizes any brief into exactly this typed structure.
// Two briefs whose facets are equal are, by definition, "the same brief" (BR-14).
import { z } from "zod";

export const FacetSchema = z.object({
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
  persistence: z.enum(["local", "api", "none"]), // drives T5 vs T6
  apiContract: z.string().optional(), // path/URL to OpenAPI when persistence=api
  locales: z.array(z.string()).default(["en"]), // en always included
  nonFunctional: z
    .object({
      offlineCapable: z.boolean().default(false),
      realtime: z.boolean().default(false),
    })
    .default({}),
});
export type Facets = z.infer<typeof FacetSchema>;

// Normalization rules (fixed, so the mapping is reproducible):
// - Entity names PascalCase, field names camelCase; no synonym invention.
// - A flow verb the brief doesn't state is never added; missing detail => escalation.
// - persistence inferred: OpenAPI/endpoint ref => "api"; "save/store/persist" without a
//   service => "local"; neither => "none".
// - Facets written to .proto-forge/facets.json and hashed; the hash is the brief identity.
