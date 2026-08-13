package app.adapter.in.web;

import app.application.NoteService;
import app.domain.note.Note;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** notes-get: a malformed uuid never reaches the service (type conversion is the boundary). */
@RestController
public final class NotesGetHandler implements OperationHandler {

  private final NoteService service;

  public NotesGetHandler(NoteService service) {
    this.service = service;
  }

  @Override
  public String operationId() {
    return "notes-get";
  }

  public Note handle(@PathVariable("id") UUID id) {
    return service.getNote(id);
  }
}
