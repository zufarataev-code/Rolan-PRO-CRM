"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaRegistration() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    setInstalled(Boolean(standalone));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setInstalled(false);
    };
    const onInstalled = () => { setPrompt(null); setInstalled(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const hiddenRoute = typeof window !== "undefined" && ["/proposal/", "/privacy-policy", "/terms", "/sms-consent"].some((path) => window.location.pathname.startsWith(path));
  if (installed || hiddenRoute) return null;

  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    window.alert(ios
      ? "Нажмите «Поделиться» в Safari → «На экран Домой» → «Добавить»."
      : "Откройте меню браузера и выберите «Установить Rolan PRO CRM» или «Добавить на главный экран».");
  };

  return (
    <button
      type="button"
      onClick={install}
      style={{ position: "fixed", right: 18, bottom: 18, zIndex: 1000, minHeight: 44, padding: "0 16px", border: "1px solid #bfdbfe", borderRadius: 6, background: "#fff", color: "#1d4ed8", boxShadow: "0 12px 30px rgba(15,23,42,.18)", fontWeight: 800 }}
    >
      ⬇ Установить Rolan PRO
    </button>
  );
}
