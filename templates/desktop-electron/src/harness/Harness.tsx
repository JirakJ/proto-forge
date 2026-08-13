import { useEffect, useState } from "react";
import { ProtoUIProvider, tokens } from "@jj/proto-ui";
import { cases } from "./cases";
import { mounts } from "./mounts";

// @adr 009 - one case per URL fragment, so a screenshot tool and a test can address it
// #/<case-id> renders exactly one case inside a fixed-size frame. One case per page
// keeps each screenshot tight and stable: no neighbouring component can change an image
// by reflowing the page, and no test can be perturbed by another case's overlay.

const caseFromHash = () => window.location.hash.replace(/^#\/?/, "");

export function Harness() {
  const [id, setId] = useState(caseFromHash);

  useEffect(() => {
    const onHashChange = () => setId(caseFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const active = cases.find((c) => c.id === id);
  const mount = active === undefined ? undefined : mounts[active.id];

  if (active === undefined || mount === undefined) {
    return (
      <main data-testid="harness-index" style={{ padding: tokens.space.lg, fontFamily: tokens.font.family }}>
        <h1 data-testid="harness-title">Component harness</h1>
        <ul data-testid="harness-list">
          {cases
            .filter((c) => c.kind !== "structural")
            .map((c) => (
              // The data-* attributes ARE the manifest `pnpm docs:shots` reads. Keeping
              // it in the DOM beats a window global or an inline JSON blob: no global
              // mutation, nothing for the CSP to object to, and it stays in sync by
              // construction because it is rendered from the same array.
              <li
                key={c.id}
                data-testid={`harness-link-${c.id}`}
                data-case={c.id}
                data-component={c.component}
                data-name={c.state}
                data-note={c.note}
                data-click={(c.interactions?.click ?? []).join(",")}
              >
                <a href={`#/${c.id}`} data-testid={`harness-anchor-${c.id}`}>
                  {c.component} — {c.state}
                </a>
              </li>
            ))}
        </ul>
      </main>
    );
  }

  return (
    <ProtoUIProvider>
      <main
        data-testid="harness-case"
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
        {mount()}
      </main>
    </ProtoUIProvider>
  );
}
