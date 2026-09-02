import type { ReactNode } from "react";

import { ProductShell, type ProductNavGroup } from "@/components/product-shell";

type InstallerShellProps = {
  title: string;
  subtitle: string;
  kicker: string;
  actions?: ReactNode;
  children: ReactNode;
  activeHref?: string;
};

const navGroups: ProductNavGroup[] = [
  {
    label: "Сегодня",
    items: [
      { href: "/legacy-crm/installer", label: "Рабочий день" },
      { href: "/legacy-crm/installer/jobs", label: "Мои монтажи" },
      { href: "/legacy-crm/installer/notifications", label: "Уведомления" },
    ],
  },
];

export function InstallerShell({
  title,
  subtitle,
  kicker,
  actions,
  children,
  activeHref,
}: InstallerShellProps) {
  return (
    <ProductShell
      roleLabel="Монтажник"
      homeHref="/legacy-crm/installer"
      navGroups={navGroups}
      title={title}
      subtitle={subtitle}
      kicker={kicker}
      actions={actions}
      activeHref={activeHref}
      canonicalCrm
    >
      {children}
    </ProductShell>
  );
}
