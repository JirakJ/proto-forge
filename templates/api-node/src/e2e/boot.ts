import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { buildApp } from "../adapters/in/http/app.js";
import { makeDb } from "../adapters/out/persistence/driver.js";
import { makeNoteRepository } from "../adapters/out/persistence/noteRepository.js";
import { makeNoteService } from "../application/note/noteService.js";
import { SEED_CLOCK, type HarnessCase } from "../harness/cases.js";
import { seedNotes } from "../harness/seed.js";
import { loadDocsFromDisk } from "../platform/docs.js";
import { noopLogger } from "../platform/logger.js";

// Conformance boot: the whole stack over the in-process engine (PGlite plus the
// shipped migrations) with clock and id source pinned to constants, so every
// response body is byte-stable across machines and runs (BR-26).
//
// This file lives in src/e2e deliberately: a conformance entry must touch the
// inbound adapter, the outbound adapter AND the harness at once, which no
// single architecture element is allowed to do — e2e is composition, like
// main.ts, and is excluded from the production build and coverage thresholds.

export type ConformanceApp = {
  app: FastifyInstance;
  close: () => Promise<void>;
};

export async function bootConformanceApp(): Promise<ConformanceApp> {
  const handle = await makeDb();
  const repo = makeNoteRepository(handle.db);
  await seedNotes(repo);
  const service = makeNoteService({ repo, now: () => SEED_CLOCK, newId: fixedIdSequence() });
  const app = buildApp({ service, logger: noopLogger, docs: loadDocsFromDisk() });
  return {
    app,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

export function executeCase(
  app: FastifyInstance,
  harnessCase: HarnessCase,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: harnessCase.request.method,
    url: harnessCase.request.path,
    ...(harnessCase.request.body === undefined ? {} : { payload: harnessCase.request.body }),
  });
}

function fixedIdSequence(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  };
}
