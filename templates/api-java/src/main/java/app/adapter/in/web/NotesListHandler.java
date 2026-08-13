package app.adapter.in.web;

import app.application.NoteService;
import app.domain.note.Note;
import java.util.List;
import org.springframework.web.bind.annotation.RestController;

/** notes-list: mapping-annotation-free; the RouteRegistrar wires the registry's path. */
@RestController
public final class NotesListHandler implements OperationHandler {

  private final NoteService service;

  public NotesListHandler(NoteService service) {
    this.service = service;
  }

  @Override
  public String operationId() {
    return "notes-list";
  }

  public List<Note> handle() {
    return service.listNotes();
  }
}
