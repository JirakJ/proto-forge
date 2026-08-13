import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, tokens } from "@jj/proto-ui";

// @adr 006 - crash containment at the shell boundary
// A render crash below this boundary shows a recoverable, announced fallback
// instead of a blank page. Class component because React exposes no hook form.

function Fallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" data-testid="error-boundary" style={{ padding: tokens.space.lg }}>
      <h2 data-testid="error-boundary-title" style={{ color: tokens.color.fg, fontSize: tokens.font.sizeLg }}>
        {t("app.error.title")}
      </h2>
      <p style={{ color: tokens.color.muted }}>{t("app.error.body")}</p>
      <Button data-testid="error-retry" onClick={onRetry}>
        {t("app.error.retry")}
      </Button>
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  reset = () => this.setState({ failed: false });

  render() {
    return this.state.failed ? <Fallback onRetry={this.reset} /> : this.props.children;
  }
}
