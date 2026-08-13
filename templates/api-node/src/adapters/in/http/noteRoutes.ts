import { z } from "zod";
import { NoteCreateSchema, NoteSchema } from "../../../domain/note/schema.js";
import type { RouteDef } from "./routes.js";

export const NoteIdParamsSchema = z.object({ id: z.uuid() });

// @adr 030 - the example API slice, deleted with the demo
// The Note slice's contract rows (BR-25): operationId is `<resource>-<verb>`,
// paths appear here and nowhere else, schemas come from the domain.
export const noteRoutes: RouteDef[] = [
  {
    operationId: "notes-list",
    method: "GET",
    path: "/notes",
    summary: "List every note, oldest first.",
    responses: { 200: z.array(NoteSchema) },
    problems: [],
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
