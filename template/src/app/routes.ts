// Single source of the route table (BRS §12.3). No second definition may exist.
export const routes = {
  home: "/",
} as const;

export type RouteKey = keyof typeof routes;
