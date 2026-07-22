import { useTranslation } from "react-i18next";
import { ProtoUIProvider, tokens } from "@jj/proto-ui";
import { NotesFeature } from "@/features/_example/ui/NotesFeature";
import { routes } from "./routes";

// App shell: landmarks (header/nav/main/footer) + skip link (BRS §5). Regenerated
// per prototype; the demo NotesFeature is removed on real generation.
export function App() {
  const { t } = useTranslation();
  return (
    <ProtoUIProvider provider="own">
      <a
        href="#main"
        data-testid="skip-link"
        style={{
          position: "absolute",
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
      <header style={{ padding: tokens.space.md, fontFamily: tokens.font.family }}>
        <h1 style={{ fontSize: tokens.font.sizeLg, color: tokens.color.fg }}>{t("app.title")}</h1>
        <nav aria-label={t("nav.home")}>
          <a href={routes.home} data-testid="nav-home" style={{ color: tokens.color.primary }}>
            {t("nav.home")}
          </a>
        </nav>
      </header>
      <main
        id="main"
        style={{
          padding: tokens.space.lg,
          fontFamily: tokens.font.family,
          color: tokens.color.fg,
        }}
      >
        <NotesFeature />
      </main>
      <footer style={{ padding: tokens.space.md, color: tokens.color.muted }} />
    </ProtoUIProvider>
  );
}
