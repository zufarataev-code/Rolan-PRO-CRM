import type { ReactNode } from "react";

import { ProductShell, type ProductNavGroup } from "@/components/product-shell";

type OwnerShellProps = {
  title: string;
  subtitle: string;
  kicker: string;
  actions?: ReactNode;
  children: ReactNode;
  activeHref?: string;
};

const navGroups: ProductNavGroup[] = [
  {
    label: "Управление",
    items: [
      { href: "/owner", label: "Обзор" },
      { href: "/owner/finance", label: "Финансы" },
      { href: "/owner/projects", label: "Проекты" },
      { href: "/manager/installers", label: "Монтажники" },
    ],
  },
  {
    label: "Аналитика",
    items: [{ href: "/owner/finance/services", label: "Прибыль по услугам" }],
  },
  {
    label: "Система",
    items: [
      { href: "/owner/settings/pricing", label: "Услуги и цены" },
      { href: "/owner/settings", label: "Настройки" },
      { href: "/manager", label: "Кабинет менеджера" },
    ],
  },
];

export function OwnerShell({ title, subtitle, kicker, actions, children, activeHref }: OwnerShellProps) {
  return (
    <ProductShell
      roleLabel="Владелец"
      homeHref="/owner"
      navGroups={navGroups}
      title={title}
      subtitle={subtitle}
      kicker={kicker}
      actions={actions}
      activeHref={activeHref}
      createHref="/manager/crm/leads"
      createLabel="Новый заказ"
    >
      {children}
    </ProductShell>
  );
}
