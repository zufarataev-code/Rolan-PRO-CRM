import type { ReactNode } from "react";

type ManagerShellProps = {
  title: string;
  subtitle: string;
  kicker: string;
  actions?: ReactNode;
  children: ReactNode;
  activeHref?: string;
};

/**
 * Compatibility wrapper only.
 *
 * `/legacy-crm` is the single visible ROLANPRO CRM shell. Historical manager
 * pages may still import this component while their server/API functionality is
 * consolidated, but this wrapper must never render a second navigation/header
 * around that content.
 */
export function ManagerShell({ children }: ManagerShellProps) {
  return <>{children}</>;
}
