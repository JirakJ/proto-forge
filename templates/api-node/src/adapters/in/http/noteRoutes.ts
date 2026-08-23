import { z } from "zod";
import { NoteCreateSchema, NoteSchema } from "../../../domain/note/schema.js";
import type { RouteDef } from "./routes.js";

export const NoteIdParamsSchema = z.object({ id: z.uuid() });

// NFR-29: collections are paginated — a top-level array is an unbounded
// collection and the contract gate rejects it. The envelope carries the page
// AND its coordinates, so a consumer can always ask for the next one.
export const NoteListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const NotePageSchema = z.object({
  items: z.array(NoteSchema),
  total: z.number().int().min(0),
  limit: z.number().int().min(1).max(200),
  offset: z.number().int().min(0),
});

// @adr 030 - the example API slice, deleted with the demo
// The Note slice's contract rows (BR-25): operationId is `<resource>-<verb>`,
// paths appear here and nowhere else, schemas come from the domain.
export const noteRoutes: RouteDef[] = [
  {
    operationId: "notes-list",
    method: "GET",
    path: "/notes",
    summary: "List notes, oldest first, one page at a time.",
    request: { query: NoteListQuerySchema },
    responses: { 200: NotePageSchema },
    problems: ["validation-failed"],
  },
  {
    operationId: "notes-get",
    method: "GET",
    path: "/notes/:id",
    summary: "Fetch a single note by id.",
    request: { params: NoteIdParamsSchema },
    responses: { 200: NoteSchema },
    problems: ["note-not-found", "validation-failed"],
  },
  {
    operationId: "notes-create",
    method: "POST",
    path: "/notes",
    summary: "Create a note from its text.",
    request: { body: NoteCreateSchema },
    responses: { 201: NoteSchema },
    problems: ["validation-failed"],
  },
  {
    operationId: "notes-delete",
    method: "DELETE",
    path: "/notes/:id",
    summary: "Delete a note by id.",
    request: { params: NoteIdParamsSchema },
    responses: { 204: null },
    problems: ["note-not-found", "validation-failed"],
  },
];
