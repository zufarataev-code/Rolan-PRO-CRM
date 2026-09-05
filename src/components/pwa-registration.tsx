"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALL_ONBOARDING_PENDING = "rolanpro:pwa-install-onboarding-pending";
const INSTALL_ONBOARDING_SEEN = "rolanpro:pwa-install-onboarding-seen";

function isStandalone() {
  return Boolean(
    window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone,
  );
}

function isAuthenticatedWorkspace(pathname: string) {
  return (
    pathname === "/legacy-crm" ||
    pathname.startsWith("/owner") ||
    pathname.startsWith("/manager") ||
    pathname.startsWith("/survey") ||
    pathname.startsWith("/installer")
  );
}

function markOnboardingSeen() {
  try {
    window.localStorage.setItem(INSTALL_ONBOARDING_SEEN, "1");
    window.localStorage.removeItem(INSTALL_ONBOARDING_PENDING);
  } catch {
    // Storage can be unavailable in private/restricted browser modes.
  }
}

export function PwaRegistration() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [iosInstructions, setIosInstructions] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
    }

    const maybeShowOnboarding = () => {
      if (isStandalone() || !isAuthenticatedWorkspace(window.location.pathname)) return;

      try {
        const pending = window.localStorage.getItem(INSTALL_ONBOARDING_PENDING) === "1";
        const seen = window.localStorage.getItem(INSTALL_ONBOARDING_SEEN) === "1";
        if (pending && !seen) setShowOnboarding(true);
      } catch {
        // Do not interrupt CRM work if storage is unavailable.
      }
    };

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      maybeShowOnboarding();
    };
    const onInstalled = () => {
      setPrompt(null);
      setShowOnboarding(false);
      markOnboardingSeen();
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    maybeShowOnboarding();

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!showOnboarding) return null;

  const dismiss = () => {
    markOnboardingSeen();
    setShowOnboarding(false);
  };

  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        markOnboardingSeen();
        setShowOnboarding(false);
      } else {
        dismiss();
      }
      setPrompt(null);
      return;
    }

    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      setIosInstructions(true);
      return;
    }

    dismiss();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Установка Rolan PRO"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483640,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "rgba(15,23,42,.42)",
      }}
    >
      <section
        style={{
          width: "min(420px, 100%)",
          borderRadius: 18,
          background: "#fff",
          padding: 22,
          boxShadow: "0 24px 70px rgba(15,23,42,.28)",
          fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
          color: "#0f172a",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: "#2563eb", marginBottom: 8 }}>
          ROLAN PRO
        </div>
        <h2 style={{ margin: 0, fontSize: 22 }}>Добавить CRM на телефон?</h2>
        {iosInstructions ? (
          <p style={{ margin: "12px 0 0", lineHeight: 1.55, color: "#475569" }}>
            На iPhone нажмите «Поделиться» в Safari → «На экран Домой» → «Добавить».
          </p>
        ) : (
          <p style={{ margin: "12px 0 0", lineHeight: 1.55, color: "#475569" }}>
            Это одноразовое предложение при первом входе. В самой CRM отдельной кнопки установки больше не будет.
          </p>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          {!iosInstructions ? (
            <button
              type="button"
              onClick={install}
              style={{
                minHeight: 44,
                padding: "0 16px",
                border: 0,
                borderRadius: 10,
                background: "#2563eb",
                color: "#fff",
                fontWeight: 800,
              }}
            >
              Установить
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            style={{
              minHeight: 44,
              padding: "0 16px",
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              background: "#fff",
              color: "#334155",
              fontWeight: 700,
            }}
          >
            {iosInstructions ? "Понятно" : "Не сейчас"}
          </button>
        </div>
      </section>
    </div>
  );
}
