"use client";

import { InputHTMLAttributes, useState } from "react";

import styles from "./auth-card.module.css";

type AuthPasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">;

/**
 * Password input with a show/hide toggle, shared by the login,
 * change-password and reset-password forms. The caller keeps control of
 * autoComplete so the browser keychain still tells "current" from "new".
 */
export function AuthPasswordField(props: AuthPasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className={styles.passwordField}>
      <input
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        {...props}
        className={`${styles.input} ${styles.passwordInput}`}
        type={visible ? "text" : "password"}
      />
      <button
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        aria-pressed={visible}
        className={styles.passwordToggle}
        onClick={() => setVisible((current) => !current)}
        type="button"
      >
        <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="22">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
          {visible ? null : <path d="M4 4l16 16" />}
        </svg>
      </button>
    </span>
  );
}
