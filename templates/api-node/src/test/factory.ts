// Test-infra surface of the fixture factory. The implementation lives in
// src/domain/__fixtures__/factory.ts so that per-layer __fixtures__ can import
// it without crossing an illegal boundary edge (no layer may reach src/test/**);
// this re-export keeps the canonical test-infra import path stable.
export {
  defineFactory,
  nextSequence,
  resetFactorySequence,
} from "../domain/__fixtures__/factory.js";
