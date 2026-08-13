package app.adapter.in.web;

import app.application.NoteService;
import app.domain.note.Note;
import app.domain.note.NoteCreate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** notes-create: the service validates the payload against the domain constraints. */
@RestController
public final class NotesCreateHandler implements OperationHandler {

  private final NoteService service;

  public NotesCreateHandler(NoteService service) {
    this.service = service;
  }

  @Override
  public String operationId() {
    return "notes-create";
  }

  public ResponseEntity<Note> handle(@RequestBody NoteCreate body) {
    return ResponseEntity.status(201).body(service.createNote(body));
  }
}
