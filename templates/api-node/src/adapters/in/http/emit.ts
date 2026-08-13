import { buildOpenApiDocument } from "./contract.js";
import { routes } from "./routes.js";

// @adr 008 - the committed contract is emitted, never edited
//
// tsx-executable: `pnpm exec tsx src/adapters/in/http/emit.ts > contract/openapi.json`.
// Canonical JSON with sorted keys and no timestamps — byte-deterministic (BR-22).
process.stdout.write(`${JSON.stringify(buildOpenApiDocument(routes), null, 2)}\n`);
