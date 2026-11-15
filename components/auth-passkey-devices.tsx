"use client";

import { useCallback, useEffect, useState } from "react";

import styles from "./auth-card.module.css";
import {
  PasskeyClientError,
  devicePasskeyAvailable,
  enablePasskeyOnThisDevice,
  writePasskeyOffer,
} from "./auth-passkey-client";

type Device = {
  passkey_id: string;
  device_name: string;
  rp_id: string;
  created_at: string;
  last_used_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "ещё не использовался";
  return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

/** The employee's own devices with Face ID / Touch ID sign-in. */
export function AuthPasskeyDevices() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [canEnable, setCanEnable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/auth/passkeys", { cache: "no-store" });
      if (response.status === 401) {
        setSignedOut(true);
        return;
      }
      const payload = (await response.json()) as { data?: { passkeys?: Device[] } };
      setDevices(payload.data?.passkeys ?? []);
    } catch {
      setError("Сервер недоступен. Попробуйте ещё раз.");
    }
  }, []);

  useEffect(() => {
    void load();
    void devicePasskeyAvailable().then(setCanEnable);
  }, [load]);

  async function enable() {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const passkey = await enablePasskeyOnThisDevice();
      setMessage(`Готово: «${passkey.device_name}» теперь входит по Face ID / Touch ID.`);
      await load();
    } catch (caught) {
      setError(caught instanceof PasskeyClientError ? caught.message : "Не удалось включить Face ID.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(device: Device) {
    if (!window.confirm(`Отключить вход по Face ID для «${device.device_name}»?`)) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/auth/passkeys/${device.passkey_id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { errors?: Array<{ message?: string }> };
        setError(payload.errors?.[0]?.message || "Не удалось отключить.");
        return;
      }
      // Let this browser offer Face ID again after the next password login.
      writePasskeyOffer(null);
      setMessage(`«${device.device_name}» отключён. На самом устройстве ключ можно удалить в настройках паролей.`);
      await load();
    } catch {
      setError("Сервер недоступен. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <h1 className={styles.brand}>Вход по Face ID</h1>
        <p className={styles.subtitle}>Устройства, с которых вы входите в CRM по Face ID / Touch ID без пароля.</p>

        {signedOut ? (
          <div className={styles.actions}>
            <p className={styles.error}>Сначала войдите в CRM.</p>
            <a className={styles.link} href="/login">Перейти ко входу</a>
          </div>
        ) : (
          <>
            {devices === null ? <p className={styles.hint}>Загружаем…</p> : null}
            {devices && devices.length === 0 ? <p className={styles.hint}>Пока ни одного устройства.</p> : null}
            {devices && devices.length > 0 ? (
              <ul className={styles.deviceList}>
                {devices.map((device) => (
                  <li className={styles.device} key={device.passkey_id}>
                    <span>
                      <span className={styles.deviceName}>{device.device_name}</span>
                      <span className={styles.deviceMeta}>
                        Включён {formatDate(device.created_at)} · последний вход: {formatDate(device.last_used_at)}
                      </span>
                    </span>
                    <button className={styles.deviceRemove} disabled={busy} onClick={() => remove(device)} type="button">
                      Отключить
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className={styles.form}>
              {error ? <p className={styles.error}>{error}</p> : null}
              {message ? <p className={styles.success}>{message}</p> : null}
              {canEnable ? (
                <button className={styles.button} disabled={busy} onClick={enable} type="button">
                  {busy ? "Подождите…" : "Включить на этом устройстве"}
                </button>
              ) : (
                <p className={styles.hint}>На этом устройстве или в этом браузере Face ID / Touch ID недоступен.</p>
              )}
            </div>
            <div className={styles.actions}>
              <a className={styles.link} href="/">Вернуться в CRM</a>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
