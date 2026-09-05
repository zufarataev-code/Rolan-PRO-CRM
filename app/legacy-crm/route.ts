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
  const workspaceShortcuts = `
    <style>
      #rolanpro-workspace-shortcuts{position:fixed;right:18px;top:74px;z-index:2147483000;display:flex;align-items:center;gap:8px;padding:7px;border-radius:18px;background:rgba(255,255,255,.96);border:1px solid #dbeafe;box-shadow:0 12px 34px rgba(15,23,42,.18);backdrop-filter:blur(14px);font:800 13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #rolanpro-workspace-shortcuts a{display:flex;align-items:center;gap:7px;padding:9px 12px;border-radius:12px;color:#0f172a;text-decoration:none;white-space:nowrap;transition:.15s ease}
      #rolanpro-workspace-shortcuts a:hover{background:#eff6ff;transform:translateY(-1px)}
      #rolanpro-workspace-shortcuts a.sales{background:#0f172a;color:#fff}
      #rolanpro-workspace-shortcuts a.sales:hover{background:#1e293b}
      #rolanpro-workspace-shortcuts i{font-size:15px;line-height:1}
      #rolanpro-workspace-shortcuts .mail-icon{color:#ea4335}
      @media(max-width:760px){#rolanpro-workspace-shortcuts{left:10px;right:10px;top:auto;bottom:10px;justify-content:space-between;padding:6px}#rolanpro-workspace-shortcuts a{flex:1;justify-content:center;padding:10px 7px;font-size:12px}}
    </style>
    <nav id="rolanpro-workspace-shortcuts" aria-label="Быстрые разделы CRM">
      <a class="sales" href="/manager/crm/pipeline" aria-label="Открыть воронку продаж"><i class="bi bi-funnel-fill" aria-hidden="true"></i>Продажи</a>
      <a href="/manager/crm/calculator" aria-label="Открыть быстрый калькулятор"><i class="bi bi-calculator-fill" aria-hidden="true"></i>Калькулятор</a>
      <a href="/mail" aria-label="Открыть рабочую почту"><span class="mail-icon"><i class="bi bi-envelope-fill" aria-hidden="true"></i></span>Почта</a>
    </nav>
  `;

  // The legacy CRM is a large generated HTML shell. Keep the employee-access
  // override here so the cloud app can evolve without re-embedding credentials
  // or hand-editing the generated legacy file.
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

  const privilegedWorkspace = session.roles.includes(ROLE_CODES.OWNER) || session.roles.includes(ROLE_CODES.MANAGER);
  const injectedUi = privilegedWorkspace ? `${workspaceShortcuts}${teamAccessPatch}` : "";
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
