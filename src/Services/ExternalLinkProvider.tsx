import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface PendingLink {
  url: string;
  label: string;
}

interface ExternalLinkValue {
  pending: PendingLink | null;
  /** Queues an outbound link for confirmation by <AppModal />. */
  request: (url: string, label: string) => void;
  clear: () => void;
}

const ExternalLinkContext = createContext<ExternalLinkValue>({
  pending: null,
  request: () => {},
  clear: () => {},
});

export function ExternalLinkProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingLink | null>(null);

  const request = useCallback((url: string, label: string) => setPending({ url, label }), []);
  const clear = useCallback(() => setPending(null), []);

  const value = useMemo<ExternalLinkValue>(() => ({ pending, request, clear }), [pending, request, clear]);

  return <ExternalLinkContext.Provider value={value}>{children}</ExternalLinkContext.Provider>;
}

export const useExternalLink = (): ExternalLinkValue => useContext(ExternalLinkContext);
