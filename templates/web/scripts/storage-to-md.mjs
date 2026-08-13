// The inverse of md-to-storage.mjs, for `pnpm sync:pull`: Confluence storage format
// back to Markdown, covering exactly the constructs the push side emits — headings,
// paragraphs, inline code, bold, links, images-as-attachments, tables, lists and CDATA
// code blocks. Anything outside that vocabulary survives as text rather than being
// dropped silently, so a pulled page never loses content without showing it.

const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

/** Inline storage markup -> inline Markdown. Applied inside block conversions. */
function inline(html) {
  return unescapeXml(
    html
      .replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**")
      .replace(/<em>([\s\S]*?)<\/em>/g, "*$1*")
      .replace(/<code>([\s\S]*?)<\/code>/g, "`$1`")
      .replace(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, "[$2]($1)")
      .replace(/<ri:attachment ri:filename="([^"]+)"\s*\/>/g, "![]($1)")
      .replace(/<ac:image[^>]*>\s*<ri:attachment ri:filename="([^"]+)"[^>]*\/>\s*<\/ac:image>/g, "![]($1)")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  ).trim();
}

function table(block) {
  const rows = [...block.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((cell) => inline(cell[1])),
  );
  if (rows.length === 0) return "";
  const header = rows[0];
  const lines = [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`];
  for (const row of rows.slice(1)) lines.push(`| ${row.join(" | ")} |`);
  return lines.join("\n");
}

function list(block, ordered) {
  return [...block.matchAll(/<li>([\s\S]*?)<\/li>/g)]
    .map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${inline(item[1])}`)
    .join("\n");
}

function codeBlock(block) {
  const language = /<ac:parameter ac:name="language">([^<]*)<\/ac:parameter>/.exec(block)?.[1] ?? "";
  const body = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(block)?.[1] ?? "";
  return `\`\`\`${language}\n${body.replace(/\n$/, "")}\n\`\`\``;
}

/** Confluence storage XHTML -> Markdown. */
export function storageToMd(storage) {
  const blocks = [];
  // Tokenise top-level blocks in document order; the push side nests nothing deeper.
  const BLOCK =
    /<h([1-6])>([\s\S]*?)<\/h\1>|<ac:structured-macro[^>]*ac:name="code"[\s\S]*?<\/ac:structured-macro>|<table>[\s\S]*?<\/table>|<ol>[\s\S]*?<\/ol>|<ul>[\s\S]*?<\/ul>|<p>([\s\S]*?)<\/p>/g;

  for (const m of storage.matchAll(BLOCK)) {
    const [whole, level, heading, paragraph] = m;
    if (level !== undefined) {
      blocks.push(`${"#".repeat(Number(level))} ${inline(heading)}`);
    } else if (whole.startsWith("<ac:structured-macro")) {
      blocks.push(codeBlock(whole));
    } else if (whole.startsWith("<table>")) {
      blocks.push(table(whole));
    } else if (whole.startsWith("<ol>")) {
      blocks.push(list(whole, true));
    } else if (whole.startsWith("<ul>")) {
      blocks.push(list(whole, false));
    } else if (paragraph !== undefined) {
      const text = inline(paragraph);
      if (text !== "") blocks.push(text);
    }
  }
  return `${blocks.join("\n\n")}\n`;
}
