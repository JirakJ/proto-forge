package app.adapter.in.web;

import app.application.NoteService;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** notes-delete: 204 carries no body; a missing id is the registered note-not-found. */
@RestController
public final class NotesDeleteHandler implements OperationHandler {

  private final NoteService service;

  public NotesDeleteHandler(NoteService service) {
    this.service = service;
  }

  @Override
  public String operationId() {
    return "notes-delete";
  }

  public ResponseEntity<Void> handle(@PathVariable("id") UUID id) {
    service.deleteNote(id);
    return ResponseEntity.noContent().build();
  }
}
