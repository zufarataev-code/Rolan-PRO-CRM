/**
 * Selected «Пульс бизнеса» direction: the phone presentation for owner and
 * manager. The owner chose «телефон — Пульс, компьютер — CRM 2.0» (2026-10-04),
 * so its colours apply on phones only; the dashboard styles stay global because
 * the Pulse overview is rendered wherever it is shown.
 */
export const PULSE_THEME_CSS = `
html body:has(.app-shell:is(.role-owner,.role-manager)) :is(.erp-intake-card,.order-service-card,.erp-intake-disclosure,.erp-intake-footer,.order-client-panel) { border-radius: 0 !important; }
.pulse-mobile-header { display: none; }
.pulse-order-filters, .pulse-order-filter-grid { display: contents; }
.pulse-order-filters > summary { display: none; }
html body .app-shell:is(.role-owner,.role-manager) :is([class*="toggle"] button,table[data-rolanpro-mobile-generic="1"] tbody > tr,table[data-rolanpro-mobile-orders="1"] tbody > tr) { border-radius: 0 !important; }
html body .pulse-dashboard { max-width: 1220px; margin: auto; color: #10253F; }
.pulse-heading > span { font-size: 11px; font-weight: 800; letter-spacing: .12em; color: #64748B; text-transform: uppercase; }
html body .pulse-heading h2 { font-size: 32px; font-weight: 800; margin: 8px 0; }
.pulse-heading p { color: #64748B; font-size: 13px; margin: 0 0 20px; }
html body .pulse-period { display: flex !important; flex-direction: row !important; max-width: 420px; border: 1px solid #D9E3EB; background: white; margin-bottom: 24px; }
html body .pulse-period button { flex: 1 !important; width: auto !important; min-width: 0 !important; min-height: 46px; font-weight: 700; border-radius: 0; color: #516277; }
html body .pulse-period button.active { background: #10253F; color: #FFF; }
html body .pulse-layout { display: grid; grid-template-columns: minmax(0,1.25fr) minmax(0,1fr); gap: 32px; }
html body .pulse-revenue { background: white; border: 1px solid #E0E7EE; padding: 28px; min-width: 0; }
.pulse-caption { font-size: 14px; font-weight: 700; }
html body .pulse-total { display: block; font: 800 clamp(30px,4vw,48px)/1.2 Manrope,sans-serif; letter-spacing: -.04em; color: #1686B0; margin: 12px 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.pulse-scope { color: #64748B; font-size: 12px; }
html body .pulse-chart { display: flex; gap: 12px; width: 100%; margin: 26px 0 18px; align-items: end; }
.pulse-bar-col { flex: 1; min-width: 0; text-align: center; }
.pulse-bar-col > span { font-size: 10px; font-weight: 700; display: block; margin-bottom: 8px; overflow-wrap: anywhere; }
.pulse-bar-track { height: 150px; border-bottom: 1px solid #DFE8EF; display: flex; align-items: end; justify-content: center; }
.pulse-chart.is-empty .pulse-bar-track { height: 24px; }
.pulse-bar-track i { display: block; width: 65%; background: var(--bar-color); transition: height .25s ease; }
.pulse-bar-col small { display: block; margin-top: 10px; font-size: 10px; color: #64748B; }
.pulse-footnote { color: #64748B; font-size: 11px; line-height: 1.6; }
.pulse-empty { padding: 10px 0 18px; font-size: 13px; color: #64748B; }
html body .pulse-metrics { min-width: 0; }
html body .pulse-metric { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; padding: 18px 0; min-height: 82px; border-bottom: 1px solid #DFE7EE; }
.pulse-metric-icon { display: flex; align-items: center; justify-content: center; width: 46px; height: 46px; flex-shrink: 0; }
.pulse-metric-icon svg { width: 22px; height: 22px; }
.pulse-metric-icon.violet { background: #EFE9FF; color: #7950CF; }
.pulse-metric-icon.green { background: #DDF4E8; color: #157C50; }
.pulse-metric-icon.amber { background: #FFF0D4; color: #9C6612; }
.pulse-metric-icon.cyan { background: #DDF3FC; color: #1686B0; }
.pulse-metric-copy { flex: 1; min-width: 0; }
.pulse-metric-copy b { display: block; font-size: 13px; }
.pulse-metric-copy small { display: block; color: #64748B; font-size: 11px; margin-top: 5px; }
.pulse-metric > strong { font: 800 26px Manrope,sans-serif; }
.pulse-arrow { font-size: 23px; color: #8CA0B5; }
html body .pulse-report-link { background: #1686B0; color: white; display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 50px; margin-top: 24px; padding: 12px 16px; font-weight: 700; }
.pulse-report-link svg { width: 20px; }
html body .pulse-operations { margin-top: 32px; border-top: 1px solid #DFE7EE; }
.pulse-operations > summary { padding: 20px 0; font-size: 13px; font-weight: 700; cursor: pointer; }
.pulse-operations .pw-today { padding-top: 8px; }
@media (max-width: 840px) { html body .pulse-layout { grid-template-columns: 1fr; gap: 8px; } }
/* Match the CRM's phone detection: narrow phone, or touch tablet. */
@media (max-width: 520px), (max-width: 768px) and (pointer: coarse) {
  /* Phone colours of «Пульс бизнеса»; the computer keeps the CRM 2.0 look (Owner, 2026-10-04). */
  html body:has(.app-shell:is(.role-owner,.role-manager)) .modal-content .btn-primary { background: #1686B0 !important; box-shadow: none; }
  html body .app-shell:is(.role-owner,.role-manager) {
    --radius: 0px; --radius-sm: 0px; --radius-lg: 0px;
    --rp-ground: #F7F9FB; --rp-input: #F5F7FA;
    --rp-gradient: #1686B0; --rp-line: #E0E7EE;
  }
  html body .app-shell:is(.role-owner,.role-manager) :is(.card,.btn-primary,.btn-ghost,.tag,.status-badge,input,select,textarea,.nav-item,.orders-command-panel,.orders-kpi-card,.orders-view-toggle,.orders-period-toggle,.kanban-column,.kanban-card,.pw-panel,.pw-count) {
    border-radius: 0 !important;
  }
  html body .app-shell:is(.role-owner,.role-manager) .card { box-shadow: none; border-color: #E0E7EE; }
  html body .app-shell:is(.role-owner,.role-manager) .app-sidebar { background: #10253F; }
  html body .app-shell:is(.role-owner,.role-manager) .app-sidebar::before { display: none; }
  html body .app-shell:is(.role-owner,.role-manager) .app-topbar { background: #FFF; backdrop-filter: none; }
  html body .app-shell:is(.role-owner,.role-manager) .btn-primary { background: #1686B0; box-shadow: none; }
  html body .app-shell:is(.role-owner,.role-manager) :is(button,input,select,textarea):focus-visible { outline: 3px solid #29A7E1; outline-offset: 3px; }
  html body:has(.app-shell:is(.role-owner,.role-manager)) :is(.modal-content,.modal-content input,.modal-content select,.modal-content textarea,.modal-content button) { border-radius: 0 !important; }
  html body .app-shell:is(.role-owner,.role-manager) .pulse-mobile-header { display: flex; align-items: center; justify-content: space-between; min-height: 68px; padding: 12px 20px; background: #10253F; color: white; }
  html body .pulse-mobile-header .pulse-logo { display: block; height: 36px; width: auto; max-width: 160px; object-fit: contain; }
  html body .pulse-mobile-header button { display: grid; place-items: center; min-width: 44px; min-height: 44px; border: 1px solid #4A617B; }
  html body .pulse-mobile-header button svg { width: 23px; height: 23px; }
  html body .app-shell:is(.role-owner,.role-manager) .app-topbar { padding: 10px 16px; gap: 8px; }
  html body .app-shell:is(.role-owner,.role-manager) .view-dashboard { min-width: 0; }
  html body .app-shell:is(.role-owner,.role-manager).view-dashboard :is(.topbar-title,.topbar-search) { display: none; }
  html body .app-shell:is(.role-owner,.role-manager) .topbar-subtitle { display: none; }
  html body .app-shell:is(.role-owner,.role-manager) :is(.topbar-user-pill,.topbar-actions > button[onclick="logout()"],.topbar-actions > button[onclick="openOrderModal()"]) { display: none; }
  html body .app-shell:is(.role-owner,.role-manager) .app-content { padding: 22px 20px calc(6rem + env(safe-area-inset-bottom)); background: #FFF; }
  html body .pulse-heading h2 { font-size: 27px; }
  html body .pulse-period { max-width: none; margin-bottom: 26px; }
  html body .pulse-revenue { border: 0; padding: 0; }
  html body .pulse-total { font-size: 42px; }
  html body .pulse-chart { gap: 8px; margin-top: 24px; }
  html body:has(.app-shell:is(.role-owner,.role-manager)) #no-svc-buttons { display: grid !important; grid-template-columns: repeat(2,minmax(0,1fr)) !important; gap: 8px !important; }
  html body:has(.app-shell:is(.role-owner,.role-manager)) #no-svc-buttons .order-service-card { min-height: 94px !important; padding: 10px !important; min-width: 0; }
  html body:has(.app-shell:is(.role-owner,.role-manager)) #no-svc-buttons .order-service-card .text-sm { font-size: 12px; line-height: 1.4; }
  html body:has(.app-shell:is(.role-owner,.role-manager)) .erp-intake-card { padding: 12px; }
  html body:has(.app-shell:is(.role-owner,.role-manager)) .erp-intake-footer > .flex { display: grid !important; grid-template-columns: repeat(2,minmax(0,1fr)) !important; gap: 8px; width: 100%; }
  html body:has(.app-shell:is(.role-owner,.role-manager)) .erp-intake-footer .btn-primary { grid-column: 1 / -1; min-height: 48px; }
  html body .pulse-metric { gap: 12px; }
  html body .pulse-order-filters { display: block; width: 100%; min-width: 0; border-top: 1px solid #DFE7EE; }
  html body .pulse-order-filters > summary { display: list-item; padding: 14px 0; font-size: 13px; font-weight: 700; cursor: pointer; min-height: 44px; }
  html body .pulse-order-filter-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 12px; }
  html body .orders-period-toggle { flex-wrap: wrap; }
  html body .orders-period-toggle button { padding: 8px; min-width: 0; }

  html body .pulse-metric > strong { font-size: 24px; }
  html body .app-shell:is(.role-owner,.role-manager) .mobile-primary-nav { grid-template-columns: repeat(4,minmax(0,1fr)); background: #FFF; border-top: 1px solid #DAE4ED; border-radius: 0; backdrop-filter: none; }
  html body .app-shell:is(.role-owner,.role-manager) .mobile-primary-nav button { border-radius: 0; min-height: 52px; }
  html body .app-shell:is(.role-owner,.role-manager) .mobile-primary-nav button.active { background: #E8F6FD; color: #147BA4; box-shadow: inset 0 3px #29A7E1; }
  html body .app-shell:is(.role-owner,.role-manager) .orders-kpi-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  html body .app-shell:is(.role-owner,.role-manager) .orders-command-panel { background: #FFF; padding: 14px; }
  html body .app-shell:is(.role-owner,.role-manager) .orders-command-subtitle { font-size: 12px; }
  html body .app-shell:is(.role-owner,.role-manager) .orders-primary-actions { gap: 8px; }
}
@media (prefers-reduced-motion: reduce) { .pulse-bar-track i { transition: none; } }
`;
export const PULSE_THEME_HTML = `<style id="rolanpro-pulse-theme">${PULSE_THEME_CSS}</style>`;
