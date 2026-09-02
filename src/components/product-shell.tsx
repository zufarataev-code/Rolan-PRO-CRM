import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

import { NotificationsBell } from "@/components/notifications-bell";

export type ProductNavItem = {
  href: string;
  label: string;
};

export type ProductNavGroup = {
  label: string;
  items: ProductNavItem[];
};

type ProductShellProps = {
  roleLabel: string;
  homeHref: string;
  navGroups: ProductNavGroup[];
  title: string;
  subtitle: string;
  kicker: string;
  actions?: ReactNode;
  children: ReactNode;
  activeHref?: string;
  createHref?: string;
  createLabel?: string;
  canonicalCrm?: boolean;
};

export function ProductShell({
  roleLabel,
  homeHref,
  navGroups,
  title,
  subtitle,
  kicker,
  actions,
  children,
  activeHref,
  createHref,
  createLabel = "Создать",
  canonicalCrm = false,
}: ProductShellProps) {
  return (
    <div className={`product-shell${canonicalCrm ? " product-shell-canonical" : ""}`}>
      <aside className="product-sidebar">
        <Link href={homeHref} className="product-brand" aria-label="ROLANPRO — главная">
          {canonicalCrm ? (
            <span className="product-brand-logo-panel">
              <Image src="/landing/rolan-logo.webp" alt="Rolan PRO" width={132} height={42} priority />
            </span>
          ) : (
            <span className="product-brand-mark" aria-hidden="true">R</span>
          )}
          <span className="product-brand-copy">
            <strong>{canonicalCrm ? "Rolan PRO CRM" : "ROLANPRO"}</strong>
            <span>{roleLabel}</span>
          </span>
        </Link>

        {createHref ? (
          <Link href={createHref} className="product-create-button">
            <span aria-hidden="true">+</span>
            {createLabel}
          </Link>
        ) : null}

        <nav className="product-navigation" aria-label={`Навигация: ${roleLabel}`}>
          {navGroups.map((group) => (
            <div key={group.label} className="product-nav-group">
              <div className="product-nav-label">{group.label}</div>
              <div className="product-nav-items">
                {group.items.map((item) => {
                  const isActive = activeHref === item.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`product-nav-link${isActive ? " product-nav-link-active" : ""}`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span className="product-nav-marker" aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="product-role-card">
          <span className="product-role-status" aria-hidden="true" />
          <span>
            <strong>{roleLabel}</strong>
            <small>Единая CRM</small>
          </span>
        </div>
      </aside>

      <main className="product-workspace">
        <header className="product-header">
          <div className="product-header-copy">
            <div className="product-breadcrumb">{kicker}</div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          <div className="product-header-actions">
            <NotificationsBell />
            {actions}
          </div>
        </header>

        <div className="product-content">{children}</div>
      </main>
    </div>
  );
}
