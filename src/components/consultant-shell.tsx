import type { ReactNode } from "react";

import { ProductShell, type ProductNavGroup } from "@/components/product-shell";

type ConsultantShellProps = {
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
      { href: "/legacy-crm/survey", label: "Мои выезды" },
      { href: "/legacy-crm/survey/notifications", label: "Уведомления" },
    ],
  },
];

export function ConsultantShell({
  title,
  subtitle,
  kicker,
  actions,
  children,
  activeHref,
}: ConsultantShellProps) {
  return (
    <ProductShell
      roleLabel="Замерщик"
      homeHref="/legacy-crm/survey"
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
