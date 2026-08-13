package app.e2e;

import static org.junit.jupiter.api.Assertions.assertTrue;

import app.fixtures.InMemoryNoteRepository;
import app.fixtures.SequentialIdGenerator;
import app.harness.HarnessCase;
import app.harness.HarnessCases;
import app.harness.HarnessSeed;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import slices.SliceApp;

// @adr 003 - the e2e conformance run (test:e2e is the last verify step)
//
// Replays every harness scenario against the booted MockMvc slice and holds each
// response to the registry's own declarations - status, problem codes, shape.
// This is the pass/fail gate OUTSIDE the coverage percentage: the wiring, the
// registrar and the error advice are proven by exercising them, not by counting
// their lines.
@SpringBootTest(classes = SliceApp.class)
@AutoConfigureMockMvc
@Tag("conformance")
class ConformanceTest {

  @Autowired
  private MockMvc mvc;

  @Autowired
  private InMemoryNoteRepository repository;

  @Autowired
  private SequentialIdGenerator ids;

  @Test
  void everyHarnessScenarioConformsToTheRegistry() throws Exception {
    HarnessSeed.seed(repository);
    ids.reset();
    List<String> failures = new ArrayList<>();
    for (HarnessCase harnessCase : HarnessCases.CASES) {
      MockHttpServletResponse response = Replay.execute(mvc, harnessCase);
      failures.addAll(Conformance.check(
          harnessCase, response.getStatus(), response.getContentAsString(StandardCharsets.UTF_8)));
    }
    assertTrue(failures.isEmpty(), "conformance failures:\n" + String.join("\n", failures));
  }
}
