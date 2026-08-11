import { useEffect, useState } from "react";
import { tokens } from "@jj/proto-ui";
import { cases, GalleryProviders } from "./cases";

// @adr 009 - one case per URL fragment, so a screenshot tool can address it
// #/<case-id> renders exactly one case inside a fixed-size frame. One case per
// page keeps each screenshot tight and stable: no neighbouring component can
// change an image by reflowing the page.

const caseFromHash = () => window.location.hash.replace(/^#\/?/, "");

export function Gallery() {
  const [id, setId] = useState(caseFromHash);

  useEffect(() => {
    const onHashChange = () => setId(caseFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const active = cases.find((c) => c.id === id);

  if (!active) {
    return (
      <main data-testid="gallery-index" style={{ padding: tokens.space.lg, fontFamily: tokens.font.family }}>
        <h1 data-testid="gallery-title">Component gallery</h1>
        <ul data-testid="gallery-list">
          {cases.map((c) => (
            // The data-* attributes ARE the manifest `pnpm docs:shots` reads. Keeping
            // it in the DOM beats a window global or an inline JSON blob: no global
            // mutation, nothing for the CSP to object to, and it stays in sync by
            // construction because it is rendered from the same array.
            <li
              key={c.id}
              data-testid={`gallery-link-${c.id}`}
              data-case={c.id}
              data-component={c.component}
              data-name={c.name}
              data-note={c.note}
              data-click={c.clickTestid ?? ""}
            >
              <a href={`#/${c.id}`} data-testid={`gallery-anchor-${c.id}`}>
                {c.component} — {c.name}
              </a>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <GalleryProviders>
      <main
        data-testid="gallery-case"
        data-case={active.id}
        style={{
          padding: tokens.space.lg,
          fontFamily: tokens.font.family,
          color: tokens.color.fg,
          background: tokens.color.bg,
          minBlockSize: "220px",
          inlineSize: "720px",
        }}
      >
        {active.render()}
      </main>
    </GalleryProviders>
  );
}
