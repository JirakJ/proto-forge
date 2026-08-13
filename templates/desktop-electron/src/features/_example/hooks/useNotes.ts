import { useCallback, useEffect, useState } from "react";
import { draftNote, type Note } from "@/domain/note/model";
import { noteRepository } from "@/infra/persistence/noteRepository";
import { seedIfEmpty } from "@/infra/persistence/seed";
import type { NoteRepository } from "@/domain/note/repository";

// ponytail: demo hook — removed with the rest of _example on real generation.
export function useNotes(repo: NoteRepository = noteRepository) {
  const [notes, setNotes] = useState<Note[]>([]);

  const refresh = useCallback(async () => {
    setNotes(await repo.list());
  }, [repo]);

  useEffect(() => {
    void (async () => {
      await seedIfEmpty(repo);
      await refresh();
    })();
  }, [repo, refresh]);

  const add = useCallback(
    async (text: string) => {
      await repo.add(draftNote(text));
      await refresh();
    },
    [repo, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await repo.remove(id);
      await refresh();
    },
    [repo, refresh],
  );

  return { notes, add, remove };
}
