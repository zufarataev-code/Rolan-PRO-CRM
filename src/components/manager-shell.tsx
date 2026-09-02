import type { ReactNode } from "react";

import { ProductShell, type ProductNavGroup } from "@/components/product-shell";

type ManagerShellProps = {
  title: string;
  subtitle: string;
  kicker: string;
  actions?: ReactNode;
  children: ReactNode;
  activeHref?: string;
};

const navGroups: ProductNavGroup[] = [
  {
    label: "Работа",
    items: [
      { href: "/manager", label: "Обзор" },
      { href: "/manager/crm/pipeline", label: "Продажи" },
      { href: "/manager/calendar", label: "Расписание" },
      { href: "/manager/projects", label: "Проекты" },
      { href: "/manager/installers", label: "Монтажники" },
    ],
  },
  {
    label: "Клиенты",
    items: [
      { href: "/manager/crm/leads", label: "Новые лиды" },
      { href: "/manager/crm/clients", label: "База клиентов" },
      { href: "/manager/crm/consultations", label: "Замеры" },
      { href: "/manager/crm/proposals", label: "Предложения" },
    ],
  },
  {
    label: "Инструменты",
    items: [
      { href: "/manager/crm/calculator", label: "Калькулятор" },
      { href: "/manager/crm/pricing", label: "Услуги и цены" },
    ],
  },
];

export function ManagerShell({
  title,
  subtitle,
  kicker,
  actions,
  children,
  activeHref,
}: ManagerShellProps) {
  return (
    <ProductShell
      roleLabel="Менеджер"
      homeHref="/manager"
      navGroups={navGroups}
      title={title}
      subtitle={subtitle}
      kicker={kicker}
      actions={actions}
      activeHref={activeHref}
      createHref="/manager/crm/leads"
      createLabel="Новый лид"
    >
      {children}
    </ProductShell>
  );
}
