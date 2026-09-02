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
      { href: "/installer/today", label: "Рабочий день" },
      { href: "/installer/jobs", label: "Мои монтажи" },
      { href: "/notifications", label: "Уведомления" },
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
      homeHref="/installer/today"
      navGroups={navGroups}
      title={title}
      subtitle={subtitle}
      kicker={kicker}
      actions={actions}
      activeHref={activeHref}
    >
      {children}
    </ProductShell>
  );
}
