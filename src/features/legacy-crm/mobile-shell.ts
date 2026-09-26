type MobileCrmShellInput = {
  user: {
    user_id: string;
    email: string;
    full_name: string;
  };
  roles: string[];
};

export function buildMobileCrmShell(input: MobileCrmShellInput) {
  const context = JSON.stringify({
    user: {
      user_id: input.user.user_id,
      email: input.user.email,
      full_name: input.user.full_name,
    },
    roles: input.roles,
  })
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");

  return String.raw\`
    <div id="rolanpro-mobile-crm" aria-label="ROLANPRO mobile CRM">
      <header class="rpm-header">
        <div>
          <div class="rpm-brand">ROLANPRO</div>
          <div class="rpm-subtitle">CRM</div>
        </div>
        <button class="rpm-icon-btn" id="rpm-refresh" type="button" aria-label="Обновить">↻</button>
      </header>
      <main id="rpm-view" class="rpm-view" aria-live="polite"></main>
      <nav id="rpm-nav" class="rpm-nav" aria-label="Основная навигация"></nav>
    </div>

    <style id="rolanpro-mobile-crm-style">
      :root {
        --rpm-navy: #10253F;
        --rpm-blue: #29A7E1;
        --rpm-bg: #F5F7FA;
        --rpm-card: #FFFFFF;
        --rpm-text: #10253F;
        --rpm-muted: #6B7785;
        --rpm-line: #E5EAF0;
        --rpm-danger: #B42318;
        --rpm-success: #18794E;
      }
      #rolanpro-mobile-crm { display: none; }
      @media (max-width: 820px) {
        html, body { overflow-x: hidden !important; }
        #rolanpro-mobile-crm {
          position: fixed;
          inset: 0;
          z-index: 2147482500;
          display: grid;
          grid-template-rows: auto 1fr auto;
          background: var(--rpm-bg);
          color: var(--rpm-text);
          font-family: Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
          overflow: hidden;
        }
        #rolanpro-mobile-crm * { box-sizing: border-box; }
        .rpm-header {
          min-height: calc(64px + env(safe-area-inset-top));
          padding: calc(12px + env(safe-area-inset-top)) 16px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: rgba(255,255,255,.96);
          border-bottom: 1px solid var(--rpm-line);
          backdrop-filter: blur(18px);
        }
        .rpm-brand { font-size: 17px; font-weight: 700; letter-spacing: .055em; color: var(--rpm-navy); }
        .rpm-subtitle { margin-top: 1px; font-size: 11px; font-weight: 600; color: var(--rpm-blue); letter-spacing: .08em; }
        .rpm-view {
          min-width: 0;
          overflow-x: hidden;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding: 18px 16px calc(104px + env(safe-area-inset-bottom));
        }
        .rpm-nav {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          min-height: calc(68px + env(safe-area-inset-bottom));
          padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(0, 1fr);
          align-items: stretch;
          gap: 2px;
          background: rgba(255,255,255,.97);
          border-top: 1px solid var(--rpm-line);
          backdrop-filter: blur(18px);
          z-index: 2;
        }
        .rpm-nav-btn, .rpm-icon-btn, .rpm-btn, .rpm-list-card, .rpm-back {
          min-height: 44px;
          border: 0;
          font: inherit;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .rpm-nav-btn {
          min-width: 0;
          background: transparent;
          border-radius: 12px;
          padding: 6px 4px;
          color: #66707B;
          font-size: 11px;
          font-weight: 600;
        }
        .rpm-nav-btn strong { display: block; font-size: 19px; line-height: 22px; font-weight: 500; margin-bottom: 2px; }
        .rpm-nav-btn.is-active { color: var(--rpm-blue); background: #EEF8FC; }
        .rpm-icon-btn {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          background: #EEF3F7;
          color: var(--rpm-navy);
          font-size: 22px;
        }
        .rpm-title { margin: 0; font-size: 25px; line-height: 1.15; font-weight: 700; letter-spacing: -.025em; }
        .rpm-kicker { margin: 0 0 6px; color: var(--rpm-blue); font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
        .rpm-muted { color: var(--rpm-muted); font-size: 13px; line-height: 1.45; }
        .rpm-section { margin-top: 22px; }
        .rpm-section-title { margin: 0 0 10px; font-size: 14px; font-weight: 700; }
        .rpm-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; margin-top: 16px; }
        .rpm-metric, .rpm-card {
          min-width: 0;
          background: var(--rpm-card);
          border: 1px solid var(--rpm-line);
          border-radius: 18px;
          box-shadow: 0 4px 18px rgba(16,37,63,.045);
        }
        .rpm-metric { padding: 15px; }
        .rpm-metric-value { font-size: 27px; font-weight: 700; line-height: 1; }
        .rpm-metric-label { margin-top: 7px; font-size: 12px; color: var(--rpm-muted); line-height: 1.35; }
        .rpm-card { padding: 15px; margin-top: 10px; }
        .rpm-list-card {
          width: 100%;
          text-align: left;
          background: var(--rpm-card);
          border: 1px solid var(--rpm-line);
          border-radius: 16px;
          padding: 14px;
          margin-top: 10px;
          color: var(--rpm-text);
        }
        .rpm-list-card:active { transform: scale(.995); }
        .rpm-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
        .rpm-grow { min-width: 0; flex: 1; }
        .rpm-name { font-size: 15px; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
        .rpm-meta { margin-top: 4px; font-size: 12px; line-height: 1.4; color: var(--rpm-muted); overflow-wrap: anywhere; }
        .rpm-badge {
          flex: 0 0 auto;
          max-width: 45%;
          padding: 5px 8px;
          border-radius: 999px;
          background: #EEF3F7;
          color: var(--rpm-navy);
          font-size: 10px;
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rpm-toolbar { display: flex; gap: 8px; margin-top: 14px; }
        .rpm-btn {
          border-radius: 13px;
          padding: 0 14px;
          background: var(--rpm-navy);
          color: #fff;
          font-size: 14px;
          font-weight: 650;
        }
        .rpm-btn.secondary { background: #EEF3F7; color: var(--rpm-navy); }
        .rpm-btn.blue { background: var(--rpm-blue); color: #fff; }
        .rpm-btn.danger { background: #FFF1F0; color: var(--rpm-danger); }
        .rpm-btn.full { width: 100%; }
        .rpm-back { background: transparent; color: var(--rpm-blue); padding: 0; font-size: 14px; font-weight: 650; }
        .rpm-form { display: grid; gap: 12px; margin-top: 16px; }
        .rpm-field { display: grid; gap: 6px; }
        .rpm-field label { font-size: 12px; font-weight: 650; color: var(--rpm-muted); }
        .rpm-field input, .rpm-field textarea, .rpm-field select {
          width: 100%;
          min-height: 46px;
          border: 1px solid #D8E0E8;
          border-radius: 13px;
          padding: 10px 12px;
          background: #fff;
          color: var(--rpm-text);
          font: 500 16px/1.35 Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
          outline: none;
        }
        .rpm-field textarea { min-height: 96px; resize: vertical; }
        .rpm-field input:focus, .rpm-field textarea:focus, .rpm-field select:focus {
          border-color: var(--rpm-blue);
          box-shadow: 0 0 0 3px rgba(41,167,225,.13);
        }
        .rpm-search { margin-top: 14px; }
        .rpm-empty, .rpm-error {
          margin-top: 14px;
          padding: 16px;
          border-radius: 16px;
          background: #fff;
          border: 1px solid var(--rpm-line);
          color: var(--rpm-muted);
          font-size: 13px;
          line-height: 1.45;
        }
        .rpm-error { color: var(--rpm-danger); background: #FFF8F7; }
        .rpm-loading { padding: 28px 0; text-align: center; color: var(--rpm-muted); font-size: 13px; }
        .rpm-detail-list { display: grid; gap: 10px; margin-top: 14px; }
        .rpm-detail-row { padding: 12px 0; border-bottom: 1px solid var(--rpm-line); }
        .rpm-detail-row:last-child { border-bottom: 0; }
        .rpm-detail-label { font-size: 11px; color: var(--rpm-muted); margin-bottom: 3px; }
        .rpm-detail-value { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
        .rpm-day-picker { margin-top: 14px; }
        .rpm-split { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; align-items: center; }
        .rpm-link { color: var(--rpm-blue); text-decoration: none; font-weight: 650; }
        .rpm-hidden { display: none !important; }
        @media (prefers-color-scheme: dark) {
          #rolanpro-mobile-crm.rpm-auto-dark {
            --rpm-bg: #0E1721;
            --rpm-card: #14202D;
            --rpm-text: #F5F8FB;
            --rpm-muted: #9BA8B6;
            --rpm-line: #263544;
          }
        }
        #rolanpro-mobile-crm.rpm-dark {
          --rpm-bg: #0E1721;
          --rpm-card: #14202D;
          --rpm-text: #F5F8FB;
          --rpm-muted: #9BA8B6;
          --rpm-line: #263544;
        }
        #rolanpro-mobile-crm.rpm-dark .rpm-header,
        #rolanpro-mobile-crm.rpm-dark .rpm-nav,
        #rolanpro-mobile-crm.rpm-dark .rpm-field input,
        #rolanpro-mobile-crm.rpm-dark .rpm-field textarea,
        #rolanpro-mobile-crm.rpm-dark .rpm-field select { background: #14202D; color: var(--rpm-text); }
      }
    </style>

    <script id="rolanpro-mobile-crm-script">
      (() => {
        const context = \${context};
        const root = document.getElementById('rolanpro-mobile-crm');
        const view = document.getElementById('rpm-view');
        const nav = document.getElementById('rpm-nav');
        const refresh = document.getElementById('rpm-refresh');
        if (!root || !view || !nav) return;

        const params = new URLSearchParams(window.location.search);
        if (params.get('desktop') === '1') {
          root.classList.add('rpm-hidden');
          return;
        }

        const roles = Array.isArray(context.roles) ? context.roles : [];
        const canSales = roles.includes('OWNER') || roles.includes('MANAGER');
        const isConsultant = roles.includes('CONSULTANT');
        const isInstaller = roles.includes('INSTALLER');
        const state = {
          screen: 'today',
          leads: [],
          projects: [],
          consultations: [],
          fieldOrders: [],
          installerJobs: [],
          leadQuery: '',
          selectedLead: null,
          selectedProject: null,
          selectedConsultation: null,
          calendarDate: new Date().toISOString().slice(0, 10),
          error: '',
          busy: false,
        };

        const escapeHtml = (value) => String(value ?? '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#039;');

        const safeText = (value, fallback) => {
          const text = String(value ?? '').trim();
          return text || fallback || '—';
        };

        const apiMessage = (payload, fallback) =>
          payload?.errors?.[0]?.message || payload?.error?.message || fallback || 'Не удалось выполнить запрос.';

        const api = async (url, options) => {
          const response = await fetch(url, {
            cache: 'no-store',
            credentials: 'same-origin',
            ...(options || {}),
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok) throw new Error(apiMessage(payload, 'Ошибка сервера.'));
          return payload?.data || {};
        };

        const formatDate = (value, withTime) => {
          if (!value) return '—';
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return String(value);
          const options = withTime
            ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
            : { month: 'short', day: 'numeric', year: 'numeric' };
          return new Intl.DateTimeFormat('ru-RU', options).format(date);
        };

        const sameLocalDay = (value, dateKey) => {
          if (!value) return false;
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return false;
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const d = String(date.getDate()).padStart(2, '0');
          return y + '-' + m + '-' + d === dateKey;
        };

        const setTheme = (value) => {
          root.classList.toggle('rpm-dark', value === 'dark');
          localStorage.setItem('rolanpro-mobile-theme', value);
        };
        setTheme(localStorage.getItem('rolanpro-mobile-theme') || 'light');

        const navItems = () => {
          const items = [
            { key: 'today', label: 'Сегодня', icon: '⌂' },
            ...(canSales ? [{ key: 'leads', label: 'Лиды', icon: '◎' }] : []),
            { key: 'projects', label: 'Проекты', icon: '▣' },
            { key: 'calendar', label: 'Календарь', icon: '□' },
            { key: 'more', label: 'Ещё', icon: '•••' },
          ];
          nav.innerHTML = items.map((item) =>
            '<button type="button" class="rpm-nav-btn ' + (state.screen === item.key ? 'is-active' : '') + '" data-rpm-screen="' + item.key + '">' +
              '<strong>' + item.icon + '</strong>' + escapeHtml(item.label) +
            '</button>'
          ).join('');
        };

        const pageHeader = (kicker, title, subtitle) =>
          '<p class="rpm-kicker">' + escapeHtml(kicker || '') + '</p>' +
          '<h1 class="rpm-title">' + escapeHtml(title) + '</h1>' +
          (subtitle ? '<div class="rpm-muted" style="margin-top:7px">' + escapeHtml(subtitle) + '</div>' : '');

        const metric = (value, label) =>
          '<div class="rpm-metric"><div class="rpm-metric-value">' + escapeHtml(value) + '</div>' +
          '<div class="rpm-metric-label">' + escapeHtml(label) + '</div></div>';

        const renderToday = () => {
          const todayKey = new Date().toISOString().slice(0, 10);
          const todayConsultations = state.consultations.filter((item) => sameLocalDay(item.scheduled_start_at, todayKey));
          const newLeads = state.leads.filter((item) => item?.pipeline_status?.status_code === 'NEW_LEAD').length;
          const activeProjects = canSales
            ? state.projects.filter((item) => item?.project_status?.status_code !== 'COMPLETED').length
            : (isInstaller ? state.installerJobs.filter((item) => item?.status !== 'completed').length : state.fieldOrders.length);
          const upcoming = state.consultations
            .filter((item) => new Date(item.scheduled_start_at).getTime() >= Date.now() - 60 * 60 * 1000)
            .sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime())
            .slice(0, 5);

          view.innerHTML =
            pageHeader('Рабочий день', 'Сегодня', context.user.full_name || context.user.email) +
            '<div class="rpm-grid">' +
              (canSales ? metric(newLeads, 'Новые лиды') : '') +
              metric(todayConsultations.length, 'Консультации сегодня') +
              metric(activeProjects, 'Активные проекты') +
              metric(canSales ? state.projects.filter((item) => item?.status_flags?.needs_attention).length : 0, 'Требуют внимания') +
            '</div>' +
            '<section class="rpm-section"><h2 class="rpm-section-title">Ближайшие консультации</h2>' +
            (upcoming.length
              ? upcoming.map((item) => consultationCard(item)).join('')
              : '<div class="rpm-empty">Ближайших консультаций нет.</div>') +
            '</section>';
        };

        const leadCard = (lead) => {
          const status = lead?.pipeline_status?.name_ru || lead?.pipeline_status?.name_en || 'Лид';
          return '<button type="button" class="rpm-list-card" data-rpm-lead="' + escapeHtml(lead.lead_id) + '">' +
            '<div class="rpm-row"><div class="rpm-grow"><div class="rpm-name">' + escapeHtml(safeText(lead.name, 'Без имени')) + '</div>' +
            '<div class="rpm-meta">' + escapeHtml([lead.phone, lead.email, lead.source].filter(Boolean).join(' · ') || 'Контакты не указаны') + '</div></div>' +
            '<span class="rpm-badge">' + escapeHtml(status) + '</span></div></button>';
        };

        const renderLeads = () => {
          const query = state.leadQuery.trim().toLowerCase();
          const filtered = state.leads.filter((lead) => {
            if (!query) return true;
            return [lead.name, lead.phone, lead.email, lead.source, lead.lead_code]
              .some((value) => String(value || '').toLowerCase().includes(query));
          });

          view.innerHTML =
            pageHeader('Продажи', 'Лиды', 'Новые обращения и текущие контакты') +
            '<div class="rpm-toolbar"><button type="button" class="rpm-btn blue" id="rpm-new-lead">+ Новый лид</button></div>' +
            '<div class="rpm-field rpm-search"><input id="rpm-lead-search" type="search" placeholder="Поиск по имени, телефону, email" value="' + escapeHtml(state.leadQuery) + '"></div>' +
            '<section class="rpm-section">' +
              (filtered.length ? filtered.map(leadCard).join('') : '<div class="rpm-empty">Лиды не найдены.</div>') +
            '</section>';
        };

        const renderLeadDetail = (lead) => {
          view.innerHTML =
            '<button class="rpm-back" type="button" data-rpm-back="leads">← Лиды</button>' +
            '<div style="margin-top:12px">' + pageHeader('Карточка лида', safeText(lead.name, 'Лид'), lead.lead_code || '') + '</div>' +
            '<div class="rpm-card"><div class="rpm-detail-list">' +
              detailRow('Статус', lead?.pipeline_status?.name_ru || lead?.pipeline_status?.status_code) +
              detailRow('Телефон', lead.phone) +
              detailRow('Email', lead.email) +
              detailRow('Источник', lead.source) +
              detailRow('Город', lead?.city?.name_ru || lead?.city?.name_en) +
              detailRow('Заметки', lead.notes) +
            '</div></div>' +
            '<div class="rpm-toolbar">' +
              (lead.phone ? '<a class="rpm-btn secondary" style="display:grid;place-items:center;text-decoration:none" href="tel:' + escapeHtml(lead.phone) + '">Позвонить</a>' : '') +
              (lead.email ? '<a class="rpm-btn secondary" style="display:grid;place-items:center;text-decoration:none" href="mailto:' + escapeHtml(lead.email) + '">Email</a>' : '') +
              '<button type="button" class="rpm-btn blue" id="rpm-edit-lead">Редактировать</button>' +
            '</div>';
        };

        const detailRow = (label, value) =>
          '<div class="rpm-detail-row"><div class="rpm-detail-label">' + escapeHtml(label) + '</div>' +
          '<div class="rpm-detail-value">' + escapeHtml(safeText(value)) + '</div></div>';

        const renderLeadForm = (lead) => {
          const editing = Boolean(lead?.lead_id);
          view.innerHTML =
            '<button class="rpm-back" type="button" data-rpm-back="' + (editing ? 'lead-detail' : 'leads') + '">← Назад</button>' +
            '<div style="margin-top:12px">' + pageHeader('Продажи', editing ? 'Редактировать лид' : 'Новый лид', 'Коротко и по делу') + '</div>' +
            '<form class="rpm-form" id="rpm-lead-form">' +
              field('Имя *', 'name', lead?.name || '', 'text') +
              field('Телефон', 'phone', lead?.phone || '', 'tel') +
              field('Email', 'email', lead?.email || '', 'email') +
              field('Источник', 'source', lead?.source || '', 'text') +
              '<div class="rpm-field"><label for="rpm-notes">Заметки</label><textarea id="rpm-notes" name="notes">' + escapeHtml(lead?.notes || '') + '</textarea></div>' +
              '<button class="rpm-btn blue full" type="submit">' + (editing ? 'Сохранить' : 'Создать лид') + '</button>' +
            '</form>';
        };

        const field = (label, name, value, type) =>
          '<div class="rpm-field"><label for="rpm-' + name + '">' + escapeHtml(label) + '</label>' +
          '<input id="rpm-' + name + '" name="' + name + '" type="' + type + '" value="' + escapeHtml(value) + '"></div>';

        const projectCard = (project) => {
          const status = project?.project_status?.name_ru || project?.project_status?.status_code || 'Проект';
          const when = project.install_date ? formatDate(project.install_date, false) : 'Дата не назначена';
          return '<button type="button" class="rpm-list-card" data-rpm-project="' + escapeHtml(project.project_id) + '">' +
            '<div class="rpm-row"><div class="rpm-grow"><div class="rpm-name">' + escapeHtml(safeText(project.title, project.project_code)) + '</div>' +
            '<div class="rpm-meta">' + escapeHtml([project.project_code, project.address, when].filter(Boolean).join(' · ')) + '</div></div>' +
            '<span class="rpm-badge">' + escapeHtml(status) + '</span></div></button>';
        };

        const installerJobCard = (job) => {
          const project = job?.project || {};
          const when = job?.schedule?.date || project.install_date;
          return '<button type="button" class="rpm-list-card" data-rpm-installer-job="' + escapeHtml(job.installer_job_id) + '">' +
            '<div class="rpm-row"><div class="rpm-grow"><div class="rpm-name">' + escapeHtml(safeText(project.title, project.project_code || 'Работа')) + '</div>' +
            '<div class="rpm-meta">' + escapeHtml([project.project_code, project.address, when ? formatDate(when, false) : null, job?.position?.title].filter(Boolean).join(' · ')) + '</div></div>' +
            '<span class="rpm-badge">' + escapeHtml(safeText(job.status, 'assigned')) + '</span></div></button>';
        };

        const fieldOrderCard = (order) => {
          const client = state.fieldClients?.find((item) => String(item.id || '') === String(order.clientId || ''));
          const title = order.title || order.projectName || order.name || order.orderNo || order.id;
          const date = order.installDate || order.measurementDate || order.date || order.scheduledAt;
          return '<button type="button" class="rpm-list-card" data-rpm-field-order="' + escapeHtml(order.id) + '">' +
            '<div class="rpm-row"><div class="rpm-grow"><div class="rpm-name">' + escapeHtml(safeText(title, 'Назначенная работа')) + '</div>' +
            '<div class="rpm-meta">' + escapeHtml([client?.name, order.address || client?.serviceAddress || client?.address, date ? formatDate(date, false) : null].filter(Boolean).join(' · ')) + '</div></div>' +
            '<span class="rpm-badge">' + escapeHtml(safeText(order.status, 'assigned')) + '</span></div></button>';
        };

        const renderProjects = () => {
          const cards = canSales
            ? state.projects.map(projectCard)
            : (isInstaller ? state.installerJobs.map(installerJobCard) : state.fieldOrders.map(fieldOrderCard));
          view.innerHTML =
            pageHeader('Работа', canSales ? 'Проекты' : 'Мои работы', canSales ? 'Актуальные проекты из общей CRM' : 'Только назначенные вам работы') +
            '<section class="rpm-section">' +
              (cards.length ? cards.join('') : '<div class="rpm-empty">Назначенных работ пока нет.</div>') +
            '</section>';
        };

        const renderProjectDetail = (project) => {
          view.innerHTML =
            '<button class="rpm-back" type="button" data-rpm-back="projects">← Проекты</button>' +
            '<div style="margin-top:12px">' + pageHeader('Проект', safeText(project.title, project.project_code), project.project_code || '') + '</div>' +
            '<div class="rpm-card"><div class="rpm-detail-list">' +
              detailRow('Статус', project?.project_status?.name_ru || project?.project_status?.status_code) +
              detailRow('Клиент', project?.client?.name) +
              detailRow('Адрес', project.address || project?.client?.service_address) +
              detailRow('Дата монтажа', project.install_date ? formatDate(project.install_date, false) : null) +
              detailRow('Услуги', project.service_summary) +
              detailRow('Позиций', project.positions_count) +
              detailRow('Монтажники', Array.isArray(project.assigned_installers) ? project.assigned_installers.map((item) => item.full_name).join(', ') : '') +
            '</div></div>';
        };

        const renderInstallerJobDetail = (job) => {
          const project = job?.project || {};
          view.innerHTML =
            '<button class="rpm-back" type="button" data-rpm-back="projects">← Мои работы</button>' +
            '<div style="margin-top:12px">' + pageHeader('Монтаж', safeText(project.title, project.project_code || 'Работа'), project.project_code || '') + '</div>' +
            '<div class="rpm-card"><div class="rpm-detail-list">' +
              detailRow('Статус', job.status) +
              detailRow('Клиент', project?.client?.name) +
              detailRow('Телефон', project?.client?.phone) +
              detailRow('Адрес', project.address) +
              detailRow('Дата', job?.schedule?.date ? formatDate(job.schedule.date, false) : (project.install_date ? formatDate(project.install_date, false) : null)) +
              detailRow('Работа', job?.position?.title || job?.position?.service_type?.name_ru) +
              detailRow('Заметки', job?.position?.notes) +
            '</div></div>' +
            ((project?.client?.phone || project.address)
              ? '<div class="rpm-toolbar">' +
                  (project?.client?.phone ? '<a class="rpm-btn secondary" style="display:grid;place-items:center;text-decoration:none" href="tel:' + escapeHtml(project.client.phone) + '">Позвонить</a>' : '') +
                  (project.address ? '<a class="rpm-btn blue" style="display:grid;place-items:center;text-decoration:none" href="https://maps.apple.com/?q=' + encodeURIComponent(project.address) + '">Маршрут</a>' : '') +
                '</div>'
              : '');
        };

        const renderFieldOrderDetail = (order) => {
          const client = state.fieldClients?.find((item) => String(item.id || '') === String(order.clientId || ''));
          const title = order.title || order.projectName || order.name || order.orderNo || order.id;
          view.innerHTML =
            '<button class="rpm-back" type="button" data-rpm-back="projects">← Мои работы</button>' +
            '<div style="margin-top:12px">' + pageHeader('Назначенная работа', safeText(title, 'Работа'), order.orderNo || '') + '</div>' +
            '<div class="rpm-card"><div class="rpm-detail-list">' +
              detailRow('Статус', order.status) +
              detailRow('Клиент', client?.name) +
              detailRow('Телефон', client?.phone) +
              detailRow('Адрес', order.address || client?.serviceAddress || client?.address) +
              detailRow('Заметки', order.technicalNotes || order.measurerNotes || order.installerNotes || order.notes) +
            '</div></div>' +
            (client?.phone ? '<div class="rpm-toolbar"><a class="rpm-btn blue" style="display:grid;place-items:center;text-decoration:none" href="tel:' + escapeHtml(client.phone) + '">Позвонить клиенту</a></div>' : '');
        };

        const consultationCard = (item) => {
          const customer = item?.client?.name || item?.lead?.name || item?.deal?.title || '';
          return '<button type="button" class="rpm-list-card" data-rpm-consultation="' + escapeHtml(item.consultation_id) + '">' +
            '<div class="rpm-row"><div class="rpm-grow"><div class="rpm-name">' + escapeHtml(safeText(item.title, 'Консультация')) + '</div>' +
            '<div class="rpm-meta">' + escapeHtml([formatDate(item.scheduled_start_at, true), customer, item.location_address].filter(Boolean).join(' · ')) + '</div></div>' +
            '<span class="rpm-badge">' + escapeHtml(safeText(item.status, 'scheduled')) + '</span></div></button>';
        };

        const renderCalendar = () => {
          const selectedConsultations = state.consultations.filter((item) => sameLocalDay(item.scheduled_start_at, state.calendarDate));
          const selectedJobs = state.installerJobs.filter((item) => {
            const date = item?.schedule?.date || item?.project?.install_date;
            return date && sameLocalDay(date, state.calendarDate);
          });
          const rows = isInstaller ? selectedJobs.map(installerJobCard) : selectedConsultations.map(consultationCard);
          view.innerHTML =
            pageHeader('Расписание', 'Календарь', isInstaller ? 'Назначенные монтажные работы' : 'Консультации и выезды') +
            '<div class="rpm-field rpm-day-picker"><label for="rpm-calendar-date">Дата</label><input id="rpm-calendar-date" type="date" value="' + escapeHtml(state.calendarDate) + '"></div>' +
            '<section class="rpm-section">' +
              (rows.length ? rows.join('') : '<div class="rpm-empty">На эту дату событий нет.</div>') +
            '</section>';
        };

        const renderConsultationDetail = (item) => {
          view.innerHTML =
            '<button class="rpm-back" type="button" data-rpm-back="calendar">← Календарь</button>' +
            '<div style="margin-top:12px">' + pageHeader('Консультация', safeText(item.title, 'Консультация'), formatDate(item.scheduled_start_at, true)) + '</div>' +
            '<div class="rpm-card"><div class="rpm-detail-list">' +
              detailRow('Статус', item.status) +
              detailRow('Клиент', item?.client?.name || item?.lead?.name || item?.deal?.title) +
              detailRow('Телефон', item?.client?.phone || item?.lead?.phone) +
              detailRow('Адрес', item.location_address || item?.client?.service_address) +
              detailRow('Начало', formatDate(item.scheduled_start_at, true)) +
              detailRow('Консультант', item?.assigned_consultant?.full_name) +
              detailRow('Заметки', item.manager_notes || item.consultant_notes) +
            '</div></div>' +
            ((item?.client?.phone || item?.lead?.phone)
              ? '<div class="rpm-toolbar"><a class="rpm-btn blue" style="display:grid;place-items:center;text-decoration:none" href="tel:' + escapeHtml(item?.client?.phone || item?.lead?.phone) + '">Позвонить клиенту</a></div>'
              : '');
        };

        const renderMore = () => {
          const primaryRole = roles[0] || 'EMPLOYEE';
          const dark = localStorage.getItem('rolanpro-mobile-theme') === 'dark';
          view.innerHTML =
            pageHeader('Аккаунт', 'Ещё', 'Профиль и настройки') +
            '<div class="rpm-card"><div class="rpm-name">' + escapeHtml(context.user.full_name || 'Сотрудник') + '</div>' +
              '<div class="rpm-meta">' + escapeHtml(context.user.email) + ' · ' + escapeHtml(primaryRole) + '</div></div>' +
            '<section class="rpm-section"><h2 class="rpm-section-title">Настройки</h2>' +
              '<div class="rpm-card">' +
                '<div class="rpm-split"><div><div class="rpm-name">Тёмная тема</div><div class="rpm-meta">Только для мобильного интерфейса</div></div>' +
                  '<button type="button" class="rpm-btn secondary" id="rpm-theme">' + (dark ? 'Светлая' : 'Тёмная') + '</button></div>' +
                '<div style="height:1px;background:var(--rpm-line);margin:14px 0"></div>' +
                '<a class="rpm-btn secondary full" style="display:grid;place-items:center;text-decoration:none" href="/change-password">Изменить пароль</a>' +
              '</div>' +
            '</section>' +
            '<section class="rpm-section">' +
              '<button type="button" class="rpm-btn secondary full" id="rpm-desktop">Открыть полную desktop CRM</button>' +
              '<div style="height:10px"></div>' +
              '<button type="button" class="rpm-btn danger full" id="rpm-logout">Выйти</button>' +
            '</section>';
        };

        const renderError = () => {
          if (!state.error) return;
          view.insertAdjacentHTML('afterbegin', '<div class="rpm-error">' + escapeHtml(state.error) + '</div>');
        };

        const render = () => {
          navItems();
          if (state.busy) {
            view.innerHTML = '<div class="rpm-loading">Загрузка…</div>';
            return;
          }
          if (state.screen === 'today') renderToday();
          else if (state.screen === 'leads') renderLeads();
          else if (state.screen === 'lead-detail' && state.selectedLead) renderLeadDetail(state.selectedLead);
          else if (state.screen === 'lead-form') renderLeadForm(state.selectedLead);
          else if (state.screen === 'projects') renderProjects();
          else if (state.screen === 'project-detail' && state.selectedProject) {
            if (state.selectedProject.__mobile_kind === 'installer_job') renderInstallerJobDetail(state.selectedProject);
            else if (state.selectedProject.__mobile_kind === 'field_order') renderFieldOrderDetail(state.selectedProject);
            else renderProjectDetail(state.selectedProject);
          }
          else if (state.screen === 'calendar') renderCalendar();
          else if (state.screen === 'consultation-detail' && state.selectedConsultation) renderConsultationDetail(state.selectedConsultation);
          else renderMore();
          renderError();
        };

        const reload = async () => {
          state.busy = true;
          state.error = '';
          render();
          try {
            if (canSales) {
              const [leadsData, projectsData, consultationsData] = await Promise.all([
                api('/api/v1/leads'),
                api('/api/v1/projects'),
                api('/api/v1/consultations'),
              ]);
              state.leads = Array.isArray(leadsData?.items) ? leadsData.items : [];
              state.projects = Array.isArray(projectsData?.items) ? projectsData.items : [];
              state.consultations = Array.isArray(consultationsData?.items) ? consultationsData.items : [];
            } else if (isConsultant) {
              const [workspaceData, consultationsData] = await Promise.all([
                api('/api/v1/legacy-crm/state'),
                api('/api/v1/consultations'),
              ]);
              const payload = workspaceData?.payload || {};
              state.fieldOrders = Array.isArray(payload.orders) ? payload.orders : [];
              state.fieldClients = Array.isArray(payload.clients) ? payload.clients : [];
              state.consultations = Array.isArray(consultationsData?.items) ? consultationsData.items : [];
            } else if (isInstaller) {
              const [workspaceData, jobsData] = await Promise.all([
                api('/api/v1/legacy-crm/state'),
                api('/api/v1/installer-jobs/my'),
              ]);
              const payload = workspaceData?.payload || {};
              state.fieldOrders = Array.isArray(payload.orders) ? payload.orders : [];
              state.fieldClients = Array.isArray(payload.clients) ? payload.clients : [];
              state.installerJobs = Array.isArray(jobsData?.items) ? jobsData.items : [];
            }
          } catch (error) {
            state.error = error instanceof Error ? error.message : 'Не удалось загрузить CRM.';
          } finally {
            state.busy = false;
            render();
          }
        };

        nav.addEventListener('click', (event) => {
          const button = event.target.closest('[data-rpm-screen]');
          if (!button) return;
          const target = button.getAttribute('data-rpm-screen');
          if (!target) return;
          state.screen = target;
          state.selectedLead = null;
          state.selectedProject = null;
          state.selectedConsultation = null;
          state.error = '';
          render();
        });

        view.addEventListener('click', async (event) => {
          const back = event.target.closest('[data-rpm-back]');
          if (back) {
            const target = back.getAttribute('data-rpm-back');
            state.screen = target === 'lead-detail' && state.selectedLead ? 'lead-detail' : (target || 'today');
            state.error = '';
            render();
            return;
          }

          const leadButton = event.target.closest('[data-rpm-lead]');
          if (leadButton) {
            const id = leadButton.getAttribute('data-rpm-lead');
            state.selectedLead = state.leads.find((item) => item.lead_id === id) || null;
            state.screen = 'lead-detail';
            render();
            return;
          }

          const projectButton = event.target.closest('[data-rpm-project]');
          if (projectButton) {
            const id = projectButton.getAttribute('data-rpm-project');
            state.busy = true;
            render();
            try {
              const data = await api('/api/v1/projects/' + encodeURIComponent(id));
              state.selectedProject = data.project || null;
              state.screen = 'project-detail';
            } catch (error) {
              state.error = error instanceof Error ? error.message : 'Не удалось открыть проект.';
              state.screen = 'projects';
            } finally {
              state.busy = false;
              render();
            }
            return;
          }

          const installerJobButton = event.target.closest('[data-rpm-installer-job]');
          if (installerJobButton) {
            const id = installerJobButton.getAttribute('data-rpm-installer-job');
            const job = state.installerJobs.find((item) => item.installer_job_id === id) || null;
            state.selectedProject = job ? { ...job, __mobile_kind: 'installer_job' } : null;
            state.screen = state.selectedProject ? 'project-detail' : 'projects';
            render();
            return;
          }

          const fieldOrderButton = event.target.closest('[data-rpm-field-order]');
          if (fieldOrderButton) {
            const id = fieldOrderButton.getAttribute('data-rpm-field-order');
            const order = state.fieldOrders.find((item) => String(item.id || '') === String(id || '')) || null;
            state.selectedProject = order ? { ...order, __mobile_kind: 'field_order' } : null;
            state.screen = state.selectedProject ? 'project-detail' : 'projects';
            render();
            return;
          }

          const consultationButton = event.target.closest('[data-rpm-consultation]');
          if (consultationButton) {
            const id = consultationButton.getAttribute('data-rpm-consultation');
            state.busy = true;
            render();
            try {
              const data = await api('/api/v1/consultations/' + encodeURIComponent(id));
              state.selectedConsultation = data.consultation || null;
              state.screen = 'consultation-detail';
            } catch (error) {
              state.error = error instanceof Error ? error.message : 'Не удалось открыть консультацию.';
              state.screen = 'calendar';
            } finally {
              state.busy = false;
              render();
            }
            return;
          }

          if (event.target.closest('#rpm-new-lead')) {
            state.selectedLead = null;
            state.screen = 'lead-form';
            render();
            return;
          }

          if (event.target.closest('#rpm-edit-lead') && state.selectedLead) {
            state.screen = 'lead-form';
            render();
            return;
          }

          if (event.target.closest('#rpm-theme')) {
            setTheme(localStorage.getItem('rolanpro-mobile-theme') === 'dark' ? 'light' : 'dark');
            render();
            return;
          }

          if (event.target.closest('#rpm-desktop')) {
            window.location.assign('/legacy-crm?desktop=1');
            return;
          }

          if (event.target.closest('#rpm-logout')) {
            try {
              await api('/api/v1/auth/logout', { method: 'POST' });
            } finally {
              window.location.assign('/login');
            }
          }
        });

        view.addEventListener('input', (event) => {
          if (event.target?.id === 'rpm-lead-search') {
            state.leadQuery = event.target.value || '';
            renderLeads();
          }
        });

        view.addEventListener('change', (event) => {
          if (event.target?.id === 'rpm-calendar-date') {
            state.calendarDate = event.target.value || state.calendarDate;
            renderCalendar();
          }
        });

        view.addEventListener('submit', async (event) => {
          if (event.target?.id !== 'rpm-lead-form') return;
          event.preventDefault();
          const form = new FormData(event.target);
          const payload = {
            name: String(form.get('name') || '').trim(),
            phone: String(form.get('phone') || '').trim() || null,
            email: String(form.get('email') || '').trim() || null,
            source: String(form.get('source') || '').trim() || null,
            notes: String(form.get('notes') || '').trim() || null,
          };
          if (!payload.name) {
            state.error = 'Укажите имя клиента.';
            render();
            return;
          }

          state.busy = true;
          state.error = '';
          render();
          try {
            if (state.selectedLead?.lead_id) {
              await api('/api/v1/leads/' + encodeURIComponent(state.selectedLead.lead_id), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
            } else {
              await api('/api/v1/leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
            }
            const leadsData = await api('/api/v1/leads');
            state.leads = Array.isArray(leadsData.items) ? leadsData.items : [];
            if (state.selectedLead?.lead_id) {
              state.selectedLead = state.leads.find((item) => item.lead_id === state.selectedLead.lead_id) || null;
              state.screen = state.selectedLead ? 'lead-detail' : 'leads';
            } else {
              state.selectedLead = null;
              state.screen = 'leads';
            }
          } catch (error) {
            state.error = error instanceof Error ? error.message : 'Не удалось сохранить лид.';
            state.screen = 'lead-form';
          } finally {
            state.busy = false;
            render();
          }
        });

        refresh.addEventListener('click', reload);
        reload();
      })();
    </script>
  \`;
}
