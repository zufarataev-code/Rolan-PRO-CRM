"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";

import styles from "@/components/marketing/landing.module.css";

const STORAGE_KEY = "rolan-pro-mascot-help-dismissed-v2";

export type MascotPromoCopy = {
  ariaLabel: string;
  closeLabel: string;
  label: string;
  message: string;
};

type MascotPromoProps = {
  copy: MascotPromoCopy;
  accentColor?: string;
  accentSoft?: string;
  badgeText?: string;
  href?: string;
  onActivate?: () => void;
};

export function MascotPromo({
  copy,
  accentColor = "#4cb8dd",
  accentSoft = "rgba(76, 184, 221, 0.16)",
  badgeText,
  href = "#lead-form",
  onActivate,
}: MascotPromoProps) {
  const [visible, setVisible] = useState(false);

  const themeStyle = {
    "--mascot-accent": accentColor,
    "--mascot-accent-soft": accentSoft,
  } as CSSProperties;

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) === "1") {
      return;
    }

    if (!window.matchMedia("(min-width: 981px)").matches) {
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), 2200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) {
    return null;
  }

  function closePromo() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  function handleActivate() {
    onActivate?.();
  }

  return (
    <aside className={styles.mascotPromo} aria-label={copy.ariaLabel} style={themeStyle}>
      <button className={styles.mascotClose} onClick={closePromo} type="button" aria-label={copy.closeLabel}>
        x
      </button>

      <a
        className={styles.mascotLink}
        href={href}
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          handleActivate();
        }}
      >
        <div className={styles.mascotBubble}>
          <span>{copy.label}</span>
          {copy.message}
          {badgeText ? <strong className={styles.mascotBadge}>{badgeText}</strong> : null}
        </div>
        <img
          className={styles.mascotImage}
          src="/landing/rolan-mascot.webp"
          alt="Rolan Pro mascot"
          width="116"
          height="144"
        />
      </a>
    </aside>
  );
}
