"use client";

import { useCallback, useEffect, useState } from "react";

type State<T> = { data: T | null; error: string; loading: boolean };

/** One small GET per screen; the browser never downloads the whole CRM workspace. */
export function useFieldData<T>(url: string) {
  const [state, setState] = useState<State<T>>({ data: null, error: "", loading: true });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, error: "", loading: true }));
    try {
      const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      if (response.status === 401) {
        window.location.href = "/";
        return;
      }
      const body = (await response.json().catch(() => null)) as { data?: T; errors?: { message?: string }[] } | null;
      if (!response.ok || !body?.data) {
        setState({ data: null, error: body?.errors?.[0]?.message || "Не удалось загрузить данные.", loading: false });
        return;
      }
      setState({ data: body.data, error: "", loading: false });
    } catch {
      setState((current) => ({ ...current, error: "Нет связи. Проверьте интернет и повторите.", loading: false }));
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}

export function formatVisit(value: string) {
  if (!value) return "Время не назначено";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
