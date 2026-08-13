import type { NoteService } from "../../../application/note/noteService.js";
import { NoteIdParamsSchema } from "./noteRoutes.js";

/** Request parts, already validated against the route's schemas by the app wiring. */
export type OperationInput = {
  params: unknown;
  query: unknown;
  body: unknown;
};

export type OperationResult = {
  status: number;
  /** `null` means "no body" (204). */
  body: unknown;
};

export type OperationHandler = (input: OperationInput) => Promise<OperationResult>;

// One handler per operationId in the registry. Handlers re-parse the part they
// consume — cheap, and it keeps them honestly typed without a cast.
export function makeHandlers(service: NoteService): ReadonlyMap<string, OperationHandler> {
  return new Map<string, OperationHandler>([
    ["notes-list", async () => ({ status: 200, body: await service.listNotes() })],
    [
      "notes-get",
      async ({ params }) => ({
        status: 200,
        body: await service.getNote(NoteIdParamsSchema.parse(params).id),
      }),
    ],
    ["notes-create", async ({ body }) => ({ status: 201, body: await service.createNote(body) })],
    [
      "notes-delete",
      async ({ params }) => {
        await service.deleteNote(NoteIdParamsSchema.parse(params).id);
        return { status: 204, body: null };
      },
    ],
  ]);
}
