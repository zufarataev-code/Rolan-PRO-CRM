"use client";

import { FormEvent, useState } from "react";

import styles from "./auth-card.module.css";
import { destinationForRoles } from "@/lib/auth/destination";

const INSTALL_ONBOARDING_PENDING = "rolanpro:pwa-install-onboarding-pending";
const INSTALL_ONBOARDING_SEEN = "rolanpro:pwa-install-onboarding-seen";

type LoginResponse = {
  data?: {
    user?: {
      must_change_password?: boolean;
      roles?: string[];
    };
  };
  errors?: Array<{ message?: string }>;
};

function queueInstallOnboarding() {
  try {
    if (window.localStorage.getItem(INSTALL_ONBOARDING_SEEN) !== "1") {
      window.localStorage.setItem(INSTALL_ONBOARDING_PENDING, "1");
    }
  } catch {
    // Login must never fail because browser storage is unavailable.
  }
}

export function AuthLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as LoginResponse;

      if (!response.ok) {
        setError(payload.errors?.[0]?.message || "Не удалось войти.");
        return;
      }

      queueInstallOnboarding();
      window.location.assign(
        payload.data?.user?.must_change_password
          ? "/change-password"
          : destinationForRoles(payload.data?.user?.roles ?? []),
      );
    } catch {
      setError("Сервер недоступен. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <h1 className={styles.brand}>ROLANPRO CRM</h1>
        <p className={styles.subtitle}>Единый вход для команды</p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.label}>
            Email
            <input
              className={styles.input}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className={styles.label}>
            Пароль
            <input
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <div className={styles.formLinkRow}>
            <a className={styles.link} href="/forgot-password">Забыли пароль?</a>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button className={styles.button} disabled={pending} type="submit">
            {pending ? "Входим…" : "Войти"}
          </button>
        </form>
        <p className={styles.hint}>CRM работает с сервера. Скачивать HTML-файл на телефон для входа не нужно.</p>
      </section>
    </main>
  );
}
