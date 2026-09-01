"use client";

import { FormEvent, useState } from "react";

import styles from "./auth-card.module.css";

type ApiResponse = {
  data?: { message?: string };
  errors?: Array<{ message?: string }>;
};

export function AuthForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setPending(true);

    try {
      const response = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json() as ApiResponse;
      if (!response.ok) {
        setError(payload.errors?.[0]?.message || "Не удалось отправить ссылку восстановления.");
        return;
      }
      setMessage(payload.data?.message || "Проверьте почту.");
    } catch {
      setError("Сервер недоступен. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <h1 className={styles.brand}>Восстановление пароля</h1>
        <p className={styles.subtitle}>Введите рабочий email сотрудника. CRM отправит безопасную ссылку для создания нового пароля.</p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.label}>
            Email
            <input
              className={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
          {message ? <p className={styles.success}>{message}</p> : null}
          <button className={styles.button} disabled={pending} type="submit">
            {pending ? "Отправляем…" : "Отправить ссылку"}
          </button>
        </form>
        <div className={styles.actions}>
          <a className={styles.link} href="/login">← Вернуться ко входу</a>
        </div>
      </section>
    </main>
  );
}
