package app.adapter.in.web;

import app.domain.note.Note;
import app.domain.note.NoteCreate;
import java.util.List;

// @adr 030 - the example API slice, deleted with the demo
/**
 * The Note slice's contract rows (BR-25): operationId is {@code <resource>-<verb>},
 * paths appear here and nowhere else, shapes come from the domain records.
 */
public final class NoteRoutes {

  public static final List<RouteDef> NOTE_ROUTES = List.of(
      RouteDef.builder()
          .operationId("notes-list")
          .method("GET")
          .path("/notes")
          .summary("List every note, oldest first.")
          .responseList(200, Note.class)
          .problems()
          .build(),
      RouteDef.builder()
          .operationId("notes-get")
          .method("GET")
          .path("/notes/{id}")
          .summary("Fetch a single note by id.")
          .response(200, Note.class)
          .problems("note-not-found", "validation-failed")
          .build(),
      RouteDef.builder()
          .operationId("notes-create")
          .method("POST")
          .path("/notes")
          .summary("Create a note from its text.")
          .request(NoteCreate.class)
          .response(201, Note.class)
          .problems("validation-failed")
          .build(),
      RouteDef.builder()
          .operationId("notes-delete")
          .method("DELETE")
          .path("/notes/{id}")
          .summary("Delete a note by id.")
          .noContent(204)
          .problems("note-not-found", "validation-failed")
          .build());

  private NoteRoutes() {}
}
