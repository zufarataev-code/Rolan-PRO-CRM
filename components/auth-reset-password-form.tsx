"use client";

import { FormEvent, useState } from "react";

import styles from "./auth-card.module.css";

type ApiResponse = {
  data?: { email?: string; message?: string };
  errors?: Array<{ message?: string }>;
};

export function AuthResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!token) {
      setError("Ссылка восстановления неполная. Запросите новую ссылку.");
      return;
    }
    if (password.length < 10) {
      setError("Пароль должен быть не короче 10 символов.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json() as ApiResponse;
      if (!response.ok) {
        setError(payload.errors?.[0]?.message || "Не удалось изменить пароль.");
        return;
      }
      setPassword("");
      setConfirmPassword("");
      setMessage(payload.data?.message || "Пароль изменён. Теперь можно войти в CRM.");
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
        <p className={styles.subtitle}>Создайте новый пароль для входа в ROLANPRO CRM.</p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.label}>
            Новый пароль
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={10}
              required
            />
          </label>
          <label className={styles.label}>
            Повторите пароль
            <input
              className={styles.input}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={10}
              required
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          {message ? <p className={styles.success}>{message}</p> : null}
          <button className={styles.button} disabled={pending || !token} type="submit">
            {pending ? "Сохраняем…" : "Сохранить новый пароль"}
          </button>
        </form>
        <div className={styles.actions}>
          <a className={styles.link} href="/login">Перейти ко входу</a>
          {!token ? <a className={styles.link} href="/forgot-password">Запросить новую ссылку</a> : null}
        </div>
      </section>
    </main>
  );
}
