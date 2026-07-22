import { z } from "zod";

// Single source of environment config (BRS §12.3), validated at the boundary
// with zod (BRS §4.1). Import `env` anywhere; never read import.meta.env directly.
export const EnvSchema = z
  .object({
    VITE_APP_BASE_URL: z.string().url().default("http://localhost:5173"),
    VITE_PERSISTENCE: z.enum(["local", "api"]).default("local"),
    VITE_API_BASE_URL: z.string().url().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.VITE_PERSISTENCE === "api" && !v.VITE_API_BASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["VITE_API_BASE_URL"],
        message: "VITE_API_BASE_URL is required when VITE_PERSISTENCE=api",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(import.meta.env);
