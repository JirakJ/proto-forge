package app.adapter.out.persistence;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Spring Data surface for the notes table; only the adapter sees it. */
public interface NoteJpaRepository extends JpaRepository<NoteEntity, UUID> {

  /** The registry's listing order: createdAt, then id - total and heap-independent. */
  List<NoteEntity> findAllByOrderByCreatedAtAscIdAsc();
}
