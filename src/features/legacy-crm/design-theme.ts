/**
 * «CRM 2.0» (the owner's canvas «CRM RolanPRO 2.0 — архитектура и экраны»,
 * 2026-10-04) as one visual layer over the live CRM:
 *
 * - everything is square: buttons, fields, blocks, dialogs, chips;
 * - every block has a thin 1 px border; shadows only for menus and dialogs;
 * - flat colours: navy menu, one blue for actions, colour only for a status
 *   or a type of object;
 * - Montserrat headings, Manrope text, IBM Plex Mono figures;
 * - buttons stay alive: on hover they lift with a soft shadow, on press they
 *   sink a little.
 *
 * It is injected at the end of <body>, after the legacy and Tailwind styles,
 * so equal selectors win; selectors that must beat more specific legacy rules
 * are prefixed with `html body`. The square rule carries an id in :not() so
 * it also beats the phone layer's `border-radius: 16px !important`.
 */

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap">';

export const DESIGN_THEME_CSS = `
:root {
  --rp-ground: #F2F4F7;
  --rp-line: #D3DAE3;
  --rp-line-soft: #EEF1F5;
  --rp-field-line: #B9C3CF;
  --rp-ink: #121A26;
  --rp-muted: #5D6B7E;
  --rp-navy: #121C2A;
  --rp-navy-line: #22303F;
  --rp-blue: #2E5FA8;
  --rp-blue-dark: #24508F;
  --rp-cyan: #3DB5D9;
  --rp-lift: 0 8px 16px -10px rgba(18,28,42,.55);
  --rp-menu-shadow: 0 18px 40px -18px rgba(18,28,42,.45);
  --brand-blue: #2E5FA8;
  --brand-blue-dark: #24508F;
  --brand-accent: #3DB5D9;
  --brand-light: #EEF4FC;
  --bg: #F2F4F7;
  --surface: #FFFFFF;
  --border: #D3DAE3;
  --text: #121A26;
  --text-muted: #5D6B7E;
  --shadow-sm: none;
  --shadow-md: none;
  --radius: 0px;
  --radius-sm: 0px;
  --radius-lg: 0px;
}

/* Square everywhere */
html body *:not(#rp-square),
html body *:not(#rp-square)::before,
html body *:not(#rp-square)::after { border-radius: 0 !important; }

html body {
  font-family: Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-feature-settings: normal;
  letter-spacing: 0;
  color: var(--rp-ink);
  background: var(--rp-ground);
}
html body h1, html body h2, html body h3, html body h4,
html body .topbar-title h1, html body .pw-today-head h2 {
  font-family: Montserrat, Manrope, sans-serif;
  letter-spacing: -.01em;
}
html body .money, html body .mono, html body .font-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
html body :focus-visible { outline: 2px solid var(--rp-cyan); outline-offset: 2px; }

/* Shell */
html body .app-shell,
html body .app-content { background: var(--rp-ground); }
html body .app-sidebar { background: var(--rp-navy); border-right: 0; box-shadow: none; }
html body .sidebar-brand { min-height: 64px; border-bottom: 1px solid var(--rp-navy-line); }
html body .sidebar-mark,
html body .sidebar-logo-panel { box-shadow: none; border: 0; }
html body .sidebar-toggle-btn { border: 1px solid var(--rp-navy-line); background: transparent; color: #C3CFDC; }
html body .sidebar-toggle-btn:hover { background: rgba(255,255,255,.07); color: #fff; transform: none; }
html body .app-sidebar nav { padding: 6px 10px 16px; }
html body .crm2-nav-group-title {
  padding: 14px 10px 5px;
  font: 800 10.5px/1 Manrope, sans-serif;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: #8597AD;
  white-space: nowrap;
}
html body .app-sidebar .nav-item {
  min-height: 36px;
  margin: 0;
  padding: 0 10px;
  gap: 10px;
  color: #C3CFDC;
  font-size: 13.5px;
  font-weight: 600;
  box-shadow: none;
  transition: background-color .15s ease, color .15s ease;
}
html body .app-sidebar .nav-item:hover { background: rgba(255,255,255,.07); color: #fff; }
html body .app-sidebar .nav-item.active { background: var(--rp-blue); color: #fff; box-shadow: none; }
html body .app-sidebar .nav-item.active::before { display: none; }
html body .nav-icon { width: 20px; flex: 0 0 20px; color: currentColor; }
html body .sidebar-collapsed .crm2-nav-group-title { display: none; }
html body .sidebar-collapsed .crm2-nav-group + .crm2-nav-group { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--rp-navy-line); }
@media (min-width: 521px) and (max-width: 840px) and (pointer: fine) {
  html body .crm2-nav-group-title { display: none; }
  html body .crm2-nav-group + .crm2-nav-group { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--rp-navy-line); }
}
html body .nav-icon svg,
html body .mobile-primary-nav-icon svg,
html body .rp-ic {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: square;
  stroke-linejoin: miter;
  display: block;
  flex-shrink: 0;
}

html body .app-topbar {
  min-height: 64px;
  background: #fff;
  border-bottom: 1px solid var(--rp-line);
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
html body .topbar-eyebrow { color: var(--rp-muted); font-size: 11px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; }
html body .topbar-title { min-width: 0; }
@media (min-width: 1100px) {
  html body .app-topbar { grid-template-columns: auto minmax(240px, 1fr) minmax(220px, 420px) auto; }
}
html body .topbar-title h1 { color: var(--rp-ink); font-size: 20px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
html body .topbar-search input {
  min-height: 40px;
  padding-left: 38px;
  border: 1px solid var(--rp-field-line);
  background: #F7F9FB;
  box-shadow: none;
}
html body .topbar-search-icon { display: inline-flex; color: var(--rp-muted); }
html body .topbar-icon-btn {
  position: relative;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--rp-field-line);
  background: #fff;
  color: var(--rp-ink);
}
html body .topbar-icon-btn.active { border-color: var(--rp-blue); color: var(--rp-blue); }
html body .crm2-count {
  position: absolute;
  top: -7px;
  right: -7px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  background: #D2452B;
  color: #fff;
  font: 600 11px/18px 'IBM Plex Mono', monospace;
  text-align: center;
}
html body .topbar-user-pill { border: 1px solid var(--rp-field-line); background: #fff; font: inherit; cursor: pointer; }
html body .rolanpro-top-user-avatar { background: var(--rp-blue); border: 0; color: #fff; }

/* «+ Создать» and the user's menu */
html body .crm2-menu-wrap { position: relative; display: inline-flex; }
html body .crm2-create-btn { height: 40px; padding: 0 14px; display: inline-flex; align-items: center; gap: 8px; }
html body .crm2-create-btn .rp-ic:last-child { width: 14px; height: 14px; }
html body .crm2-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 70;
  min-width: 290px;
  padding: 4px 0;
  background: #fff;
  border: 1px solid var(--rp-line);
  box-shadow: var(--rp-menu-shadow);
}
html body .crm2-menu[hidden] { display: none; }
html body .crm2-create-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 14px;
  border: 0;
  border-bottom: 1px solid var(--rp-line-soft);
  background: #fff;
  color: var(--rp-ink);
  text-align: left;
  cursor: pointer;
  transition: background-color .15s ease, box-shadow .15s ease;
}
html body .crm2-create-row:last-child { border-bottom: 0; }
html body .crm2-create-row:hover { background: #F4F8FD; box-shadow: inset 3px 0 0 var(--rp-blue); }
html body .crm2-create-row:active { background: #EAF1FB; }
html body .crm2-create-row .rp-ic { color: #8597AD; }
html body .crm2-swatch { width: 10px; height: 10px; flex: 0 0 10px; }
html body .crm2-create-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
html body .crm2-create-text b { font-size: 13.5px; font-weight: 800; }
html body .crm2-create-text small { font-size: 12px; font-weight: 600; color: var(--rp-muted); }
html body .crm2-menu-user { min-width: 240px; }
html body .crm2-menu-head { display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; border-bottom: 1px solid var(--rp-line-soft); font-size: 13.5px; }
html body .crm2-menu-head small { font-size: 12px; font-weight: 600; color: var(--rp-muted); }
html body .crm2-menu-lang { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--rp-line-soft); font-size: 13px; font-weight: 700; }
html body .crm2-seg { display: inline-flex; border: 1px solid var(--rp-field-line); }
html body .crm2-seg button { height: 30px; padding: 0 12px; border: 0; background: #fff; font: 700 12.5px Manrope, sans-serif; color: #3B4A5C; cursor: pointer; }
html body .crm2-seg button + button { border-left: 1px solid var(--rp-field-line); }
html body .crm2-seg button:hover { background: #EEF4FC; }
html body .crm2-seg button.on { background: var(--rp-navy); color: #fff; }
html body .crm2-menu-item { width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 14px; border: 0; border-bottom: 1px solid var(--rp-line-soft); background: #fff; font: 700 13.5px Manrope, sans-serif; color: var(--rp-ink); cursor: pointer; }
html body .crm2-menu-item:last-child { border-bottom: 0; }
html body .crm2-menu-item:hover { background: #F4F8FD; }
html body .crm2-menu-item.danger { color: #A3321B; }
html body .crm2-menu-item.danger:hover { background: #FBE6E1; }

/* Tabs where two or three screens became one menu item */
html body .crm2-tabs,
html body .crm2-tabs[data-rolanpro-mobile-action-row] {
  display: flex !important;
  gap: 0 !important;
  overflow-x: auto;
  margin-bottom: 16px;
  background: #fff;
  border: 1px solid var(--rp-line);
}
html body .crm2-tabs button {
  flex: 0 0 auto;
  width: auto !important;
  height: 44px;
  padding: 0 18px;
  border: 0;
  border-right: 1px solid var(--rp-line-soft);
  background: #fff;
  font: 800 13.5px Manrope, sans-serif;
  color: var(--rp-muted);
  white-space: nowrap;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease;
}
html body .crm2-tabs button:hover { background: #F7F9FB; color: var(--rp-ink); }
html body .crm2-tabs button.on { color: var(--rp-ink); box-shadow: inset 0 -3px 0 var(--rp-blue); }

/* Blocks: white, 1 px border, no shadow */
html body .card,
html body .pw-panel,
html body .pw-funnel {
  background: #fff;
  border: 1px solid var(--rp-line);
  box-shadow: none;
}
html body .card:hover { box-shadow: none; }
html body .shadow,
html body .shadow-sm,
html body .shadow-md { box-shadow: none; }
html body .pw-today-kicker { color: var(--rp-blue); }
html body .pw-today-head h2 { color: var(--rp-ink); font-weight: 800; }
html body .pw-panel-head { border-bottom-color: var(--rp-line); }
html body .pw-panel-head h3 { font-family: Montserrat, Manrope, sans-serif; color: var(--rp-ink); font-weight: 800; }
html body .pw-funnel-step::after { height: 3px; background: var(--stage-color, var(--rp-blue)); opacity: 1; }
html body .pw-funnel-step strong { font-family: 'IBM Plex Mono', ui-monospace, monospace; color: var(--rp-ink); }

/* Buttons: square and alive */
html body .btn-primary,
html body .btn-ghost,
html body .btn-danger,
html body .topbar-icon-btn,
html body .topbar-user-pill {
  font-weight: 700;
  transition: background-color .15s ease, border-color .15s ease, color .15s ease, transform .12s ease, box-shadow .15s ease;
}
html body .btn-primary { background: var(--rp-blue); border: 1px solid var(--rp-blue); color: #fff; box-shadow: none; }
html body .btn-ghost { background: #fff; border: 1px solid var(--rp-field-line); color: var(--rp-ink); box-shadow: none; }
html body .btn-primary:hover:not(:disabled) { background: var(--rp-blue-dark); border-color: var(--rp-blue-dark); color: #fff; }
html body .btn-ghost:hover:not(:disabled),
html body .topbar-icon-btn:hover,
html body .topbar-user-pill:hover { background: #fff; border-color: var(--rp-blue); color: var(--rp-blue); }
html body .btn-primary:hover:not(:disabled),
html body .btn-ghost:hover:not(:disabled),
html body .btn-danger:hover:not(:disabled),
html body .topbar-icon-btn:hover,
html body .topbar-user-pill:hover { transform: translateY(-2px); box-shadow: var(--rp-lift); }
html body .btn-primary:active:not(:disabled),
html body .btn-ghost:active:not(:disabled),
html body .btn-danger:active:not(:disabled),
html body .topbar-icon-btn:active,
html body .topbar-user-pill:active { transform: translateY(0) scale(.97); box-shadow: none; }
html body button:disabled { cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) {
  html body .btn-primary:hover, html body .btn-ghost:hover, html body .btn-danger:hover,
  html body .topbar-icon-btn:hover, html body .topbar-user-pill:hover,
  html body .btn-primary:active, html body .btn-ghost:active, html body .btn-danger:active { transform: none; }
}

/* Fields */
html body input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),
html body select,
html body textarea {
  border-color: var(--rp-field-line);
  background-color: #fff;
  box-shadow: none;
}
html body .app-sidebar input,
html body .app-sidebar select { background-color: rgba(255,255,255,.07); border-color: var(--rp-navy-line); color: #fff; }
html body input:focus,
html body select:focus,
html body textarea:focus {
  outline: none;
  border-color: var(--rp-blue);
  box-shadow: 0 0 0 2px rgba(46,95,168,.18);
  background-color: #fff;
}

/* Chips and badges */
html body .tag,
html body .status-badge,
html body .chip { font-weight: 700; }

/* Dialogs */
html body .modal-backdrop { background: rgba(18,28,42,.5); backdrop-filter: none; -webkit-backdrop-filter: none; }
html body .modal-content { border: 1px solid var(--rp-line); box-shadow: 0 30px 80px -30px rgba(18,28,42,.6); }

/* Phone dock */
html body .mobile-primary-nav { background: #fff; border-top: 1px solid var(--rp-line); box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
html body .mobile-primary-nav button { font-family: Manrope, sans-serif; font-size: 11px; font-weight: 700; color: var(--rp-muted); transition: color .15s ease, transform .12s ease; }
html body .mobile-primary-nav button.active { background: transparent; color: var(--rp-blue); }
html body .mobile-primary-nav button:active { transform: scale(.94); }
html body .mobile-primary-nav-icon svg { width: 22px; height: 22px; margin: 0 auto; }
html body .mobile-primary-nav .mobile-fab-slot { overflow: visible; }
html body .mobile-fab {
  width: 52px;
  height: 52px;
  margin-top: -26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: var(--rp-blue);
  box-shadow: 0 0 0 4px var(--rp-ground);
}
html body .mobile-fab svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: square; }

/* Phone «Создать» sheet: the same list as on a computer */
html body .modal-content.crm2-create-sheet { padding: 0; overflow: hidden; }
html body .crm2-sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--rp-line); }
html body .crm2-sheet-head h3 { font: 800 17px Montserrat, sans-serif; }
html body .crm2-create-list,
html body .crm2-create-list[data-rolanpro-mobile-action-row] { display: flex !important; flex-direction: column !important; gap: 0 !important; max-height: 72dvh; overflow-y: auto; }
html body .crm2-create-sheet .crm2-create-row { min-height: 56px; }

/* Wherever the phone dock is shown (the legacy layout up to 840 px, except a
   narrow desktop window, where the phone layer hides the dock), its «+» is the
   one create button. */
@media (max-width: 840px) {
  html body .crm2-create-wrap { display: none; }
}
@media (min-width: 521px) and (max-width: 840px) and (pointer: fine) {
  html body .crm2-create-wrap { display: inline-flex; }
}
/* Phones: settings live in the user's menu, so the top bar keeps room for the title. */
@media (max-width: 760px) {
  html body .app-topbar .topbar-icon-btn[aria-label="Настройки"] { display: none; }
  html body .crm2-menu { position: fixed; top: 60px; left: 12px; right: 12px; min-width: 0; }
}
`;

export const DESIGN_THEME_HTML = `${FONTS}<style id="rolanpro-design-theme">${DESIGN_THEME_CSS}</style>`;
