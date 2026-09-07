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
  const publicAppUrl = getEnv().appUrl;

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

  const moneyTrackerPatch = `
    <style>
      #rolanpro-money-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483001;
        background: rgba(15, 23, 42, .52);
        display: grid;
        place-items: center;
        padding: 14px;
      }
      #rolanpro-money-panel {
        width: min(1160px, 100%);
        height: min(94dvh, 960px);
        background: #f8fafc;
        border-radius: 18px;
        overflow: hidden;
        box-shadow: 0 24px 80px rgba(15, 23, 42, .30);
        display: grid;
        grid-template-rows: 54px 1fr;
      }
      #rolanpro-money-bar {
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
      #rolanpro-money-close {
        width: 40px;
        height: 40px;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #fff;
        font-size: 24px;
        line-height: 1;
        cursor: pointer;
      }
      #rolanpro-money-frame { width: 100%; height: 100%; border: 0; background: #f8fafc; }
      .rolanpro-money-nav { cursor: pointer; }
      @media (max-width: 640px) {
        #rolanpro-money-overlay { padding: 0; }
        #rolanpro-money-panel { width: 100%; height: 100dvh; border-radius: 0; }
      }
    </style>
    <script>
      (() => {
        window.closeRolanProMoneyTracker = function closeRolanProMoneyTracker() {
          document.getElementById('rolanpro-money-overlay')?.remove();
        };

        window.openRolanProMoneyTracker = function openRolanProMoneyTracker() {
          window.closeRolanProMoneyTracker();
          const overlay = document.createElement('div');
          overlay.id = 'rolanpro-money-overlay';
          overlay.innerHTML =
            '<div id="rolanpro-money-panel">' +
              '<div id="rolanpro-money-bar">' +
                '<span>Money Tracker · фактические расходы</span>' +
                '<button id="rolanpro-money-close" type="button" aria-label="Закрыть Money Tracker">×</button>' +
              '</div>' +
              '<iframe id="rolanpro-money-frame" title="Money Tracker" src="/legacy-crm/money?embed=1"></iframe>' +
            '</div>';
          overlay.addEventListener('click', (event) => {
            if (event.target === overlay) window.closeRolanProMoneyTracker();
          });
          document.body.appendChild(overlay);
          document.getElementById('rolanpro-money-close')?.addEventListener('click', window.closeRolanProMoneyTracker);
        };

        function ensureMoneyNav() {
          const navs = Array.from(document.querySelectorAll('nav'));
          const nav = navs.find((candidate) =>
            Array.from(candidate.querySelectorAll('.nav-item')).some((item) => String(item.textContent || '').trim().includes('КП')),
          );
          if (!nav || nav.querySelector('[data-rolanpro-money-nav="1"]')) return;

          const item = document.createElement('div');
          item.className = 'nav-item rolanpro-money-nav';
          item.setAttribute('data-rolanpro-money-nav', '1');
          item.title = 'Фактические расходы';
          item.innerHTML = '<span class="nav-icon">💵</span><span class="nav-label">Деньги</span>';
          item.addEventListener('click', () => window.openRolanProMoneyTracker());

          const calculatorItem = nav.querySelector('[data-rolanpro-calculator-nav="1"]');
          if (calculatorItem?.nextSibling) nav.insertBefore(item, calculatorItem.nextSibling);
          else if (calculatorItem) nav.appendChild(item);
          else {
            const proposalItem = Array.from(nav.querySelectorAll('.nav-item')).find((candidate) =>
              String(candidate.textContent || '').trim().includes('КП'),
            );
            if (proposalItem?.nextSibling) nav.insertBefore(item, proposalItem.nextSibling);
            else nav.appendChild(item);
          }
        }

        const observer = new MutationObserver(() => window.requestAnimationFrame(ensureMoneyNav));
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.requestAnimationFrame(ensureMoneyNav);
      })();
    </script>
  `;

  const privilegedWorkspace = session.roles.includes(ROLE_CODES.OWNER) || session.roles.includes(ROLE_CODES.MANAGER);
  const injectedUi = privilegedWorkspace ? `${teamAccessPatch}${calculatorPatch}${moneyTrackerPatch}` : "";
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
      "Referrer-Policy": "same-origin",
    },
  });
}