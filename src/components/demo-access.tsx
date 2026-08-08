type DemoRole = {
  label: string;
  email: string;
  href: string;
  note: string;
};

const DEMO_ROLES: DemoRole[] = [
  {
    label: "Manager",
    email: "manager@rolanpro.local",
    href: "/api/v1/auth/demo-login?role=manager",
    note: "Открывает главный manager dashboard и CRM workflow.",
  },
  {
    label: "Owner",
    email: "owner@rolanpro.local",
    href: "/api/v1/auth/demo-login?role=owner",
    note: "Открывает owner dashboard, money tracker и справочники.",
  },
  {
    label: "Consultant",
    email: "consultant@rolanpro.local",
    href: "/api/v1/auth/demo-login?role=consultant",
    note: "Открывает только назначенные консультации и survey context.",
  },
  {
    label: "Installer",
    email: "installer@rolanpro.local",
    href: "/api/v1/auth/demo-login?role=installer",
    note: "Открывает только свои монтажные задачи и execution flow.",
  },
];

export function DemoAccess() {
  return (
    <section className="demo-access">
      <div className="demo-access-head">
        <div className="demo-access-kicker">Demo Access</div>
        <h2 className="demo-access-title">Быстрый вход по ролям</h2>
        <p className="demo-access-text">
          Вход теперь выполняется сервером с прямым redirect, поэтому роли открываются без client-side race condition.
        </p>
      </div>

      <div className="demo-role-list">
        {DEMO_ROLES.map((role) => (
          <div key={role.label} className="demo-role-card">
            <div>
              <div className="demo-role-label">{role.label}</div>
              <div className="demo-role-email">{role.email}</div>
              <p className="demo-role-note">{role.note}</p>
            </div>

            <a href={role.href} className="accent-button">
              {`Войти как ${role.label}`}
            </a>
          </div>
        ))}
      </div>

      <div className="demo-access-message">
        Если роль уже была открыта в этой вкладке раньше, после входа можно сделать Cmd + Shift + R.
      </div>
    </section>
  );
}
