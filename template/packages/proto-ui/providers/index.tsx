import { createContext, useContext, type ReactNode } from "react";

// @adr 021 - provider fallback (own | radix)
// Provider selector (BR-11): primitives can sit on their own accessible
// implementation ("own") or on Radix headless primitives ("radix"). The same
// component API and the same tests must pass under both.
export type ProviderKind = "own" | "radix";

const ProviderContext = createContext<ProviderKind>("own");

export function ProtoUIProvider({
  provider = "own",
  children,
}: {
  provider?: ProviderKind;
  children: ReactNode;
}) {
  return <ProviderContext.Provider value={provider}>{children}</ProviderContext.Provider>;
}

export const useProviderKind = (): ProviderKind => useContext(ProviderContext);
