package slices;

import app.adapter.in.web.OperationHandler;
import app.adapter.in.web.RouteDef;
import app.adapter.in.web.RouteRegistry;
import app.platform.ProblemDef;
import app.platform.Problems;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.ArraySchema;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.IntegerSchema;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.responses.ApiResponses;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.customizers.OperationCustomizer;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

// @adr 008 - springdoc emits, the registry decides
//
// springdoc introspects the MockMvc slice's handler methods for schemas; these
// customizers overlay everything the registry owns - operationId, summary, the
// response set (success shapes + declared problems + the implicit 500) - so the
// emitted document is a derivation of RouteRegistry, never of annotation drift.
@Configuration
public class ContractConfig {

  @Bean
  OpenAPI contractBase() {
    return new OpenAPI().info(new Info().title("proto-forge-service").version("0.1.0"));
  }

  @Bean
  OperationCustomizer registryOperations(ApplicationContext context) {
    return (operation, handlerMethod) -> {
      Object bean = context.getBean(handlerMethod.getBeanType());
      if (!(bean instanceof OperationHandler handler)) {
        return operation;
      }
      RouteDef def = RouteRegistry.ROUTES.stream()
          .filter(route -> route.operationId().equals(handler.operationId()))
          .findFirst()
          .orElseThrow(() -> new IllegalStateException("handler without a registry entry: " + handler.operationId()));
      operation.setOperationId(def.operationId());
      operation.setSummary(def.summary());
      operation.setResponses(responsesFor(def));
      if (def.requestType() != null && operation.getRequestBody() != null) {
        operation.getRequestBody().setRequired(Boolean.TRUE);
      }
      return operation;
    };
  }

  @Bean
  OpenApiCustomizer problemComponent() {
    return openApi -> openApi.getComponents().addSchemas("Problem", problemSchema());
  }

  private static ApiResponses responsesFor(RouteDef def) {
    ApiResponses responses = new ApiResponses();
    for (Map.Entry<Integer, RouteDef.ResponseShape> entry : new TreeMap<>(def.responseByStatus()).entrySet()) {
      responses.addApiResponse(String.valueOf(entry.getKey()), successResponse(entry.getValue()));
    }
    // Every operation implicitly carries 500: the advice maps any unregistered
    // failure to the catalogue's "internal" problem.
    List<String> codes = new ArrayList<>(def.problems());
    codes.add("internal");
    for (Map.Entry<Integer, List<ProblemDef>> byStatus : problemsByStatus(codes).entrySet()) {
      String titles = String.join("; ", byStatus.getValue().stream().map(ProblemDef::title).toList());
      responses.addApiResponse(String.valueOf(byStatus.getKey()), new ApiResponse()
          .description(titles)
          .content(problemContent()));
    }
    return responses;
  }

  private static ApiResponse successResponse(RouteDef.ResponseShape shape) {
    if (shape.type() == null) {
      return new ApiResponse().description("No content.");
    }
    Schema<?> item = new Schema<>().$ref("#/components/schemas/" + shape.type().getSimpleName());
    Schema<?> schema = shape.array() ? new ArraySchema().items(item) : item;
    return new ApiResponse()
        .description("Success.")
        .content(new Content().addMediaType("application/json", new MediaType().schema(schema)));
  }

  private static Map<Integer, List<ProblemDef>> problemsByStatus(List<String> codes) {
    Map<Integer, List<ProblemDef>> byStatus = new TreeMap<>();
    for (String code : codes) {
      ProblemDef problem = Problems.byCode(code);
      byStatus.computeIfAbsent(problem.status(), status -> new ArrayList<>()).add(problem);
    }
    return byStatus;
  }

  private static Content problemContent() {
    return new Content().addMediaType(
        "application/problem+json",
        new MediaType().schema(new Schema<>().$ref("#/components/schemas/Problem")));
  }

  private static Schema<?> problemSchema() {
    ObjectSchema schema = new ObjectSchema();
    schema.setDescription("RFC 9457 problem document; `code` is the stable key into the problem catalogue.");
    schema.addProperty("type", new StringSchema());
    schema.addProperty("title", new StringSchema());
    schema.addProperty("status", new IntegerSchema());
    schema.addProperty("detail", new StringSchema());
    schema.addProperty("instance", new StringSchema());
    schema.addProperty("code", new StringSchema());
    schema.setRequired(List.of("type", "title", "status", "instance", "code"));
    return schema;
  }
}
