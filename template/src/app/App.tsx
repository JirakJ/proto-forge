import { useTranslation } from "react-i18next";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { ProtoUIProvider, tokens } from "@jj/proto-ui";
import { NotesFeature } from "@/features/_example/ui/NotesFeature";
import { ErrorBoundary } from "./ErrorBoundary";
import { NotFound } from "./NotFound";
import { routes } from "./routes";

// @adr 005 - client-side routing driven by the single route table
// App shell: landmarks (header/nav/main/footer) + skip link (BRS §5), routed
// content wrapped in the error boundary. Regenerated per prototype; only the demo
// NotesFeature route is removed on a real generation run.
export function App() {
  const { t } = useTranslation();
  return (
    <ProtoUIProvider provider="own">
      <BrowserRouter>
        <a
          href="#main"
          data-testid="skip-link"
          style={{
            position: "absolute",
            // Above the shell so the skip link is never buried, below every popup
            // so it can't cover a dialog the user is reading (BR-16).
            zIndex: tokens.layer.sticky,
            insetInlineStart: tokens.space.sm,
            insetBlockStart: tokens.space.sm,
            padding: tokens.space.sm,
            background: tokens.color.primary,
            color: tokens.color.primaryFg,
            borderRadius: tokens.radius.sm,
          }}
        >
          {t("app.skipToContent")}
        </a>
        <header data-testid="app-header" style={{ padding: tokens.space.md, fontFamily: tokens.font.family }}>
          <h1 data-testid="app-title" style={{ fontSize: tokens.font.sizeLg, color: tokens.color.fg }}>
            {t("app.title")}
          </h1>
          <nav data-testid="app-nav" aria-label={t("nav.home")}>
            <Link to={routes.home} data-testid="nav-home" style={{ color: tokens.color.primary }}>
              {t("nav.home")}
            </Link>
          </nav>
        </header>
        <main
          id="main"
          data-testid="app-main"
          style={{
            padding: tokens.space.lg,
            fontFamily: tokens.font.family,
            color: tokens.color.fg,
          }}
        >
          <ErrorBoundary>
            <Routes>
              <Route path={routes.home} element={<NotesFeature />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </main>
        <footer data-testid="app-footer" style={{ padding: tokens.space.md, color: tokens.color.muted }} />
      </BrowserRouter>
    </ProtoUIProvider>
  );
}
