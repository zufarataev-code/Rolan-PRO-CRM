/**
 * The owner's «Кабинет проекта» example (2026-11-17) as ONE interface layer for
 * every tab of the CRM: a light green-tinted ground, white rounded cards with a
 * soft shadow, a light glass menu with a green marker on the active item, a
 * glass top bar with a serif page title, green gradient primary buttons, calm
 * rounded inputs, pill-shaped chips.
 *
 * Owner, 2026-11-17: «то дизайнерское и интерфейсное решение должно быть
 * реализовано в нашей CRM … без изменения нашей логики … всё в едином слое».
 * So this is presentation only. No section, calculation, status, role or
 * layout grid is changed, and nothing is hidden. Meaning colours (status
 * chips, direction colours, the entity colour code) stay as they are.
 *
 * It is injected last, after the canvas theme (design-theme.ts) and the
 * «Пульс» theme (pulse-theme.ts), and re-colours their tokens. It applies to
 * every role by default. «Прежний стиль» in the top bar sets
 * <html data-rp-style="classic"> on that device and switches the layer off.
 */
import { BEFORE_PAINT_SCRIPT } from "./before-paint";

const ON = 'html:not([data-rp-style="classic"])';
const SHELL = `${ON} body .app-shell`;

const FONTS =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&display=swap">';

export const INTERFACE_LAYER_CSS = `
${ON} {
  --rp-blue: #178A52;
  --rp-cyan: #34BD79;
  --rp-gradient: linear-gradient(135deg, #34BD79, #178A52);
  --rp-ground: radial-gradient(1100px 620px at 100% -12%, rgba(52,189,121,.20), transparent 60%),
    radial-gradient(900px 700px at -12% 112%, rgba(90,170,200,.14), transparent 62%),
    linear-gradient(180deg, #F4F8F5, #EDF3EF);
  --rp-hero: radial-gradient(460px 280px at 108% -12%, rgba(52,189,121,.55), transparent 70%),
    radial-gradient(340px 240px at -12% 125%, rgba(23,138,82,.5), transparent 70%),
    linear-gradient(135deg, #1B4634 0%, #0B2018 100%);
  --rp-card-shadow: 0 1px 2px rgba(16,60,38,.05), 0 10px 28px -16px rgba(16,60,38,.22);
  --rp-card-shadow-hover: 0 2px 4px rgba(16,60,38,.06), 0 18px 36px -18px rgba(16,60,38,.34);
  --rp-line: #DFEAE3;
  --rp-input: #F3F8F5;
  --brand-blue: #178A52;
  --brand-blue-dark: #0F6B3E;
  --brand-accent: #34BD79;
  --brand-light: #E8F5EE;
  --bg: #EFF4F1;
  --border: #DFEAE3;
  --text: #11261B;
  --text-muted: #5F7468;
  --rpx-display: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
  --rpx-glass: rgba(255,255,255,.80);
  --rpx-sunk: rgba(16,60,38,.045);
}
${ON} body { background: #EDF3EF; color: var(--text); }
${SHELL} {
  --radius: 14px; --radius-sm: 10px; --radius-lg: 16px;
  --rp-ground: radial-gradient(1100px 620px at 100% -12%, rgba(52,189,121,.20), transparent 60%),
    radial-gradient(900px 700px at -12% 112%, rgba(90,170,200,.14), transparent 62%),
    linear-gradient(180deg, #F4F8F5, #EDF3EF);
  --rp-input: #F3F8F5;
  --rp-gradient: linear-gradient(135deg, #34BD79, #178A52);
  --rp-line: #DFEAE3;
}

/* Menu: a light glass card, as in the example. */
${SHELL} .app-sidebar {
  background: var(--rpx-glass);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-right: 1px solid var(--rp-line);
  box-shadow: 8px 0 28px -22px rgba(16,60,38,.35);
  color: var(--text);
}
${SHELL} .app-sidebar::before,
${SHELL} .app-sidebar::after { display: none; }
${SHELL} .sidebar-brand { border-bottom-color: var(--rp-line); }
${SHELL} .sidebar-brand .text-slate-400 { color: var(--text-muted); }
${SHELL} .sidebar-logo-panel { background: transparent; box-shadow: none; }
${SHELL} .app-sidebar .border-slate-700 { border-color: var(--rp-line); }
${SHELL} .app-sidebar .nav-item {
  color: var(--text-muted);
  border-radius: 10px !important;
  margin: 0 2px;
}
${SHELL} .app-sidebar .nav-item:hover { background: var(--rpx-sunk); color: var(--text); }
${SHELL} .app-sidebar .nav-item.active {
  background: rgba(23,138,82,.10);
  color: var(--text);
  box-shadow: inset 3px 0 0 #1C9A5C, inset 0 0 0 1px rgba(23,138,82,.14);
}
${SHELL} .app-sidebar .nav-item.active .nav-icon { color: #178A52; }
${SHELL} .sidebar-user { background: var(--rpx-sunk); border-color: var(--rp-line); border-radius: 12px; color: var(--text); }
${SHELL} .sidebar-user .text-slate-400,
${SHELL} .sidebar-user-meta > :last-child { color: var(--text-muted); }
${SHELL} .sidebar-avatar { background: var(--rp-gradient); border-radius: 10px; color: #fff; }
${SHELL} .sidebar-toggle-btn { background: var(--rpx-sunk); border-color: var(--rp-line); color: var(--text-muted); border-radius: 10px; }
${SHELL} .app-sidebar input,
${SHELL} .app-sidebar select { background-color: #fff; border-color: var(--rp-line); color: var(--text); }

/* Top bar: glass, with the page title in the display face. */
${SHELL} .app-topbar {
  background: var(--rpx-glass);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-bottom: 1px solid var(--rp-line);
}
${SHELL} .topbar-eyebrow { color: var(--text-muted); }
${SHELL} .topbar-title h1 { font-family: var(--rpx-display); font-weight: 700; font-size: 26px; letter-spacing: 0; color: var(--text); }
${SHELL} .topbar-search input { border-radius: 12px !important; border-color: var(--rp-line); background: #fff; box-shadow: none; }
${SHELL} .topbar-icon-btn { border-radius: 10px; border-color: var(--rp-line); }
${SHELL} .topbar-user-pill { border-radius: 12px; border-color: var(--rp-line); background: #fff; }

/* Surfaces: white rounded cards with a soft shadow. */
${SHELL} :is(.card, .pw-panel, .pw-funnel, .orders-command-panel, .calendar-toolbar, .dispatch-workspace, .calendar-month-workspace) {
  border-radius: 14px !important;
  border-color: var(--rp-line);
  box-shadow: var(--rp-card-shadow);
}
${SHELL} .card:hover { box-shadow: var(--rp-card-shadow-hover); }
${SHELL} :is(.pw-today-head h2, .pw-panel-head h3, .calendar-period-title) { font-family: var(--rpx-display); font-weight: 700; letter-spacing: 0; }
${SHELL} .pw-today-kicker { color: #178A52; }

/* Every tab uses the same corner scale, whatever the screen calls its blocks. */
${SHELL} .app-content :is([class*="card"], [class*="panel"], [class*="tile"]):not([class*="kanban-card-main"]) { border-radius: 12px !important; }
${SHELL} .app-content :is([class*="kpi"], [class*="summary"], [class*="stage-chip"], [class*="stage-pill"], [class*="-step"]):not([class*="bar"]):not(svg) { border-radius: 10px !important; }
${ON} body:has(.app-shell) :is(.app-content, .modal-content) .rounded { border-radius: 8px; }
${ON} body:has(.app-shell) :is(.app-content, .modal-content) :is(.rounded-md, .rounded-lg) { border-radius: 10px; }
${ON} body:has(.app-shell) :is(.app-content, .modal-content) .rounded-xl { border-radius: 12px; }
${ON} body:has(.app-shell) :is(.app-content, .modal-content) :is(.rounded-2xl, .rounded-3xl) { border-radius: 14px; }

/* Buttons, inputs, chips. */
${SHELL} .btn-primary,
${ON} body:has(.app-shell) .modal-content .btn-primary {
  background: var(--rp-gradient) !important;
  border-radius: 10px !important;
  box-shadow: 0 10px 22px -14px rgba(23,138,82,.9);
}
${SHELL} .btn-ghost,
${ON} body:has(.app-shell) .modal-content .btn-ghost { border-radius: 10px !important; border-color: var(--rp-line); }
${SHELL} .btn-ghost:hover { background: #E8F5EE; border-color: rgba(23,138,82,.2); }
${SHELL} .btn-danger { border-radius: 10px !important; }
${SHELL} :is(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), select, textarea),
${ON} body:has(.app-shell) .modal-content :is(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), select, textarea) {
  border-radius: 10px !important;
  border-color: var(--rp-line);
}
${ON} body :is(input, select, textarea):focus { border-color: #34BD79; box-shadow: 0 0 0 3px rgba(52,189,121,.22); }
${SHELL} :is(button, input, select, textarea):focus-visible { outline-color: #34BD79; }
${SHELL} :is(.tag, .status-badge, .chip) { border-radius: 999px !important; }
${ON} body:has(.app-shell) .modal-content { border-radius: 16px !important; box-shadow: 0 30px 80px -30px rgba(8,26,18,.55); }
${ON} body .modal-backdrop { background: rgba(8,26,18,.40); }

/* Switches (period, mode, role): one shape everywhere. */
${SHELL} :is([class*="-toggle"], [class*="-switch"]):has(> button) {
  border-radius: 12px !important;
  border-color: var(--rp-line);
  background: var(--rpx-sunk);
  padding: 3px;
}
${SHELL} :is([class*="-toggle"], [class*="-switch"]) > button { border-radius: 9px !important; }
${SHELL} :is([class*="-toggle"], [class*="-switch"]) > button.active { background: var(--rp-gradient) !important; color: #fff !important; box-shadow: none; }

/* Projects: totals, funnel columns and project cards. */
${SHELL} .orders-kpi-card { border-radius: 14px !important; border-color: var(--rp-line); background: #fff; box-shadow: var(--rp-card-shadow); }
${SHELL} .kanban-column { border-radius: 14px !important; border-color: var(--rp-line); background: rgba(255,255,255,.62); overflow: hidden; }
${SHELL} :is(.kanban-card, .kanban-card-main) { border-radius: 12px !important; }
${SHELL} .kanban-card { box-shadow: var(--rp-card-shadow); }

/* «Пульс бизнеса». */
${ON} body .pulse-dashboard { color: var(--text); }
${ON} body .pulse-heading h2 { font-family: var(--rpx-display); font-weight: 700; font-size: 36px; letter-spacing: 0; }
${ON} body .pulse-heading > span,
${ON} body .pulse-heading p { color: var(--text-muted); }
${ON} body .pulse-period { border-radius: 12px; border-color: var(--rp-line); background: var(--rpx-sunk); padding: 3px; overflow: hidden; }
${ON} body .pulse-period button { border-radius: 9px !important; color: var(--text-muted); }
${ON} body .pulse-period button.active { background: var(--rp-gradient); color: #fff; }
${ON} body .pulse-revenue { border-radius: 14px; border-color: var(--rp-line); box-shadow: var(--rp-card-shadow); }
${ON} body .pulse-total { color: #178A52; font-family: var(--rpx-display); letter-spacing: 0; }
${ON} body .pulse-metric { border-radius: 12px !important; }
${ON} body .pulse-metric:hover { background: var(--rpx-sunk); }
${ON} body .pulse-report-link { background: var(--rp-gradient); border-radius: 12px !important; }
${ON} body .pulse-chart i,
${ON} body .pulse-chart .pulse-bar { background: var(--rp-gradient); border-radius: 6px 6px 2px 2px; }

/* Calendar. */
${SHELL} .calendar-nav-button { border-radius: 10px; color: #178A52; }
${SHELL} .calendar-nav-button:hover,
${SHELL} .calendar-nav-button:focus-visible { border-color: rgba(23,138,82,.28); background: #E8F5EE; }
${SHELL} .calendar-mode-switch { border-radius: 12px; }
${SHELL} .calendar-mode-switch button { border-radius: 9px !important; }
${SHELL} .calendar-mode-switch button.active { background: var(--rp-gradient); box-shadow: none; }
${SHELL} .dispatch-week-head .today,
${SHELL} .calendar-month-cell.today { background: rgba(52,189,121,.11); color: #178A52; }
${SHELL} .calendar-month-cell.today { box-shadow: inset 0 0 0 2px rgba(52,189,121,.55); }
${SHELL} .dispatch-day-column.today { background-color: rgba(52,189,121,.05); }
${SHELL} :is(.calendar-event-card, .dispatch-event) { border-radius: 10px !important; }

/* Brand blue of the old look, where screens name it through utility classes.
   Tints (-50, -100) are left alone: status chips use them for meaning. */
${SHELL} :is(.bg-blue-600, .bg-blue-700, .bg-sky-600) { background-color: #178A52 !important; }
${SHELL} :is(.hover\\:bg-blue-700:hover, .hover\\:bg-blue-800:hover) { background-color: #0F6B3E !important; }
${SHELL} :is(.border-blue-600, .border-blue-500) { border-color: #1C9A5C !important; }

/* Phone header: the same deep green as the hero blocks. */
${ON} body .pulse-mobile-header { background: linear-gradient(135deg, #1B4634 0%, #0B2018 100%) !important; }
${ON} body .pulse-mobile-header button { border-radius: 10px !important; }

/* Phone dock. */
${ON} body .mobile-primary-nav { background: rgba(255,255,255,.90); border-top-color: var(--rp-line); box-shadow: 0 -10px 30px -16px rgba(16,60,38,.3); }
${ON} body .mobile-primary-nav button { color: var(--text-muted); border-radius: 12px !important; }
${ON} body .mobile-primary-nav button.active { color: #178A52; }
${ON} body .mobile-fab { border-radius: 14px !important; background: var(--rp-gradient); box-shadow: 0 14px 28px -10px rgba(23,138,82,.9), 0 0 0 5px #F4F8F5; }

.rolanpro-style-toggle { display: block; width: 100%; margin-top: 6px; padding: 6px 10px; border: 0; background: none; font-size: 11.5px; font-weight: 600; color: inherit; opacity: .6; text-align: left; white-space: nowrap; cursor: pointer; }
.rolanpro-style-toggle:hover { opacity: 1; text-decoration: underline; }
.sidebar-collapsed .rolanpro-style-toggle { display: none; }
`;

/** Applies the saved choice and keeps one switch in the top bar across re-renders. */
export const INTERFACE_LAYER_SCRIPT = `
    <script>
      (() => {
        const KEY = 'rp_style';
        let current = '';
        try { current = localStorage.getItem(KEY) === 'classic' ? 'classic' : ''; } catch (error) { current = ''; }
        const apply = () => {
          if (current === 'classic') document.documentElement.setAttribute('data-rp-style', 'classic');
          else document.documentElement.removeAttribute('data-rp-style');
        };
        apply();

        // The switch sits under «Выйти» in the menu: every role has the menu, on
        // a phone too, and the top bar stays as it was.
        function ensureStyleToggle() {
          const logout = document.querySelector('.app-sidebar .sidebar-logout-label');
          const host = logout ? logout.closest('button')?.parentElement : null;
          if (!host) return;
          let button = host.querySelector('[data-rolanpro-style-toggle="1"]');
          if (!button) {
            button = document.createElement('button');
            button.type = 'button';
            button.className = 'rolanpro-style-toggle';
            button.setAttribute('data-rolanpro-style-toggle', '1');
            button.addEventListener('click', () => window.rolanproToggleStyle());
            host.appendChild(button);
          }
          const label = current === 'classic' ? 'Новый стиль' : 'Прежний стиль';
          if (button.textContent !== label) button.textContent = label;
          // The new interface (/crm): one admin template for every screen. Office roles only.
          let office = false;
          try { office = ['owner', 'manager'].includes(currentUser()?.role); } catch (error) { office = false; }
          let next = host.querySelector('[data-rolanpro-crm-next="1"]');
          if (office && !next) {
            next = document.createElement('a');
            next.href = '/crm';
            next.className = 'rolanpro-style-toggle';
            next.setAttribute('data-rolanpro-crm-next', '1');
            next.textContent = 'Новый интерфейс';
            next.style.cssText = 'display:block;text-align:center;text-decoration:none;font-weight:700';
            host.insertBefore(next, button);
          } else if (!office && next) next.remove();
        }

        window.rolanproToggleStyle = function rolanproToggleStyle() {
          current = current === 'classic' ? '' : 'classic';
          try {
            if (current) localStorage.setItem(KEY, current);
            else localStorage.removeItem(KEY);
          } catch (error) { /* private mode: the choice lasts until the page is closed */ }
          apply();
          ensureStyleToggle();
        };

${BEFORE_PAINT_SCRIPT}
        const observer = new MutationObserver(() => beforePaint(ensureStyleToggle));
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.requestAnimationFrame(ensureStyleToggle);
      })();
    </script>
`;

export const INTERFACE_LAYER_HTML = `${FONTS}<style id="rolanpro-interface-layer">${INTERFACE_LAYER_CSS}</style>${INTERFACE_LAYER_SCRIPT}`;
