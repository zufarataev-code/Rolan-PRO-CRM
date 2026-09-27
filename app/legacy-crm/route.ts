import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth/server";
import { ROLE_CODES } from "@/lib/auth/constants";
import { getEnv } from "@/lib/env";
import { replaceLegacyBootstrapLogin } from "@/features/legacy-crm/html-shell";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  const env = getEnv();
  const publicAppUrl = env.appUrl;

  if (!session) {
    return NextResponse.redirect(new URL("/login", publicAppUrl));
  }

  const canUseWorkspace = [
    ROLE_CODES.OWNER,
    ROLE_CODES.MANAGER,
    ROLE_CODES.CONSULTANT,
    ROLE_CODES.INSTALLER,
  ].some((role) => session.roles.includes(role));

  if (!canUseWorkspace) {
    return NextResponse.redirect(new URL("/", publicAppUrl));
  }

  if (session.user.must_change_password) {
    return NextResponse.redirect(new URL("/change-password", publicAppUrl));
  }

  const html = await readFile(
    path.join(process.cwd(), "private", "legacy", "rolanpro-crm-cloud.html"),
    "utf8",
  );

  const cloudHtml = replaceLegacyBootstrapLogin(html);
  const employeeLoginUrl = new URL("/login", publicAppUrl).toString();
  const googleMapsBootstrapPatch = `
    <script>
      window.__ROLANPRO_GOOGLE_MAPS_API_KEY__ = ${JSON.stringify(env.googleMapsApiKey)};
    </script>
  `;

  const teamAccessPatch = `
    <script>
      (() => {
        const employeeLoginUrl = ${JSON.stringify(employeeLoginUrl)};
        const apiMessage = (payload, fallback) => payload?.errors?.[0]?.message || payload?.error?.message || fallback;

        window.copyTeamLoginUrl = async function copyTeamLoginUrl(button) {
          try {
            await navigator.clipboard.writeText(employeeLoginUrl);
            if (button) {
              const original = button.textContent;
              button.textContent = 'Скопировано';
              setTimeout(() => { button.textContent = original; }, 1400);
            }
          } catch (error) {
            window.prompt('Скопируйте ссылку для входа', employeeLoginUrl);
          }
        };

        window.openTeamMemberAccess = function openTeamMemberAccess(legacyUserId) {
          const user = getUser(legacyUserId);
          if (!user) return;

          window.__teamAccessLegacyUserId = legacyUserId;
          window.__teamAccessCurrentEmail = user.email || '';

          state.modal =
            '<div class="modal-backdrop" onclick="if(event.target===this) closeModal()">' +
              '<div class="modal-content workspace-modal p-6">' +
                '<h3 class="font-semibold text-lg mb-1">Доступ: ' + academyEsc(user.name) + '</h3>' +
                '<p class="text-xs text-gray-500 mb-4">Измените почту для входа. Новый пароль задавайте только при необходимости — старый пароль система не показывает.</p>' +

                '<label>Почта для входа</label>' +
                '<input id="tm-email" type="email" autocomplete="email" value="' + academyEsc(user.email || '') + '" placeholder="name@rolan-pro.com">' +

                '<label class="mt-3">Новый временный пароль</label>' +
                '<div class="flex gap-2">' +
                  '<input id="tm-password" type="password" autocomplete="new-password" placeholder="Оставьте пустым, чтобы не менять">' +
                  '<button class="btn-ghost text-sm whitespace-nowrap" onclick="generateTeamAccessPassword()">Сгенерировать</button>' +
                '</div>' +
                '<div class="text-xs text-gray-500 mt-1">Если задать новый пароль, сотрудник сменит его при следующем входе.</div>' +

                '<div class="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-100">' +
                  '<div class="text-xs font-semibold text-blue-900 mb-1">Ссылка сотруднику</div>' +
                  '<div class="text-xs text-blue-800 break-all">' + academyEsc(employeeLoginUrl) + '</div>' +
                  '<button class="btn-ghost text-sm mt-2" onclick="copyTeamLoginUrl(this)">Копировать ссылку</button>' +
                  '<div class="text-xs text-gray-500 mt-2">Это обычный вход на сервер. Сотруднику не нужно скачивать HTML-файл или хранить CRM на телефоне.</div>' +
                '</div>' +

                '<div id="tm-error" class="text-sm text-red-600 mt-3 hidden"></div>' +

                '<div class="flex gap-2 mt-5">' +
                  '<button class="btn-primary flex-1" onclick="submitTeamMemberAccess()">Сохранить</button>' +
                  '<button class="btn-ghost" onclick="closeModal()">Отмена</button>' +
                '</div>' +
              '</div>' +
            '</div>';
          render();
        };

        window.generateTeamAccessPassword = function generateTeamAccessPassword() {
          const input = document.getElementById('tm-password');
          if (!input) return;
          input.value = suggestTeamPassword();
          input.type = 'text';
        };

        window.submitTeamMemberAccess = async function submitTeamMemberAccess() {
          const legacyUserId = String(window.__teamAccessLegacyUserId || '').trim();
          const currentEmail = String(window.__teamAccessCurrentEmail || '').trim().toLowerCase();
          const email = String(document.getElementById('tm-email')?.value || '').trim().toLowerCase();
          const password = String(document.getElementById('tm-password')?.value || '').trim();

          if (!legacyUserId) {
            return showTeamError('Не удалось определить сотрудника. Закройте окно и откройте доступ ещё раз.');
          }
          if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
            return showTeamError('Укажите корректную почту сотрудника.');
          }
          if (password && password.length < 10) {
            return showTeamError('Пароль должен быть не короче 10 символов.');
          }

          try {
            const listResponse = await fetch('/api/v1/team', { cache: 'no-store' });
            const list = await listResponse.json();
            if (!listResponse.ok) {
              return showTeamError(apiMessage(list, 'Не удалось загрузить сотрудников.'));
            }

            const members = Array.isArray(list?.data) ? list.data : [];
            const member = members.find(
              (item) => Array.isArray(item.legacyUserIds) && item.legacyUserIds.includes(legacyUserId),
            ) || (currentEmail ? members.find(
              (item) => String(item.email || '').trim().toLowerCase() === currentEmail,
            ) : null);

            if (!member) {
              return showTeamError('Сотрудник не найден в серверной системе доступов. Создайте ему серверный аккаунт или проверьте почту.');
            }

            const updatePayload = { email, legacyUserId };
            if (password) updatePayload.password = password;

            const updateResponse = await fetch('/api/v1/team/' + member.userId, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatePayload),
            });
            const updateResult = await updateResponse.json();
            if (!updateResponse.ok) {
              return showTeamError(apiMessage(updateResult, 'Не удалось обновить доступ сотрудника.'));
            }

            const legacyUser = getUser(legacyUserId);
            if (legacyUser) {
              legacyUser.email = email;
              save();
            }
            window.__teamAccessCurrentEmail = email;

            if (password) {
              return showTeamPasswordResult(
                'Доступ обновлён',
                member.fullName || legacyUser?.name || 'Сотрудник',
                email,
                password,
              );
            }

            closeModal();
            render();
            if (typeof cloudStatus === 'function') cloudStatus('Доступ сотрудника обновлён', 'green');
          } catch (error) {
            console.error('[Team access] update failed', error);
            showTeamError('Сервер не ответил. Попробуйте ещё раз.');
          }
        };
      })();
    </script>
  `;

  const teamDirectoryPatch = session.roles.includes(ROLE_CODES.OWNER) ? `
    <script id="rolanpro-team-directory-sync">
      (() => {
        const nativeFetch = window.fetch.bind(window);
        const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
        const serverRoleToLegacy = (roles) => {
          if (typeof teamLegacyRoleFromServer === 'function') {
            const mapped = teamLegacyRoleFromServer(Array.isArray(roles) ? roles : []);
            if (mapped) return mapped;
          }
          const values = Array.isArray(roles) ? roles : [];
          if (values.includes('OWNER')) return 'owner';
          if (values.includes('MANAGER')) return 'manager';
          if (values.includes('CONSULTANT')) return 'measurer';
          return 'installer';
        };
        const legacyTitle = (role) => ({
          owner: 'Owner',
          manager: 'Manager',
          measurer: 'Measurer',
          installer: 'Installer',
        })[role] || 'Employee';

        function legacyUsersReady() {
          return typeof db !== 'undefined' && db && Array.isArray(db.users);
        }

        function findLegacyUser(member) {
          if (!legacyUsersReady()) return null;
          const linkedIds = Array.isArray(member?.legacyUserIds) ? member.legacyUserIds : [];
          const linked = db.users.find((user) => linkedIds.includes(user.id));
          if (linked) return linked;
          const email = normalizeEmail(member?.email);
          return email ? db.users.find((user) => normalizeEmail(user.email) === email) || null : null;
        }

        function freshLegacyId(member) {
          const linkedIds = Array.isArray(member?.legacyUserIds) ? member.legacyUserIds : [];
          const freeLinked = linkedIds.find((id) => id && !db.users.some((user) => user.id === id));
          if (freeLinked) return freeLinked;
          const base = 'u_srv_' + String(member?.userId || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 18);
          let candidate = base || ('u_srv_' + Date.now());
          let suffix = 1;
          while (db.users.some((user) => user.id === candidate)) {
            candidate = base + '_' + suffix++;
          }
          return candidate;
        }

        async function materializeCanonicalMember(member) {
          if (!legacyUsersReady() || !member?.userId) return { user: null, changed: false };

          let user = findLegacyUser(member);
          let changed = false;
          if (!user) {
            const role = serverRoleToLegacy(member.roles);
            user = {
              id: freshLegacyId(member),
              name: member.fullName || member.email || 'Сотрудник',
              email: normalizeEmail(member.email),
              phone: '',
              role,
              title: legacyTitle(role),
              active: member.isActive !== false,
              commissionPct: 0,
              hourlyRate: 0,
              lang: 'ru',
              payConfig: role === 'installer'
                ? { type: 'per_sqft', ratePerSqft: 0, ratesByCategory: {}, ratesByWorkType: {} }
                : {},
              pin: '',
              telegramChatId: '',
            };
            db.users.push(user);
            changed = true;
          }

          const canonicalRole = serverRoleToLegacy(member.roles);
          const canonicalEmail = normalizeEmail(member.email);
          const canonicalName = String(member.fullName || '').trim();
          const canonicalActive = member.isActive !== false;

          if (canonicalName && user.name !== canonicalName) {
            user.name = canonicalName;
            changed = true;
          }
          if (canonicalEmail && normalizeEmail(user.email) !== canonicalEmail) {
            user.email = canonicalEmail;
            changed = true;
          }
          if (canonicalRole && user.role !== canonicalRole) {
            user.role = canonicalRole;
            user.title = legacyTitle(canonicalRole);
            changed = true;
          }
          if (Boolean(user.active) !== canonicalActive) {
            user.active = canonicalActive;
            changed = true;
          }

          const linkedIds = Array.isArray(member.legacyUserIds) ? member.legacyUserIds : [];
          if (!linkedIds.includes(user.id)) {
            const linkResponse = await nativeFetch('/api/v1/team/' + encodeURIComponent(member.userId), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ legacyUserId: user.id }),
            });
            if (!linkResponse.ok) {
              console.warn('[Team directory] failed to link legacy card', member.userId, user.id);
            }
          }

          return { user, changed };
        }

        async function syncCanonicalTeamDirectory(options = {}) {
          if (window.__rolanproTeamDirectorySyncing || !legacyUsersReady()) return null;
          window.__rolanproTeamDirectorySyncing = true;
          try {
            const response = await nativeFetch('/api/v1/team', { cache: 'no-store' });
            if (!response.ok) return null;
            const payload = await response.json();
            const members = Array.isArray(payload?.data) ? payload.data : [];
            let changed = false;
            let requestedUser = null;
            const requestedEmail = normalizeEmail(options.openEmail);

            for (const member of members) {
              const result = await materializeCanonicalMember(member);
              changed = changed || result.changed;
              if (requestedEmail && normalizeEmail(member.email) === requestedEmail) {
                requestedUser = result.user;
              }
            }

            if (changed && typeof save === 'function') save();
            if (changed && options.render !== false && typeof render === 'function') render();

            if (requestedUser && typeof openTeamMember === 'function') {
              if (typeof closeModal === 'function') closeModal();
              openTeamMember(requestedUser.id);
              if (typeof cloudStatus === 'function') cloudStatus('Этот сотрудник уже был создан. Открыта его карточка.', 'blue');
            }

            return { members, changed, requestedUser };
          } catch (error) {
            console.error('[Team directory] synchronization failed', error);
            return null;
          } finally {
            window.__rolanproTeamDirectorySyncing = false;
          }
        }

        window.syncCanonicalTeamDirectory = syncCanonicalTeamDirectory;

        window.fetch = async function rolanproTeamAwareFetch(input, init) {
          const response = await nativeFetch(input, init);
          const url = typeof input === 'string' ? input : String(input?.url || '');
          const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();

          if (method === 'POST' && /\/api\/v1\/team(?:\\?|$)/.test(url)) {
            let requestedEmail = '';
            try {
              const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
              requestedEmail = normalizeEmail(body?.email);
            } catch (_) {
              requestedEmail = '';
            }
            const shouldOpenExisting = !response.ok && Boolean(requestedEmail);
            window.setTimeout(() => {
              syncCanonicalTeamDirectory({
                render: true,
                openEmail: shouldOpenExisting ? requestedEmail : '',
              });
            }, 0);
          }

          return response;
        };

        let bootAttempts = 0;
        const boot = () => {
          if (legacyUsersReady()) {
            syncCanonicalTeamDirectory({ render: true });
            return;
          }
          if (bootAttempts++ < 60) window.setTimeout(boot, 250);
        };

        window.addEventListener('hashchange', () => {
          window.setTimeout(() => syncCanonicalTeamDirectory({ render: true }), 0);
        });
        window.setTimeout(boot, 0);
      })();
    </script>
  ` : "";

  const calculatorPatch = `
    <style>
      #rolanpro-calculator-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        background: rgba(15, 23, 42, .48);
        display: grid;
        place-items: center;
        padding: 14px;
      }
      #rolanpro-calculator-panel {
        width: min(1080px, 100%);
        height: min(92dvh, 920px);
        background: #f8fafc;
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 24px 80px rgba(15, 23, 42, .28);
        display: grid;
        grid-template-rows: 54px 1fr;
      }
      #rolanpro-calculator-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 0 14px;
        background: #fff;
        border-bottom: 1px solid #e2e8f0;
        font: 700 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #0f172a;
      }
      #rolanpro-calculator-close {
        width: 40px;
        height: 40px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #fff;
        font-size: 24px;
        line-height: 1;
        cursor: pointer;
      }
      #rolanpro-calculator-frame { width: 100%; height: 100%; border: 0; background: #f8fafc; }
      .rolanpro-calculator-nav { cursor: pointer; }
      @media (max-width: 640px) {
        #rolanpro-calculator-overlay { padding: 0; }
        #rolanpro-calculator-panel { width: 100%; height: 100dvh; border-radius: 0; }
      }
    </style>
    <script>
      (() => {
        window.closeRolanProCalculator = function closeRolanProCalculator() {
          document.getElementById('rolanpro-calculator-overlay')?.remove();
        };

        window.openRolanProCalculator = function openRolanProCalculator(dealId) {
          window.closeRolanProCalculator();
          const overlay = document.createElement('div');
          overlay.id = 'rolanpro-calculator-overlay';
          overlay.innerHTML =
            '<div id="rolanpro-calculator-panel">' +
              '<div id="rolanpro-calculator-bar">' +
                '<span>Быстрый калькулятор</span>' +
                '<button id="rolanpro-calculator-close" type="button" aria-label="Закрыть калькулятор">×</button>' +
              '</div>' +
              '<iframe id="rolanpro-calculator-frame" title="Быстрый калькулятор" src="/legacy-crm/calculator?embed=1' + (dealId ? '&deal_id=' + encodeURIComponent(dealId) : '') + '"></iframe>' +
            '</div>';
          overlay.addEventListener('click', (event) => {
            if (event.target === overlay) window.closeRolanProCalculator();
          });
          document.body.appendChild(overlay);
          document.getElementById('rolanpro-calculator-close')?.addEventListener('click', window.closeRolanProCalculator);
        };

        function ensureCalculatorNav() {
          const navs = Array.from(document.querySelectorAll('nav'));
          const nav = navs.find((candidate) =>
            Array.from(candidate.querySelectorAll('.nav-item')).some((item) => String(item.textContent || '').trim().includes('КП')),
          );
          if (!nav || nav.querySelector('[data-rolanpro-calculator-nav="1"]')) return;

          const item = document.createElement('div');
          item.className = 'nav-item rolanpro-calculator-nav';
          item.setAttribute('data-rolanpro-calculator-nav', '1');
          item.title = 'Быстрый калькулятор';
          item.innerHTML = '<span class="nav-icon">🧮</span><span class="nav-label">Калькулятор</span>';
          item.addEventListener('click', () => window.openRolanProCalculator());

          const proposalItem = Array.from(nav.querySelectorAll('.nav-item')).find((candidate) =>
            String(candidate.textContent || '').trim().includes('КП'),
          );
          if (proposalItem?.nextSibling) nav.insertBefore(item, proposalItem.nextSibling);
          else nav.appendChild(item);
        }

        const observer = new MutationObserver(() => window.requestAnimationFrame(ensureCalculatorNav));
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.requestAnimationFrame(ensureCalculatorNav);

        window.addEventListener('message', (event) => {
          if (event.origin !== window.location.origin || event.data?.type !== 'rolanpro-calculator-saved') return;
          if (typeof cloudStatus === 'function') cloudStatus('Расчёт сохранён в сделку', 'green');
        });
      })();
    </script>
  `;

  const privilegedWorkspace = session.roles.includes(ROLE_CODES.OWNER) || session.roles.includes(ROLE_CODES.MANAGER);
  const privilegedUi = privilegedWorkspace ? `${teamAccessPatch}${calculatorPatch}` : "";
  const injectedUi = `${googleMapsBootstrapPatch}${teamDirectoryPatch}${privilegedUi}`;
  const closingBodyIndex = cloudHtml.toLowerCase().lastIndexOf("</body>");
  const htmlWithCloudUi = closingBodyIndex >= 0
    ? `${cloudHtml.slice(0, closingBodyIndex)}${injectedUi}${cloudHtml.slice(closingBodyIndex)}`
    : `${cloudHtml}${injectedUi}`;

  return new NextResponse(htmlWithCloudUi, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      // Google Maps browser-key restrictions validate the requesting origin.
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}
