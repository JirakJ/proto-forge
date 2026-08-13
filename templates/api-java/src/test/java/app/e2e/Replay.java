package app.e2e;

import app.harness.HarnessCase;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** One way to execute a harness case, shared by the conformance run and the capture. */
public final class Replay {

  public static MockHttpServletResponse execute(MockMvc mvc, HarnessCase harnessCase) throws Exception {
    MockHttpServletRequestBuilder request =
        MockMvcRequestBuilders.request(HttpMethod.valueOf(harnessCase.method()), harnessCase.path());
    if (harnessCase.body() != null) {
      request = request.contentType(MediaType.APPLICATION_JSON).content(harnessCase.body());
    }
    return mvc.perform(request).andReturn().getResponse();
  }

  private Replay() {}
}
