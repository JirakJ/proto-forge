package slices;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

// @adr 008 - the committed contract is emitted, never edited (BR-22)
//
// The emit half of `./gradlew contractEmit`: springdoc serves /v3/api-docs from
// the MockMvc slice - no socket, no database - and this test writes the raw
// document to build/contract/openapi.raw.json. scripts/contract-verify.mjs then
// normalizes it (shared normalizer: sorted keys, volatile members stripped) and
// byte-compares against contract/openapi.json.
@SpringBootTest(
    classes = {SliceApp.class, ContractConfig.class},
    properties = {"springdoc.paths-to-exclude=/healthz,/version"})
@AutoConfigureMockMvc
@Tag("contract")
class ContractEmitTest {

  @Autowired
  private MockMvc mvc;

  @Test
  void emitsTheRawOpenApiDocument() throws Exception {
    String json = mvc.perform(get("/v3/api-docs"))
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString(StandardCharsets.UTF_8);
    Path out = Path.of("build", "contract", "openapi.raw.json");
    Files.createDirectories(out.getParent());
    Files.writeString(out, json);
  }
}
