import { buildApp } from "./adapters/in/http/app.js";
import { makeDb } from "./adapters/out/persistence/driver.js";
import { makeNoteRepository } from "./adapters/out/persistence/noteRepository.js";
import { makeNoteService } from "./application/note/noteService.js";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./platform/logger.js";

// Composition root — covered by the e2e conformance run, not unit coverage.
// Determinism is injected here and only here: the real clock and
// crypto.randomUUID enter as port dependencies, so everything below this file
// stays testable with pinned values.
const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const { db, close } = await makeDb(env.DATABASE_URL);
const service = makeNoteService({
  repo: makeNoteRepository(db),
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
});
const app = buildApp({ service, logger, gitSha: env.GIT_SHA });

await app.listen({ port: env.PORT, host: "0.0.0.0" });
logger.info({ port: env.PORT }, "listening");

const shutdown = async (): Promise<void> => {
  logger.info({}, "shutting down");
  await app.close();
  await close();
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
