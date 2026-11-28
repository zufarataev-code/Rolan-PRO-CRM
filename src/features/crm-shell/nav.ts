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
  /** A section of the working CRM shown inside the new frame until it is redrawn. */
  section?: string;
  ownerOnly?: boolean;
};

export type CrmNavGroup = { title: string; items: CrmNavItem[] };

/** A working section inside the new frame: /crm/section/<key>. */
const section = (title: string, key: string, icon: LucideIcon, ownerOnly = false): CrmNavItem => ({ title, href: `/crm/section/${key}`, icon, section: key, ownerOnly });

/** Sections the working CRM opens by an address of their own rather than #/section/<key>. */
const OWN_ADDRESS: Record<string, string> = { servicePricing: "#/service-pricing", installerOps: "#/installer-operations" };

/** One menu for every screen — the same sections the working CRM has, in the same order. */
export const CRM_NAV: CrmNavGroup[] = [
  {
    title: "Главное",
    items: [
      { title: "Главная", href: "/crm", icon: LayoutDashboardIcon },
      { title: "Проекты", href: "/crm/projects", icon: KanbanSquareIcon },
    ],
  },
  {
    title: "Продажи",
    items: [
      { title: "Новые лиды", href: "/crm/leads", icon: InboxIcon },
      section("Холодные звонки", "coldcalls", PhoneCallIcon),
      section("КП", "proposals", FileTextIcon),
      { title: "Клиенты", href: "/crm/clients", icon: UsersIcon },
      section("Выполненные проекты", "quickEntry", ZapIcon),
    ],
  },
  {
    title: "Работа",
    items: [
      { title: "Календарь", href: "/crm/calendar", icon: CalendarDaysIcon },
      { title: "Задачи", href: "/crm/tasks", icon: CheckSquareIcon },
      section("Монтажники сейчас", "installerOps", MapPinIcon),
      { title: "Склад", href: "/crm/inventory", icon: BoxesIcon },
    ],
  },
  {
    title: "Деньги",
    items: [
      section("Услуги и цены", "servicePricing", TagsIcon),
      section("Ставки и расходы", "ratesCosts", ReceiptTextIcon, true),
      section("Ожидают оплаты", "paymentsdue", HandCoinsIcon, true),
      section("Деньги", "accounting", CircleDollarSignIcon, true),
      section("Зарплата", "payroll", BanknoteIcon),
      section("Отчёты", "reports", BarChart3Icon),
    ],
  },
  {
    title: "Компания",
    items: [
      section("Команда", "team", UsersRoundIcon, true),
      section("Академия", "academy", GraduationCapIcon),
      section("Рефералы", "referrals", GiftIcon),
      section("Отзывы", "reviews", StarIcon),
      section("Настройки", "settings", SettingsIcon, true),
    ],
  },
];

const ALL_ITEMS = CRM_NAV.flatMap((group) => group.items);

/** Working screens that stay reachable by address after their section was redrawn. */
const KEPT: Record<string, string> = { orders: "Проекты", leads: "Новые лиды", calendar: "Календарь", clients: "Клиенты", tasks: "Задачи", inventory: "Склад" };

/** Sections the new interface asks the working CRM to open by #/section/<key>, and who may open them. */
export const CRM_LEGACY_SECTIONS = [...ALL_ITEMS.filter((item) => item.section), ...Object.keys(KEPT).map((key) => ({ section: key, ownerOnly: false }))]
  .filter((item) => !OWN_ADDRESS[item.section ?? ""])
  .map((item) => ({ key: item.section ?? "", ownerOnly: Boolean(item.ownerOnly) }));

/** The working CRM address for a section; null when there is no such section or this role may not open it. */
export function crmSectionSrc(key: string, role: "owner" | "manager") {
  const item = KEPT[key] ? { title: KEPT[key], ownerOnly: false } : ALL_ITEMS.find((entry) => entry.section === key);
  if (!item || (item.ownerOnly && role !== "owner")) return null;
  return { title: item.title, src: `/legacy-crm${OWN_ADDRESS[key] ?? `#/section/${key}`}` };
}

export function crmNavFor(role: "owner" | "manager" | undefined): CrmNavGroup[] {
  return CRM_NAV.map((group) => ({ ...group, items: group.items.filter((item) => !item.ownerOnly || role === "owner") })).filter(
    (group) => group.items.length,
  );
}

export function crmNavActive(pathname: string, href: string) {
  if (href === "/crm") return pathname === "/crm";
  return pathname === href || pathname.startsWith(`${href}/`);
}
