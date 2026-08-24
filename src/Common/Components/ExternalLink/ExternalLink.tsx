import type { ReactNode } from "react";
import { useExternalLink } from "../../../Services/ExternalLinkProvider";

export interface ExternalLinkProps {
  href: string;
  label: string;
  className?: string;
  children?: ReactNode;
}

/**
 * An outbound link routed through the confirm-before-leaving dialog. The real href stays on the
 * element so hover, copy and open-in-new-tab behave normally; only the plain click is intercepted.
 */
export default function ExternalLink({ href, label, className, children }: ExternalLinkProps) {
  const { request } = useExternalLink();

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        request(href, label);
      }}
    >
      {children}
    </a>
  );
}
