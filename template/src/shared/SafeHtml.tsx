import DOMPurify from "dompurify";
import type { HTMLAttributes } from "react";

export type SafeHtmlProps = { html: string } & HTMLAttributes<HTMLDivElement>;

// @adr 100 - sanitized-HTML entry point and CSP posture
// The ONLY sanctioned entry point for raw HTML (BRS §4.1). Everything is passed
// through DOMPurify first; the lint rules that ban dangerouslySetInnerHTML are
// disabled here on purpose and nowhere else.
export function SafeHtml({ html, ...rest }: SafeHtmlProps) {
  const clean = DOMPurify.sanitize(html);
  // eslint-disable-next-line react/no-danger
  return <div {...rest} dangerouslySetInnerHTML={{ __html: clean }} />;
}
