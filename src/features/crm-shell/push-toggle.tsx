"use client";

import { useCallback, useEffect, useState } from "react";
import { BellIcon, BellOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PushStatus = "loading" | "unavailable" | "unsupported" | "ios_install" | "denied" | "on" | "off";

type RolanPush = {
  status: () => Promise<PushStatus>;
  enable: () => Promise<PushStatus>;
  disable: () => Promise<PushStatus>;
  test: () => Promise<boolean>;
};

declare global {
  interface Window {
    RolanPush?: RolanPush;
  }
}

function loadPushClient() {
  return new Promise<RolanPush | null>((resolve) => {
    if (window.RolanPush) return resolve(window.RolanPush);
    let script = document.querySelector<HTMLScriptElement>('script[data-rolan-push]');
    if (!script) {
      script = document.createElement("script");
      script.src = "/push-client.js";
      script.async = true;
      script.dataset.rolanPush = "1";
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve(window.RolanPush ?? null), { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });
  });
}

const HINTS: Partial<Record<PushStatus, string>> = {
  ios_install: "На iPhone: «Поделиться» → «На экран Домой», откройте RolanPRO с экрана и включите здесь.",
  denied: "Уведомления запрещены в настройках телефона или браузера.",
  unsupported: "Этот браузер не принимает уведомления.",
};

/** «Уведомления на телефон» in the sidebar: shown once the server has push keys. */
export function PushToggle({ className }: { className?: string }) {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadPushClient().then((client) => (client ? client.status() : "unsupported")).then((next) => {
      if (alive) setStatus(next as PushStatus);
    });
    return () => {
      alive = false;
    };
  }, []);

  const act = useCallback((action: "enable" | "disable" | "test") => {
    const client = window.RolanPush;
    if (!client || busy) return;
    setBusy(true);
    setNote(null);
    // enable() asks the browser for permission, so it runs straight from the click.
    const run = action === "test"
      ? client.test().then((ok) => {
          setNote(ok ? "Проверочное уведомление отправлено." : "Проверка не ушла, попробуйте через минуту.");
          return status;
        })
      : client[action]();
    run
      .then((next) => setStatus(next))
      .catch(() => setNote("Не получилось включить уведомления."))
      .finally(() => setBusy(false));
  }, [busy, status]);

  if (status === "loading" || status === "unavailable") return null;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {status === "on" ? (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => act("test")}>
            <BellIcon />
            Проверить пуш
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => act("disable")} aria-label="Выключить уведомления на этом устройстве">
            <BellOffIcon />
          </Button>
        </div>
      ) : status === "off" ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => act("enable")}>
          <BellIcon />
          Уведомления на телефон
        </Button>
      ) : (
        <p className="text-muted-foreground text-xs">{HINTS[status]}</p>
      )}
      {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
    </div>
  );
}
