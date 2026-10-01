import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { getRequestSession } from "@/lib/auth/server";
import { ROLE_CODES } from "@/lib/auth/constants";
import { getEnv } from "@/lib/env";
import { replaceLegacyBootstrapLogin } from "@/features/legacy-crm/html-shell";
import { BEFORE_PAINT_SCRIPT } from "@/features/legacy-crm/before-paint";

export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

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

  // During "view as employee" the owner is looking, not the employee: never
  // send the owner to the employee's password-change screen.
  if (session.user.must_change_password && !session.preview) {
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
          hydrateTeamAccessEmail(legacyUserId, user.email || '');
        };

        // The login email lives in PostgreSQL. The legacy card may still hold
        // an older value, so the dialog always shows the server account's email.
        async function hydrateTeamAccessEmail(legacyUserId, cardEmail) {
          try {
            const response = await fetch('/api/v1/team', { cache: 'no-store' });
            const list = await response.json();
            if (!response.ok) return;
            const members = Array.isArray(list?.data) ? list.data : [];
            const knownEmail = String(cardEmail || '').trim().toLowerCase();
            const member = members.find(
              (item) => Array.isArray(item.legacyUserIds) && item.legacyUserIds.includes(legacyUserId),
            ) || (knownEmail ? members.find(
              (item) => String(item.email || '').trim().toLowerCase() === knownEmail,
            ) : null);
            if (!member?.email || window.__teamAccessLegacyUserId !== legacyUserId) return;

            const input = document.getElementById('tm-email');
            if (input && String(input.value || '').trim().toLowerCase() === knownEmail) {
              input.value = member.email;
            }
            window.__teamAccessCurrentEmail = member.email;
          } catch (error) {
            console.error('[Team access] account hydration failed', error);
          }
        }

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
          if (password && password.length < 12) {
            return showTeamError('Пароль должен быть не короче 12 символов.');
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
            const savedEmail = String(updateResult?.data?.email || '').trim().toLowerCase();
            if (savedEmail !== email) {
              return showTeamError('Сервер не сохранил новую почту. Обновите страницу и попробуйте ещё раз.');
            }

            const legacyUser = getUser(legacyUserId);
            if (legacyUser) {
              legacyUser.email = savedEmail;
              save();
            }
            window.__teamAccessCurrentEmail = savedEmail;

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

  // Employee cards are derived from PostgreSQL on the server (see
  // src/features/team/directory.ts); the old in-browser directory sync that
  // re-rendered on every navigation is gone. Owners get a link to the
  // canonical employee screen.
  const teamDirectoryPatch = session.roles.includes(ROLE_CODES.OWNER) && !session.preview ? `
    <style>
      #rolanpro-team-overlay { position: fixed; inset: 0; z-index: 2147483000; background: rgba(15,23,42,.48); display: grid; place-items: center; padding: 14px; }
      #rolanpro-team-frame { width: min(980px, 100%); height: min(94dvh, 980px); border: 0; border-radius: 18px; background: #f1f5f9; box-shadow: 0 24px 80px rgba(15,23,42,.28); }
      @media (max-width: 640px) { #rolanpro-team-overlay { padding: 0; } #rolanpro-team-frame { height: 100dvh; border-radius: 0; } }
    </style>
    <script id="rolanpro-team-screen-link">
      (() => {
        // Employee management is part of this CRM: it opens as an overlay
        // inside /legacy-crm (same pattern as the calculator).
        // The directory lives in PostgreSQL. Every way of closing the overlay
        // (button, backdrop) reloads the CRM after a change, so assignment
        // lists and roles are never stale.
        let teamChanged = false;
        window.closeRolanProTeam = function closeRolanProTeam() {
          const overlay = document.getElementById('rolanpro-team-overlay');
          if (!overlay) return;
          overlay.remove();
          if (teamChanged) location.reload();
        };
        window.openRolanProTeam = function openRolanProTeam() {
          document.getElementById('rolanpro-team-overlay')?.remove();
          const overlay = document.createElement('div');
          overlay.id = 'rolanpro-team-overlay';
          overlay.innerHTML = '<iframe id="rolanpro-team-frame" title="Сотрудники" src="/legacy-crm/team?embed=1"></iframe>';
          overlay.addEventListener('click', (event) => { if (event.target === overlay) window.closeRolanProTeam(); });
          document.body.appendChild(overlay);
        };
        window.addEventListener('message', (event) => {
          if (event.origin !== window.location.origin) return;
          if (event.data?.type === 'rolanpro-team-changed') teamChanged = true;
          if (event.data?.type === 'rolanpro-team-close') window.closeRolanProTeam();
        });

        // The existing «Команда» section keeps phone, photo and pay settings.
        // Roles are edited only in the canonical directory: the old
        // single-role editor would drop secondary roles. The login email may be
        // changed here too — it goes straight to the PostgreSQL account, so the
        // card, the access dialog and the login all show the same address.
        const originalRenderTeam = window.renderTeam;
        if (typeof originalRenderTeam === 'function') {
          window.renderTeam = function renderTeamWithDirectory() {
            return '<div class="card p-4 mb-4 flex items-center justify-between gap-3 flex-wrap">'
              + '<div><div class="font-black">Роли, доступ и «Посмотреть глазами»</div>'
              + '<div class="text-sm text-gray-500">Добавление сотрудников, роли и вход — в едином списке. Здесь — телефон, фото и оплата.</div></div>'
              + '<button class="btn-primary" onclick="openRolanProTeam()">Открыть сотрудников и расценки</button></div>'
              + originalRenderTeam();
          };
        }
        const nativeTeamFetch = window.fetch.bind(window);
        window.fetch = function teamSafeFetch(input, init) {
          const url = typeof input === 'string' ? input : String(input?.url || '');
          const method = String(init?.method || 'GET').toUpperCase();
          const isTeamMemberPatch = method === 'PATCH' && url.includes('/api/v1/team/') && !url.includes('/api/v1/team/preview');
          if (isTeamMemberPatch && typeof init?.body === 'string') {
            try {
              const body = JSON.parse(init.body);
              delete body.roles;
              init = { ...init, body: JSON.stringify(body) };
            } catch (_) { /* not JSON: send as is */ }
          }
          return nativeTeamFetch(input, init);
        };
        new MutationObserver(() => {
          ['tm-edit-role'].forEach((id) => {
            const field = document.getElementById(id);
            if (field && !field.disabled) {
              field.disabled = true;
              field.title = 'Меняется в разделе «Сотрудники»';
            }
          });
        }).observe(document.documentElement, { childList: true, subtree: true });
        if (new URLSearchParams(location.search).get('panel') === 'team') {
          history.replaceState(null, '', location.pathname + location.hash);
          window.requestAnimationFrame(() => window.openRolanProTeam());
        }
      })();
    </script>
  ` : "";

  const previewPatch = session.preview ? `
    <style>
      #rolanpro-preview-bar {
        position: fixed; left: 0; right: 0; top: 0; z-index: 2147483600;
        display: flex; align-items: center; justify-content: center; gap: 12px;
        padding: 8px 14px; background: #7c2d12; color: #fff;
        font: 600 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      #rolanpro-preview-bar button {
        border: 0; border-radius: 8px; padding: 6px 12px; cursor: pointer;
        background: #fff; color: #7c2d12; font: inherit;
      }
      body { padding-top: 40px !important; }
    </style>
    <div id="rolanpro-preview-bar" role="status">
      <span>Вы смотрите глазами: ${escapeHtml(session.user.full_name)}. Только просмотр — изменения не сохраняются.</span>
      <button type="button" id="rolanpro-preview-exit">Выйти из просмотра</button>
    </div>
    <script>
      (() => {
        // The server rejects every change during a preview; do not even try,
        // so the page never reports a false "saved locally".
        window.cloudPersist = async function cloudPersistPreview() {
          if (typeof cloudStatus === 'function') cloudStatus('Режим просмотра: изменения не сохраняются', 'blue');
        };
        document.getElementById('rolanpro-preview-exit')?.addEventListener('click', async () => {
          await fetch('/api/v1/team/preview', { method: 'DELETE' }).catch(() => null);
          location.assign('/legacy-crm?panel=team');
        });
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

${BEFORE_PAINT_SCRIPT}
        const observer = new MutationObserver(() => beforePaint(ensureCalculatorNav));
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
  const injectedUi = `${googleMapsBootstrapPatch}${teamDirectoryPatch}${privilegedUi}${previewPatch}`;
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
