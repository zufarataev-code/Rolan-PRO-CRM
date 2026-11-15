"use client";

import { FormEvent, useEffect, useState } from "react";

import styles from "./auth-card.module.css";
import {
  PasskeyClientError,
  devicePasskeyAvailable,
  enablePasskeyOnThisDevice,
  passkeysSupported,
  readPasskeyOffer,
  signInWithPasskey,
  writePasskeyOffer,
} from "./auth-passkey-client";
import { AuthPasswordField } from "./auth-password-field";
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

function loginErrorMessage(status: number, serverMessage?: string) {
  if (status === 401) {
    return "Неверный email или пароль. Если пароль меняли на другом устройстве, введите новый и проверьте, не подставил ли браузер старый сохранённый пароль.";
  }
  if (status === 403) {
    return "У этого сотрудника нет активной роли. Обратитесь к владельцу.";
  }
  return serverMessage || "Не удалось войти.";
}

export function AuthLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [passkeyReady, setPasskeyReady] = useState(false);
  // After a password login on a device that can do Face ID / Touch ID we
  // pause once on this card and offer to enable it before entering the CRM.
  const [offerDestination, setOfferDestination] = useState<string | null>(null);

  useEffect(() => {
    setPasskeyReady(passkeysSupported());
  }, []);

  async function passkeyLogin() {
    setError("");
    setPending(true);
    try {
      const user = await signInWithPasskey();
      queueInstallOnboarding();
      window.location.assign(user.must_change_password ? "/change-password" : destinationForRoles(user.roles ?? []));
    } catch (caught) {
      setError(caught instanceof PasskeyClientError ? caught.message : "Не удалось войти по Face ID.");
      setPending(false);
    }
  }

  async function enablePasskey() {
    if (!offerDestination) return;
    setError("");
    setPending(true);
    try {
      await enablePasskeyOnThisDevice();
      window.location.assign(offerDestination);
    } catch (caught) {
      setError(caught instanceof PasskeyClientError ? caught.message : "Не удалось включить Face ID.");
      setPending(false);
    }
  }

  function skipPasskey(never: boolean) {
    if (!offerDestination) return;
    if (never) writePasskeyOffer("never");
    window.location.assign(offerDestination);
  }

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
        setError(loginErrorMessage(response.status, payload.errors?.[0]?.message));
        return;
      }

      queueInstallOnboarding();
      if (payload.data?.user?.must_change_password) {
        window.location.assign("/change-password");
        return;
      }

      const destination = destinationForRoles(payload.data?.user?.roles ?? []);
      if (readPasskeyOffer() === null && (await devicePasskeyAvailable())) {
        setPassword("");
        setOfferDestination(destination);
        return;
      }
      window.location.assign(destination);
    } catch {
      setError("Сервер недоступен. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  if (offerDestination) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <h1 className={styles.brand}>Вход по Face ID</h1>
          <p className={styles.subtitle}>
            Включить на этом устройстве вход по Face ID / Touch ID? В следующий раз пароль вводить не придётся, даже если
            вы смените его на другом устройстве.
          </p>
          <div className={styles.form}>
            {error ? <p className={styles.error}>{error}</p> : null}
            <button className={styles.button} disabled={pending} onClick={enablePasskey} type="button">
              {pending ? "Включаем…" : "Включить Face ID / Touch ID"}
            </button>
            <button className={styles.buttonSecondary} disabled={pending} onClick={() => skipPasskey(false)} type="button">
              Не сейчас
            </button>
            <button className={styles.linkButton} disabled={pending} onClick={() => skipPasskey(true)} type="button">
              Больше не предлагать на этом устройстве
            </button>
          </div>
          <p className={styles.hint}>Отключить можно в любой момент: страница «Вход по Face ID» по адресу /passkeys.</p>
        </section>
      </main>
    );
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
            <AuthPasswordField
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
          {passkeyReady ? (
            <button className={styles.buttonSecondary} disabled={pending} onClick={passkeyLogin} type="button">
              Войти по Face ID / Touch ID
            </button>
          ) : null}
        </form>
        <p className={styles.hint}>CRM работает с сервера. Скачивать HTML-файл на телефон для входа не нужно.</p>
      </section>
    </main>
  );
}
