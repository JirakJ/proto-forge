package app.adapter.in.web;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.HashMap;
import java.util.Map;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

// @adr 008 - the registry IS the wiring
/**
 * Every RouteDef becomes one Spring MVC mapping with dispatch by operationId
 * (BR-25). A def without a handler - or two handlers claiming one operation - is
 * a wiring bug, failed loudly at startup rather than discovered by a 404.
 * Handlers are registered by BEAN NAME, so introspection tooling (springdoc in
 * the contractEmit slice) sees them exactly like annotation-mapped controllers.
 */
@Component
public final class RouteRegistrar implements SmartInitializingSingleton {

  private final RequestMappingHandlerMapping mapping;
  private final ApplicationContext context;

  public RouteRegistrar(RequestMappingHandlerMapping mapping, ApplicationContext context) {
    this.mapping = mapping;
    this.context = context;
  }

  @Override
  public void afterSingletonsInstantiated() {
    Map<String, String> beanNamesById = beanNamesByOperationId();
    RequestMappingInfo.BuilderConfiguration options = new RequestMappingInfo.BuilderConfiguration();
    options.setPatternParser(mapping.getPatternParser());
    for (RouteDef def : RouteRegistry.ROUTES) {
      String beanName = beanNamesById.get(def.operationId());
      if (beanName == null) {
        throw new IllegalStateException("no handler registered for operation \"" + def.operationId() + "\"");
      }
      RequestMappingInfo info = RequestMappingInfo.paths(def.path())
          .methods(RequestMethod.valueOf(def.method()))
          .options(options)
          .build();
      mapping.registerMapping(info, beanName, handleMethod(context.getBean(beanName, OperationHandler.class)));
    }
  }

  private Map<String, String> beanNamesByOperationId() {
    Map<String, String> byId = new HashMap<>();
    for (Map.Entry<String, OperationHandler> entry : context.getBeansOfType(OperationHandler.class).entrySet()) {
      String previous = byId.putIfAbsent(entry.getValue().operationId(), entry.getKey());
      if (previous != null) {
        throw new IllegalStateException(
            "two handlers claim operation \"" + entry.getValue().operationId() + "\": "
                + previous + " and " + entry.getKey());
      }
    }
    return byId;
  }

  private static Method handleMethod(OperationHandler handler) {
    for (Method method : handler.getClass().getDeclaredMethods()) {
      if ("handle".equals(method.getName()) && Modifier.isPublic(method.getModifiers())) {
        return method;
      }
    }
    throw new IllegalStateException(handler.getClass().getName() + " declares no public handle(...) method");
  }
}
