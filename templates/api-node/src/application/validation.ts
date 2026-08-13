import type { z } from "zod";

/**
 * One deterministic line per zod issue, `path: message`, joined with "; ".
 * The problem `detail` a client sees for "validation-failed" — stable enough
 * to assert on and to capture into docs examples byte-for-byte.
 */
export function validationDetail(error: z.ZodError): string {
  return error.issues
    .map((issue) =>
      issue.path.length === 0 ? issue.message : `${issue.path.join(".")}: ${issue.message}`,
    )
    .join("; ");
}
