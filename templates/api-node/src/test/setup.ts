import { beforeEach } from "vitest";
import { resetFactorySequence } from "./factory.js";

// Deterministic fixtures: the factory counter restarts before every test, so a
// test's fixture values never depend on what ran before it.
beforeEach(() => {
  resetFactorySequence();
});
