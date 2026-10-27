package app.e2e;

import app.fixtures.InMemoryNoteRepository;
import app.fixtures.SequentialIdGenerator;
import app.harness.HarnessCase;
import app.harness.HarnessCases;
import app.harness.HarnessSeed;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.NullNode;
import tools.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import slices.SliceApp;

// Docs example capture (BR-26): replays the harness scenarios and writes each
// exchange to docs/api/<operationId>/examples/<case-id>.json. Same pinned clock
// and ids as the conformance run, so reruns are byte-identical. Run through
// `./gradlew exampleCapture` (pnpm docs:examples re-pins the lock afterwards).
@SpringBootTest(classes = SliceApp.class)
@AutoConfigureMockMvc
@Tag("capture")
class CaptureTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Autowired
  private MockMvc mvc;

  @Autowired
  private InMemoryNoteRepository repository;

  @Autowired
  private SequentialIdGenerator ids;

  @Test
  void capturesEveryHarnessScenario() throws Exception {
    HarnessSeed.seed(repository);
    ids.reset();
    for (HarnessCase harnessCase : HarnessCases.CASES) {
      MockHttpServletResponse response = Replay.execute(mvc, harnessCase);
      Path directory = Path.of("docs", "api", harnessCase.operationId(), "examples");
      Files.createDirectories(directory);
      Files.writeString(
          directory.resolve(harnessCase.id() + ".json"),
          CanonicalJson.write(example(harnessCase, response)));
    }
  }

  private static ObjectNode example(HarnessCase harnessCase, MockHttpServletResponse response) throws Exception {
    ObjectNode example = MAPPER.createObjectNode();
    ObjectNode request = example.putObject("request");
    request.put("method", harnessCase.method());
    request.put("path", harnessCase.path());
    if (harnessCase.body() != null) {
      request.set("body", MAPPER.readTree(harnessCase.body()));
    }
    String body = response.getContentAsString(StandardCharsets.UTF_8);
    ObjectNode responseNode = example.putObject("response");
    responseNode.put("status", response.getStatus());
    responseNode.putObject("headers").put("content-type", contentType(response));
    responseNode.set("body", body.isEmpty() ? NullNode.getInstance() : MAPPER.readTree(body));
    return example;
  }

  private static String contentType(MockHttpServletResponse response) {
    return response.getContentType() == null ? "" : response.getContentType();
  }
}
