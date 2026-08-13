import { z } from "zod";
import { defineFactory } from "../../../../src/test/factory";

// The library has no domain of its own — Table renders whatever row shape a feature
// hands it. The point of a schema here is not to protect a domain, it is that the
// fixture rows are DECLARED and parsed rather than typed out per test: a change to the
// shape fails in one place, and every instance is deterministic (BR-12).

export const RowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  note: z.string().nullable(),
});

export type Row = z.output<typeof RowSchema>;

export const makeRow = defineFactory(RowSchema, (seq) => ({
  id: String(seq),
  name: `Person ${seq}`,
  note: `Note ${seq}`,
}));
