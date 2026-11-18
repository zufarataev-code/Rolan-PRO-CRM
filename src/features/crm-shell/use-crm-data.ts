"use client";

import { useCallback, useEffect, useState } from "react";

type State<T> = { data: T | null; error: string; loading: boolean };

/** One small GET per screen: the browser receives the ready model, not the whole workspace. */
export function useCrmData<T>(path: string, options: { pollMs?: number } = {}) {
  const pollMs = options.pollMs ?? 0;
  const [state, setState] = useState<State<T>>({ data: null, error: "", loading: true });

  const load = useCallback(async (quiet = false) => {
    // A background refresh keeps what is on the screen until the new answer arrives.
    if (!quiet) setState((current) => ({ ...current, error: "", loading: true }));
    try {
      // Dates and month borders are computed for the time zone of this device, as in the working CRM.
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      const response = await fetch(`${path}?tz=${encodeURIComponent(zone)}`, { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      const body = (await response.json().catch(() => null)) as { data?: T; errors?: { message?: string }[] } | null;
      if (!response.ok || !body?.data) {
        if (quiet) return;
        setState({ data: null, error: body?.errors?.[0]?.message || "Не удалось загрузить данные.", loading: false });
        return;
      }
      setState({ data: body.data, error: "", loading: false });
    } catch {
      if (quiet) return;
      setState((current) => ({ ...current, error: "Нет связи. Проверьте интернет и повторите.", loading: false }));
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  // A screen people keep open while waiting (new leads) refreshes itself while it is visible.
  useEffect(() => {
    if (!pollMs) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [load, pollMs]);

  const reload = useCallback(() => load(false), [load]);
  return { ...state, reload };
}
