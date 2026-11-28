"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CalendarDaysIcon, KanbanSquareIcon, LayoutDashboardIcon, MenuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { CrmAiAgent } from "@/features/crm-shell/ai-agent";
import { crmNavActive, crmNavFor, crmSectionSrc, type CrmNavItem } from "@/features/crm-shell/nav";
import { allFramesSaved, signedOut } from "@/features/crm-shell/logout";
import { saveWorkingFrame, WorkingSections } from "@/features/crm-shell/working-frame";
import { PushToggle } from "@/features/crm-shell/push-toggle";

type Role = "owner" | "manager";

const RoleContext = createContext<Role>("manager");
/** The signed-in office role, for screens that differ between the owner and a manager. */
export const useCrmRole = () => useContext(RoleContext);

/**
 * /crm is now where the owner and managers land after signing in, so it has its
 * own «Выйти». Edits still waiting in the working CRM frame are confirmed first.
 */
function LogoutButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const leave = async () => {
    setBusy(true);
    setProblem(null);
    // An edit the server has not confirmed would be lost with the session: stay signed in.
    if (!(await allFramesSaved(Array.from(document.querySelectorAll("iframe")), saveWorkingFrame))) {
      setProblem("Последние изменения ещё не сохранились. Проверьте связь и нажмите «Выйти» снова.");
      setBusy(false);
      return;
    }
    // Until the server ends the session, going to /login would only look like leaving.
    if (!(await signedOut(() => fetch("/api/v1/auth/logout", { method: "POST" })))) {
      setProblem("Выйти не получилось: сервер не ответил. Нажмите «Выйти» ещё раз.");
      setBusy(false);
      return;
    }
    window.location.assign("/login");
  };
  return (
    <>
      <Button variant="ghost" size="sm" className={className} disabled={busy} onClick={leave}>
        {busy ? "Выхожу…" : "Выйти"}
      </Button>
      {problem ? (
        <p role="alert" className="text-destructive px-3 text-xs">
          {problem}
        </p>
      ) : null}
    </>
  );
}

/**
 * «Установить на телефон» in the phone menu: the steps for this phone come from
 * public/pwa-install.js. Hidden once the CRM already runs as an installed app.
 */
function InstallAppButton({ onOpen }: { onOpen: () => void }) {
  const [installed, setInstalled] = useState(true);
  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(Boolean(standalone));
  }, []);
  if (installed) return null;
  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={() => {
        onOpen();
        (window as Window & { RolanProInstall?: { open: () => void } }).RolanProInstall?.open();
      }}
    >
      Установить на телефон
    </Button>
  );
}

function NavLink({ item, pathname, onNavigate }: { item: CrmNavItem; pathname: string; onNavigate?: () => void }) {
  const active = crmNavActive(pathname, item.href);
  const Icon = item.icon;
  // Every section opens the same way — inside this frame, whether it is already redrawn or not.
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.title}</span>
    </Link>
  );
}

function NavGroups({ role, pathname, onNavigate }: { role: Role; pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5" aria-label="Разделы CRM">
      {crmNavFor(role).map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <div className="text-muted-foreground px-3 text-[11px] font-semibold tracking-[0.12em] uppercase">{group.title}</div>
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function Logo() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/landing/rolanpro-logo-dark.png" alt="RolanPRO" className="h-8 w-auto" />;
}

/**
 * One frame for every screen of the new interface: the menu on the left on a
 * computer, a top bar with a bottom dock and a slide-out menu on a phone.
 */
export function CrmShell({ role, userName, children }: { role: Role; userName: string; children: ReactNode }) {
  const pathname = usePathname() ?? "/crm";
  const [menuOpen, setMenuOpen] = useState(false);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);

  useEffect(() => setMenuOpen(false), [pathname]);

  const sectionKey = pathname.match(/^\/crm\/section\/(\w+)\/?$/)?.[1] ?? "";
  const section = sectionKey ? crmSectionSrc(sectionKey, role) : null;

  const dock = [
    { title: "Главная", href: "/crm", icon: LayoutDashboardIcon },
    { title: "Проекты", href: "/crm/projects", icon: KanbanSquareIcon },
    { title: "Календарь", href: "/crm/calendar", icon: CalendarDaysIcon },
  ];

  return (
    <RoleContext.Provider value={role}>
    <div ref={setRoot} className="rp-crm bg-background text-foreground min-h-screen font-sans text-sm antialiased">
      <aside className="bg-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b px-5">
          <Link href="/crm" aria-label="На главную">
            <Logo />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavGroups role={role} pathname={pathname} />
        </div>
        <div className="flex flex-col gap-2 border-t p-3">
          <div className="px-2">
            <div className="truncate text-sm font-semibold">{userName || "Сотрудник"}</div>
            <div className="text-muted-foreground text-xs">{role === "owner" ? "Владелец" : "Менеджер"}</div>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="/legacy-crm">Прежний интерфейс</a>
          </Button>
          <PushToggle />
          <LogoutButton />
        </div>
      </aside>

      <header className="bg-card/95 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-3 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon" aria-label="Открыть меню" onClick={() => setMenuOpen(true)}>
          <MenuIcon className="size-5" />
        </Button>
        <Link href="/crm" aria-label="На главную">
          <Logo />
        </Link>
        <span className="text-muted-foreground ml-auto truncate text-xs">{userName}</span>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" container={root} className="w-[86%] max-w-xs gap-0 p-0">
          <SheetHeader className="border-b">
            <SheetTitle>
              <Logo />
            </SheetTitle>
            <SheetDescription>{userName ? `${userName} · ` : ""}{role === "owner" ? "Владелец" : "Менеджер"}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <NavGroups role={role} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          </div>
          <div className="flex flex-col gap-2 border-t p-3">
            <InstallAppButton onOpen={() => setMenuOpen(false)} />
            <Button asChild variant="outline" className="w-full">
              <a href="/legacy-crm">Прежний интерфейс</a>
            </Button>
            <PushToggle />
            <LogoutButton className="w-full" />
          </div>
        </SheetContent>
      </Sheet>

      <WorkingSections src={section?.src ?? null} title={section?.title ?? "Раздел CRM"} visible={Boolean(section)} />
      <CrmAiAgent hidden={Boolean(section)} />

      <div className="lg:pl-64">
        <div className="mx-auto w-full max-w-[1400px] px-3 pt-4 pb-24 sm:px-5 lg:px-8 lg:pt-6 lg:pb-10">{children}</div>
      </div>

      <nav
        className="bg-card/95 fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Быстрый переход"
      >
        {dock.map((item) => {
          const active = crmNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}
            >
              <Icon className="size-5" />
              {item.title}
            </Link>
          );
        })}
        <button type="button" className="text-muted-foreground flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium" onClick={() => setMenuOpen(true)}>
          <MenuIcon className="size-5" />
          Меню
        </button>
      </nav>
    </div>
    </RoleContext.Provider>
  );
}
