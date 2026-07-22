// The single source of brief interpretation (BRS §7.1). Phase 0 normalizes any
// brief into exactly this typed structure; two briefs with equal facets are the
// same brief (BR-14). Mirrors the skill's references/facets.schema.ts.
import { z } from "zod";

export const FacetSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string().regex(/^[A-Z][A-Za-z0-9]+$/),
      fields: z.array(
        z.object({
          name: z.string(),
          type: z.enum(["string", "number", "boolean", "date", "enum", "ref"]),
          of: z.string().optional(),
          values: z.array(z.string()).optional(),
          required: z.boolean().default(true),
        }),
      ),
    }),
  ),
  flows: z.array(
    z.object({
      name: z.string(),
      actor: z.string(),
      steps: z.array(z.string()),
    }),
  ),
  roles: z.array(z.string()).default(["user"]),
  persistence: z.enum(["local", "api", "none"]),
  apiContract: z.string().optional(),
  locales: z.array(z.string()).default(["en"]),
  nonFunctional: z
    .object({
      offlineCapable: z.boolean().default(false),
      realtime: z.boolean().default(false),
    })
    .default({}),
});

export type Facets = z.infer<typeof FacetSchema>;
