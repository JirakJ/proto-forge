import { z } from "zod";
import { defineFactory, resetFactorySequence } from "./factory";

const PersonSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  age: z.number().int().nonnegative(),
});

const makePerson = defineFactory(PersonSchema, (seq) => ({
  id: `person-${seq}`,
  name: `Person ${seq}`,
  age: 30,
}));

describe("defineFactory", () => {
  it("returns a schema-parsed value built from the defaults", () => {
    const person = makePerson();
    expect(person).toEqual({ id: "person-1", name: "Person 1", age: 30 });
    expect(() => PersonSchema.parse(person)).not.toThrow();
  });

  it("lets overrides win per field", () => {
    const person = makePerson({ name: "Ada" });
    expect(person.name).toBe("Ada");
    expect(person.id).toBe("person-1");
  });

  it("is deterministic across calls, and the sequence resets between tests", () => {
    // setup.ts resets before each test, so this is instance 1 again — not 2 or 3.
    expect(makePerson().id).toBe("person-1");
    expect(makePerson().id).toBe("person-2");
  });

  it("fails loudly when an override violates the schema, naming the field", () => {
    expect(() => makePerson({ age: -1 })).toThrow(/age/);
  });

  it("fails loudly when the DEFAULTS have drifted from the schema", () => {
    // The scenario the factory exists for: the schema narrowed and the fixture did not.
    const makeDrifted = defineFactory(PersonSchema, (seq) => ({
      id: `person-${seq}`,
      name: "", // violates min(1)
      age: 30,
    }));
    expect(() => makeDrifted()).toThrow(/name/);
  });

  it("applies schema transforms, so output is z.output, not z.input", () => {
    const Trimmed = z.object({ text: z.string().transform((value) => value.trim()) });
    const make = defineFactory(Trimmed, () => ({ text: "  hi  " }));
    expect(make().text).toBe("hi");
  });

  it("exposes the reset for completeness, though setup.ts owns calling it", () => {
    makePerson();
    resetFactorySequence();
    expect(makePerson().id).toBe("person-1");
  });
});
