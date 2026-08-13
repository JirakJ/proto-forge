import { z } from "zod";

// @adr 001 - one pinned stack, configured from one validated source
//
// The single source of runtime configuration (§12.3's rule applied to the service):
// nothing else reads process.env. DATABASE_URL is deliberately optional — absent
// means the in-process PGlite engine, which is the verify-time default (§15), so
// `pnpm verify` runs offline and Docker-free; deployments set a real URL.
export const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.url().optional(),
  GIT_SHA: z.string().min(1).default("dev"),
});

export type Env = z.infer<typeof EnvSchema>;

/** Parse lazily so tests inject their own record instead of mutating process.env. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return EnvSchema.parse(source);
}
