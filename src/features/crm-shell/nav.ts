import type { LucideIcon } from "lucide-react";
import {
  BanknoteIcon,
  BarChart3Icon,
  BoxesIcon,
  CalendarDaysIcon,
  CheckSquareIcon,
  CircleDollarSignIcon,
  FileTextIcon,
  GiftIcon,
  GraduationCapIcon,
  HandCoinsIcon,
  InboxIcon,
  KanbanSquareIcon,
  LayoutDashboardIcon,
  MapPinIcon,
  PhoneCallIcon,
  ReceiptTextIcon,
  SettingsIcon,
  StarIcon,
  TagsIcon,
  UsersIcon,
  UsersRoundIcon,
  ZapIcon,
} from "lucide-react";

export type CrmNavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Already drawn by the new template; the rest still open in the working CRM. */
  ready?: boolean;
  ownerOnly?: boolean;
};

export type CrmNavGroup = { title: string; items: CrmNavItem[] };

/** A section of the working CRM, opened by its address (see parseHash in the CRM). */
const section = (key: string) => `/legacy-crm#/section/${key}`;

/** One menu for every screen — the same sections the working CRM has, in the same order. */
export const CRM_NAV: CrmNavGroup[] = [
  {
    title: "Главное",
    items: [
      { title: "Главная", href: "/crm", icon: LayoutDashboardIcon, ready: true },
      { title: "Проекты", href: "/crm/projects", icon: KanbanSquareIcon, ready: true },
    ],
  },
  {
    title: "Продажи",
    items: [
      { title: "Новые лиды", href: section("leads"), icon: InboxIcon },
      { title: "Холодные звонки", href: section("coldcalls"), icon: PhoneCallIcon },
      { title: "КП", href: section("proposals"), icon: FileTextIcon },
      { title: "Клиенты", href: section("clients"), icon: UsersIcon },
      { title: "Выполненные проекты", href: section("quickEntry"), icon: ZapIcon },
    ],
  },
  {
    title: "Работа",
    items: [
      { title: "Календарь", href: section("calendar"), icon: CalendarDaysIcon },
      { title: "Задачи", href: section("tasks"), icon: CheckSquareIcon },
      { title: "Монтажники сейчас", href: "/legacy-crm#/installer-operations", icon: MapPinIcon },
      { title: "Склад", href: section("inventory"), icon: BoxesIcon },
    ],
  },
  {
    title: "Деньги",
    items: [
      { title: "Услуги и цены", href: "/legacy-crm#/service-pricing", icon: TagsIcon },
      { title: "Ставки и расходы", href: section("ratesCosts"), icon: ReceiptTextIcon, ownerOnly: true },
      { title: "Ожидают оплаты", href: section("paymentsdue"), icon: HandCoinsIcon, ownerOnly: true },
      { title: "Деньги", href: section("accounting"), icon: CircleDollarSignIcon, ownerOnly: true },
      { title: "Зарплата", href: section("payroll"), icon: BanknoteIcon },
      { title: "Отчёты", href: section("reports"), icon: BarChart3Icon },
    ],
  },
  {
    title: "Компания",
    items: [
      { title: "Команда", href: section("team"), icon: UsersRoundIcon },
      { title: "Академия", href: section("academy"), icon: GraduationCapIcon },
      { title: "Рефералы", href: section("referrals"), icon: GiftIcon },
      { title: "Отзывы", href: section("reviews"), icon: StarIcon },
      { title: "Настройки", href: section("settings"), icon: SettingsIcon, ownerOnly: true },
    ],
  },
];

/** Sections the new menu may open in the working CRM, and who may open them. */
export const CRM_LEGACY_SECTIONS = CRM_NAV.flatMap((group) => group.items)
  .map((item) => ({ key: item.href.match(/#\/section\/(\w+)$/)?.[1] ?? "", ownerOnly: Boolean(item.ownerOnly) }))
  .filter((item) => item.key);

export function crmNavFor(role: "owner" | "manager" | undefined): CrmNavGroup[] {
  return CRM_NAV.map((group) => ({ ...group, items: group.items.filter((item) => !item.ownerOnly || role === "owner") })).filter(
    (group) => group.items.length,
  );
}

export function crmNavActive(pathname: string, href: string) {
  if (href === "/crm") return pathname === "/crm";
  return pathname === href || pathname.startsWith(`${href}/`);
}
