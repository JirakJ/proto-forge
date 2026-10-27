package app.e2e;

import tools.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;

/**
 * Canonical JSON with recursively sorted keys and two-space indentation - the
 * same bytes JSON.stringify(sortKeysDeep(x), null, 2) yields in the node gate
 * corpus, so captured examples stay diffable across stacks (BR-26).
 */
public final class CanonicalJson {

  public static String write(JsonNode node) {
    StringBuilder out = new StringBuilder();
    render(node, 0, out);
    out.append('\n');
    return out.toString();
  }

  private static void render(JsonNode node, int depth, StringBuilder out) {
    if (node.isObject()) {
      List<String> names = new ArrayList<>();
      node.propertyNames().forEach(names::add);
      names.sort(String::compareTo);
      if (names.isEmpty()) {
        out.append("{}");
        return;
      }
      out.append("{\n");
      for (int i = 0; i < names.size(); i++) {
        indent(depth + 1, out);
        out.append('"').append(names.get(i)).append("\": ");
        render(node.get(names.get(i)), depth + 1, out);
        out.append(i < names.size() - 1 ? ",\n" : "\n");
      }
      indent(depth, out);
      out.append('}');
    } else if (node.isArray()) {
      if (node.isEmpty()) {
        out.append("[]");
        return;
      }
      out.append("[\n");
      for (int i = 0; i < node.size(); i++) {
        indent(depth + 1, out);
        render(node.get(i), depth + 1, out);
        out.append(i < node.size() - 1 ? ",\n" : "\n");
      }
      indent(depth, out);
      out.append(']');
    } else {
      // Scalars: Jackson's toString is valid JSON for text, numbers, booleans, null.
      out.append(node.toString());
    }
  }

  private static void indent(int depth, StringBuilder out) {
    out.append("  ".repeat(depth));
  }

  private CanonicalJson() {}
}
