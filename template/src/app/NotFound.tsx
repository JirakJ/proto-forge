import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { tokens } from "@jj/proto-ui";
import { routes } from "./routes";

// @adr 005 - unknown URLs land on a real page, not a blank shell
export function NotFound() {
  const { t } = useTranslation();
  return (
    <div data-testid="not-found">
      <h2 data-testid="not-found-title" style={{ color: tokens.color.fg, fontSize: tokens.font.sizeLg }}>
        {t("notFound.title")}
      </h2>
      <p style={{ color: tokens.color.muted }}>{t("notFound.body")}</p>
      <Link to={routes.home} data-testid="not-found-home" style={{ color: tokens.color.primary }}>
        {t("notFound.home")}
      </Link>
    </div>
  );
}
