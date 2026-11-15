import { useState } from 'react';

export function PasswordInput({ value, onChange, ...props }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="password-input-container">
      <input
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete="current-password"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        aria-label="Показать или скрыть пароль"
        aria-pressed={showPassword}
      >
        {showPassword ? 'Скрыть' : 'Показать'}
      </button>
    </div>
  );
}
