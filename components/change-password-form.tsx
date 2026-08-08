"use client";

import { FormEvent, useState } from "react";

import styles from "./auth-card.module.css";

export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmation) {
      setError("Пароли не совпадают.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.errors?.[0]?.message || "Не удалось изменить пароль.");
        return;
      }

      window.location.assign("/legacy-crm");
    } catch {
      setError("Сервер недоступен. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <h1 className={styles.brand}>Новый пароль</h1>
        <p className={styles.subtitle}>Минимум 12 символов. Не используйте старый PIN.</p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.label}>
            Новый пароль
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label className={styles.label}>
            Повторите пароль
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button className={styles.button} disabled={pending} type="submit">
            {pending ? "Сохраняем…" : "Сохранить пароль"}
          </button>
        </form>
      </section>
    </main>
  );
}
