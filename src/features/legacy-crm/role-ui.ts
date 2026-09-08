const ROLE_UI_POLICY_PATCH = `
<style id="rolanpro-role-ui-policy-style">
  [onclick*="installRolanProApp"] {
    display: none !important;
  }

  html[data-rolanpro-role="manager"] .nav-item[onclick*="selectAppView('payroll')"],
  html[data-rolanpro-role="manager"] .nav-item[onclick*="selectAppView('team')"] {
    display: none !important;
  }

  .sidebar-user[data-rolanpro-user-duplicate="1"] {
    display: none !important;
  }

  .topbar-user-pill[data-rolanpro-user-top="1"] {
    display: inline-flex !important;
    align-items: center !important;
    gap: .5rem !important;
    max-width: 220px !important;
    padding: .28rem .55rem .28rem .28rem !important;
  }

  .rolanpro-top-user-avatar {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 10px;
    background: #eff6ff;
    border: 1px solid #dbeafe;
    color: #1d4ed8;
    font-size: 14px;
    font-weight: 900;
  }

  .rolanpro-top-user-avatar img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .rolanpro-top-user-meta {
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.1;
  }

  .rolanpro-top-user-name {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #0f172a;
    font-size: 12px;
    font-weight: 800;
  }

  .rolanpro-top-user-role {
    margin-top: 2px;
    color: #64748b;
    font-size: 10px;
    font-weight: 650;
  }

  @media (max-width: 840px) {
    .topbar-user-pill[data-rolanpro-user-top="1"] {
      display: inline-flex !important;
      max-width: none !important;
      padding: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    .rolanpro-top-user-avatar {
      width: 36px;
      height: 36px;
      flex-basis: 36px;
      border-radius: 11px;
      background: #fff;
    }

    .rolanpro-top-user-meta {
      display: none !important;
    }
  }
</style>
<script id="rolanpro-role-ui-policy-script">
  (() => {
    const restrictedManagerViews = new Set(['payroll', 'team']);

    const getUser = () => {
      try {
        return typeof currentUser === 'function' ? currentUser() : null;
      } catch (_) {
        return null;
      }
    };

    const roleLabel = (user) => {
      try {
        return typeof T === 'function' ? T(user.role) : String(user.role || '');
      } catch (_) {
        return String(user.role || '');
      }
    };

    const installAccessGuard = () => {
      if (window.__rolanproManagerViewGuardInstalled) return;
      if (typeof window.selectAppView !== 'function') return;

      const originalSelectAppView = window.selectAppView;
      window.__rolanproManagerViewGuardInstalled = true;
      window.__rolanproOriginalSelectAppView = originalSelectAppView;
      window.selectAppView = function guardedSelectAppView(key) {
        const user = getUser();
        if (user && user.role === 'manager' && restrictedManagerViews.has(String(key))) {
          return undefined;
        }
        return originalSelectAppView.apply(this, arguments);
      };
    };

    const removeInstallButtons = () => {
      document.querySelectorAll('[onclick*="installRolanProApp"]').forEach((element) => element.remove());
    };

    const removeSidebarUserDuplicate = () => {
      document.querySelectorAll('.sidebar-user').forEach((element) => {
        element.setAttribute('data-rolanpro-user-duplicate', '1');
        element.remove();
      });
    };

    const applyManagerNavigationPolicy = (user) => {
      document.documentElement.setAttribute('data-rolanpro-role', String(user?.role || ''));
      if (!user || user.role !== 'manager') return;

      document.querySelectorAll(
        '.nav-item[onclick*="selectAppView(\\'payroll\\')"], .nav-item[onclick*="selectAppView(\\'team\\')"]',
      ).forEach((element) => element.remove());
    };

    const renderTopUser = (user) => {
      const pill = document.querySelector('.topbar-user-pill');
      if (!(pill instanceof HTMLElement) || !user) return;

      const fingerprint = [String(user.id || ''), String(user.name || ''), String(user.role || ''), String(user.photo || '')].join('|');
      if (pill.dataset.rolanproUserFingerprint === fingerprint) return;

      pill.dataset.rolanproUserTop = '1';
      pill.dataset.rolanproUserFingerprint = fingerprint;
      pill.title = String(user.name || 'Пользователь');
      pill.replaceChildren();

      const avatar = document.createElement('span');
      avatar.className = 'rolanpro-top-user-avatar';
      if (user.photo) {
        const image = document.createElement('img');
        image.src = String(user.photo);
        image.alt = '';
        image.loading = 'lazy';
        avatar.appendChild(image);
      } else {
        avatar.textContent = String(user.name || '?').trim().charAt(0).toUpperCase() || '?';
      }

      const meta = document.createElement('span');
      meta.className = 'rolanpro-top-user-meta';

      const name = document.createElement('span');
      name.className = 'rolanpro-top-user-name';
      name.textContent = String(user.name || 'Пользователь');

      const role = document.createElement('span');
      role.className = 'rolanpro-top-user-role';
      role.textContent = roleLabel(user);

      meta.append(name, role);
      pill.append(avatar, meta);
    };

    let queued = false;
    const applyPolicy = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        installAccessGuard();
        const user = getUser();
        removeInstallButtons();
        removeSidebarUserDuplicate();
        applyManagerNavigationPolicy(user);
        renderTopUser(user);
      });
    };

    const observer = new MutationObserver(applyPolicy);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('hashchange', applyPolicy);
    window.addEventListener('resize', applyPolicy, { passive: true });
    applyPolicy();
  })();
</script>`;

export function injectRoleUiPolicy(html: string) {
  if (html.includes('id="rolanpro-role-ui-policy-style"')) return html;

  const closingBodyIndex = html.toLowerCase().lastIndexOf('</body>');
  if (closingBodyIndex < 0) return `${html}${ROLE_UI_POLICY_PATCH}`;

  return `${html.slice(0, closingBodyIndex)}${ROLE_UI_POLICY_PATCH}${html.slice(closingBodyIndex)}`;
}
