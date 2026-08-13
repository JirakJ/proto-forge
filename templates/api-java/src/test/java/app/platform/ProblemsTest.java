package app.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Map;
import org.junit.jupiter.api.Test;

class ProblemsTest {

  @Test
  void everyKeyEqualsItsEntrysCode() {
    for (Map.Entry<String, ProblemDef> entry : Problems.PROBLEMS.entrySet()) {
      assertEquals(entry.getKey(), entry.getValue().code(), "one name per problem (BR-23)");
    }
  }

  @Test
  void byCodeReturnsTheRegisteredDefinition() {
    ProblemDef def = Problems.byCode("note-not-found");

    assertEquals(404, def.status());
    assertEquals("No note exists under this id", def.title());
  }

  @Test
  void byCodeRefusesAnUnregisteredCode() {
    assertThrows(IllegalArgumentException.class, () -> Problems.byCode("ghost-error"));
  }

  @Test
  void appProblemBodyIsTheRfc9457Document() {
    Map<String, Object> body = new AppProblem("note-not-found").body("/notes/x");

    assertEquals("/problems/note-not-found", body.get("type"));
    assertEquals("No note exists under this id", body.get("title"));
    assertEquals(404, body.get("status"));
    assertEquals("/notes/x", body.get("instance"));
    assertEquals("note-not-found", body.get("code"));
    assertFalse(body.containsKey("detail"), "no detail member unless the failure has one");
  }

  @Test
  void appProblemCarriesItsDetailWhenGiven() {
    Map<String, Object> body = new AppProblem("validation-failed", "text: must not be blank").body("/notes");

    assertEquals("text: must not be blank", body.get("detail"));
    assertEquals(400, body.get("status"));
  }
}
