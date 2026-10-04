/**
 * The owner's design «CRM RolanPRO — экраны» (Claude Design canvas, 2026-10)
 * as one visual layer over the live CRM: Montserrat headings, Manrope text,
 * IBM Plex Mono figures; a deep navy sidebar with a blue gradient for the
 * active item; a light blue-grey ground; white 8 px cards with a soft shadow;
 * blue gradient primary buttons; calm inputs; a frosted phone dock with a
 * gradient «+».
 *
 * It is injected at the end of <body>, after the legacy and Tailwind styles,
 * so equal selectors win; selectors that must beat more specific legacy rules
 * are prefixed with `html body`. Layout (widths, grids, breakpoints) is left as
 * it is: screens get their own layouts from the canvas one by one.
 */

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap">';

export const DESIGN_THEME_CSS = `
:root {
  --rp-navy-top: #24364C;
  --rp-navy-bottom: #131D2A;
  --rp-blue: #2E5FA8;
  --rp-cyan: #3DB5D9;
  --rp-gradient: linear-gradient(135deg, #2E5FA8, #3DB5D9);
  --rp-ground: radial-gradient(1200px 640px at 100% -12%, rgba(79,184,234,.18), transparent 60%),
    radial-gradient(900px 700px at -12% 112%, rgba(58,98,175,.14), transparent 62%),
    linear-gradient(180deg, #F4F7FD, #E8EDF8);
  --rp-hero: radial-gradient(460px 280px at 108% -12%, rgba(61,181,217,.55), transparent 70%),
    radial-gradient(340px 240px at -12% 125%, rgba(46,95,168,.5), transparent 70%),
    linear-gradient(135deg, #26394F 0%, #141F2D 100%);
  --rp-card-shadow: 0 1px 2px rgba(23,32,74,.05), 0 14px 34px -18px rgba(23,32,74,.30);
  --rp-card-shadow-hover: 0 2px 4px rgba(23,32,74,.06), 0 22px 40px -18px rgba(23,32,74,.42);
  --rp-line: #E6ECF4;
  --rp-input: #F4F7FB;
  --brand-blue: #2E5FA8;
  --brand-blue-dark: #22488F;
  --brand-accent: #3DB5D9;
  --brand-light: #EAF3FB;
  --bg: #EEF2F9;
  --surface: #FFFFFF;
  --border: #E6ECF4;
  --text: #16212F;
  --text-muted: #5F6E82;
  --shadow-sm: var(--rp-card-shadow);
  --shadow-md: var(--rp-card-shadow-hover);
  --radius: 8px;
  --radius-sm: 6px;
  --radius-lg: 10px;
}

html body {
  font-family: Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-feature-settings: normal;
  letter-spacing: 0;
  color: var(--text);
  background: #E8EDF8;
}
html body h1, html body h2, html body h3, html body h4,
html body .topbar-title h1, html body .pw-today-head h2 {
  font-family: Montserrat, Manrope, sans-serif;
  letter-spacing: -.02em;
}
html body .money, html body .mono, html body .font-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }

/* Shell */
html body .app-shell,
html body .app-content { background: var(--rp-ground); background-attachment: fixed; }
html body .app-sidebar {
  background: linear-gradient(180deg, var(--rp-navy-top) 0%, var(--rp-navy-bottom) 100%);
  border-right: 0;
  box-shadow: 10px 0 30px -18px rgba(13,22,33,.7);
}
html body .app-sidebar::before,
html body .app-sidebar::after {
  content: '';
  position: absolute;
  bottom: -40px;
  pointer-events: none;
  transform: skewX(-30deg);
  z-index: 0;
}
html body .app-sidebar::before { left: 120px; width: 70px; height: 260px; background: linear-gradient(180deg, rgba(61,181,217,0), rgba(61,181,217,.32)); }
html body .app-sidebar::after { left: 175px; width: 38px; height: 200px; background: linear-gradient(180deg, rgba(255,255,255,0), rgba(191,231,243,.18)); }
html body .app-sidebar > * { position: relative; z-index: 1; }
html body .sidebar-brand { border-bottom-color: rgba(255,255,255,.08); }
html body .app-sidebar .nav-item {
  min-height: 42px;
  border-radius: 6px;
  color: #C6D4E2;
  font-size: 14px;
  font-weight: 600;
}
html body .app-sidebar .nav-item:hover { background: rgba(255,255,255,.07); color: #fff; }
html body .app-sidebar .nav-item.active {
  background: var(--rp-gradient);
  color: #fff;
  box-shadow: 0 10px 22px -8px rgba(61,181,217,.75);
}
html body .app-sidebar .nav-item.active::before { display: none; }
html body .nav-icon { color: currentColor; }
html body .nav-icon svg,
html body .mobile-primary-nav-icon svg,
html body .rp-ic {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  display: block;
}
html body .sidebar-user { border-radius: 8px; background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.08); }
html body .sidebar-avatar { border-radius: 6px; background: var(--rp-gradient); }
html body .sidebar-toggle-btn { border-radius: 6px; }

html body .app-topbar {
  background: rgba(255,255,255,.78);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(230,236,244,.9);
  box-shadow: none;
}
html body .topbar-eyebrow { color: #5F6E82; font-weight: 800; }
html body .topbar-title h1 { color: var(--text); font-weight: 800; }
html body .topbar-search input {
  min-height: 44px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid rgba(255,255,255,.95);
  box-shadow: var(--rp-card-shadow);
}
html body .topbar-icon-btn { border-radius: 6px; background: #fff; border-color: var(--rp-line); color: var(--text); }
html body .topbar-user-pill { border-radius: 6px; }

/* Surfaces */
html body .card,
html body .pw-panel,
html body .pw-funnel {
  background: #fff;
  border: 1px solid rgba(230,236,244,.85);
  border-radius: 8px;
  box-shadow: var(--rp-card-shadow);
}
html body .card:hover { box-shadow: var(--rp-card-shadow-hover); }
html body .pw-today-kicker { color: #2E5FA8; }
html body .pw-today-head h2 { color: var(--text); font-weight: 800; }
html body .pw-panel-head { border-bottom-color: var(--rp-line); }
html body .pw-panel-head h3 { font-family: Montserrat, Manrope, sans-serif; color: var(--text); font-weight: 800; }
html body .pw-funnel-step::after { height: 3px; background: var(--stage-color, var(--rp-gradient)); opacity: 1; }
html body .pw-funnel-step strong { font-family: 'IBM Plex Mono', ui-monospace, monospace; color: var(--text); }

/* Buttons */
html body .btn-primary {
  background: var(--rp-gradient);
  border-radius: 6px;
  font-weight: 700;
  box-shadow: 0 10px 24px -12px rgba(46,95,168,.9);
}
html body .btn-primary:hover { box-shadow: 0 14px 28px -12px rgba(46,95,168,.95); }
html body .btn-ghost { border-radius: 6px; font-weight: 700; }
html body .btn-ghost:hover { background: #EAF3FB; border-color: rgba(46,95,168,.18); }
html body .btn-danger { border-radius: 6px; font-weight: 700; }

/* Inputs */
html body input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),
html body select,
html body textarea {
  border-radius: 6px;
  border-color: var(--rp-line);
  background-color: var(--rp-input);
}
html body .app-sidebar input,
html body .app-sidebar select { background-color: rgba(255,255,255,.07); border-color: rgba(255,255,255,.12); color: #fff; }
html body input:focus,
html body select:focus,
html body textarea:focus {
  outline: none;
  border-color: #3DB5D9;
  box-shadow: 0 0 0 3px rgba(61,181,217,.22);
  background-color: #fff;
}

/* Chips and badges */
html body .tag,
html body .status-badge,
html body .chip { border-radius: 4px; font-weight: 700; }

/* Dialogs */
html body .modal-backdrop { background: rgba(13,22,33,.45); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
html body .modal-content { border-radius: 10px; box-shadow: 0 30px 80px -30px rgba(13,22,33,.65); }

/* Phone dock */
html body .mobile-primary-nav {
  background: rgba(255,255,255,.88);
  border-top: 1px solid var(--rp-line);
  box-shadow: 0 -10px 30px -16px rgba(23,32,74,.35);
}
html body .mobile-primary-nav button { font-family: Manrope, sans-serif; font-size: 11px; color: #5F6E82; border-radius: 8px; }
html body .mobile-primary-nav button.active { background: transparent; color: #2E5FA8; }
html body .mobile-primary-nav-icon svg { width: 22px; height: 22px; margin: 0 auto; }
html body .mobile-primary-nav .mobile-fab-slot { overflow: visible; }
html body .mobile-fab {
  width: 56px;
  height: 56px;
  margin-top: -28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: var(--rp-gradient);
  box-shadow: 0 14px 28px -10px rgba(46,95,168,.95), 0 0 0 5px #F4F7FD;
}
html body .mobile-fab svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }

/* Phones: «+» in the dock creates, so the top bar keeps room for the title. */
@media (max-width: 760px) {
  html body .app-topbar button[onclick="openOrderModal()"] { display: none; }
  html body .topbar-title { min-width: 0; }
  html body .topbar-title h1 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}

/* «Сегодня» from the canvas: a 12-column mosaic on desktop, one column on phones. */
.rp-today { max-width: 1600px; margin: 0 auto; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 18px; align-items: start; }
.rp-today h2, .rp-today h3 { font-family: Montserrat, Manrope, sans-serif; letter-spacing: -.02em; margin: 0; }
.rp-today small { display: block; color: #5F6E82; font-size: 12.5px; font-weight: 600; }
.rp-today-hero {
  grid-column: span 8; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 16px;
  padding: 26px 28px; border-radius: 8px; color: #fff; background: var(--rp-hero);
  box-shadow: 0 26px 50px -24px rgba(20,31,45,.95);
}
.rp-today-hero::before, .rp-today-hero::after { content: ''; position: absolute; top: -40px; height: 340px; transform: skewX(-30deg); pointer-events: none; }
.rp-today-hero::before { right: 120px; width: 70px; background: linear-gradient(180deg, rgba(255,255,255,.13), rgba(255,255,255,0)); }
.rp-today-hero::after { right: 40px; width: 30px; background: linear-gradient(180deg, rgba(191,231,243,.3), rgba(191,231,243,0)); }
.rp-today-hero > * { position: relative; z-index: 1; }
.rp-today-hero-top { display: flex; align-items: flex-start; gap: 20px; }
.rp-today-hero-text { flex: 1; min-width: 0; }
.rp-today-kicker { font-size: 13px; font-weight: 700; color: #9DB7CF; text-transform: uppercase; letter-spacing: 1.2px; }
.rp-today-hero h2 { margin-top: 8px; font-size: 32px; font-weight: 800; color: #fff; }
.rp-today-hero p { margin-top: 8px; font-size: 15px; font-weight: 600; color: #C6D4E2; line-height: 1.5; }
.rp-today-hero p b { color: #fff; }
.rp-today-week { text-align: right; flex-shrink: 0; }
.rp-today-week span { display: block; font-size: 12px; font-weight: 700; color: #9DB7CF; }
.rp-today-week b { display: block; margin-top: 2px; font: 600 30px 'IBM Plex Mono', monospace; }
.rp-today-week em { display: inline-flex; margin-top: 6px; padding: 4px 10px; border-radius: 4px; font-style: normal; font-size: 12px; font-weight: 800; }
.rp-today-week em.up { color: #7FE3D0; background: rgba(127,227,208,.12); }
.rp-today-week em.down { color: #FFB4A3; background: rgba(239,106,76,.16); }
.rp-today-ask { display: flex; align-items: center; gap: 12px; height: 54px; padding: 0 8px 0 14px; border-radius: 8px; background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.18); backdrop-filter: blur(10px); }
.rp-today-ask-icon { width: 30px; height: 30px; border-radius: 6px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; color: #12304A; background: linear-gradient(135deg, #BFE7F3, #3DB5D9); }
html body .rp-today-ask input { flex: 1; min-width: 0; height: 100%; border: 0 !important; background: transparent !important; box-shadow: none !important; color: #fff; font: 600 15px Manrope, sans-serif; outline: none; }
html body .rp-today-ask input::placeholder { color: rgba(220,232,242,.75); }
.rp-today-ask button { height: 40px; padding: 0 16px; border: 0; border-radius: 6px; background: #fff; color: #16212F; font: 700 14px Manrope, sans-serif; cursor: pointer; }
.rp-today-asks { display: flex; flex-wrap: wrap; gap: 8px; }
.rp-today-asks button { height: 32px; padding: 0 12px; border-radius: 4px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.06); color: #DCE8F2; font: 700 12.5px Manrope, sans-serif; cursor: pointer; }
.rp-today-card { background: #fff; border: 1px solid rgba(230,236,244,.85); border-radius: 8px; box-shadow: var(--rp-card-shadow); padding: 20px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.rp-today-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
.rp-today-card-head h3 { font-size: 17px; font-weight: 800; color: #16212F; }
.rp-today-crews { grid-column: span 4; }
.rp-today-live { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 4px; background: rgba(52,181,115,.14); color: #1C8A52; font-size: 12px; font-weight: 700; }
.rp-today-live i { width: 7px; height: 7px; border-radius: 50%; background: #34B573; box-shadow: 0 0 0 3px rgba(52,181,115,.25); }
.rp-today-crew, .rp-today-action, .rp-today-visit { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 0; border-radius: 8px; background: #F6F9FD; text-align: left; width: 100%; }
.rp-today-crew { cursor: pointer; }
.rp-today-avatar { width: 40px; height: 40px; border-radius: 6px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 12px; font-weight: 800; }
.rp-today-crew-text, .rp-today-action-text { flex: 1; min-width: 0; }
.rp-today-crew-text b, .rp-today-action-text b { display: block; font-size: 14px; font-weight: 800; color: #16212F; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-today-crew-text small, .rp-today-action-text small { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-today-tiles { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
.rp-today-tile { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 8px; padding: 18px 20px 16px; border: 0; border-radius: 8px; color: #fff; text-align: left; cursor: pointer; transition: transform .2s; }
.rp-today-tile:hover { transform: translateY(-3px); }
.rp-today-tile::before { content: ''; position: absolute; right: 16px; top: -30px; width: 44px; height: 180px; background: linear-gradient(180deg, rgba(255,255,255,.26), rgba(255,255,255,0)); transform: skewX(-30deg); }
.rp-today-tile > * { position: relative; }
.rp-today-tile-label { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 800; color: rgba(255,255,255,.92); }
.rp-today-tile-label i { width: 8px; height: 8px; border-radius: 50%; background: #fff; }
.rp-today-tile-label i.rp-pulse { animation: rpPulse 1.8s infinite; }
@keyframes rpPulse { 0% { box-shadow: 0 0 0 0 rgba(255,255,255,.7); } 70% { box-shadow: 0 0 0 9px rgba(255,255,255,0); } 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); } }
.rp-today-tile-value { display: flex; align-items: baseline; gap: 10px; }
.rp-today-tile-value b { font: 800 40px Montserrat, sans-serif; letter-spacing: -1px; }
.rp-today-tile-value em { font: 600 14px 'IBM Plex Mono', monospace; font-style: normal; color: rgba(255,255,255,.9); }
.rp-today-tile-note { font-size: 13px; font-weight: 700; background: rgba(255,255,255,.16); border-radius: 6px; padding: 7px 10px; }
.rp-today-visits { grid-column: span 7; }
.rp-today-actions { grid-column: span 5; }
.rp-today-visit-time { font: 600 13px 'IBM Plex Mono', monospace; color: #16212F; min-width: 46px; }
.rp-today-visit-kind { flex-shrink: 0; height: 24px; padding: 0 8px; border-radius: 4px; color: #fff; font-size: 11.5px; font-weight: 800; display: inline-flex; align-items: center; }
.rp-today-visit-main { flex: 1; min-width: 0; border: 0; background: transparent; text-align: left; cursor: pointer; padding: 0; }
.rp-today-visit-main b { display: block; font-size: 14px; font-weight: 800; color: #16212F; }
.rp-today-visit-main small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-today-action .btn-primary { flex-shrink: 0; height: 34px; padding: 0 12px; white-space: nowrap; }
.rp-today-revenue { grid-column: span 8; }
.rp-today-chart-svg { width: 100%; height: 200px; display: block; }
.rp-today-legend { display: flex; gap: 16px; font-size: 12px; font-weight: 700; color: #3A4A5E; }
.rp-today-legend span { display: inline-flex; align-items: center; gap: 6px; }
.rp-today-legend i { width: 14px; height: 4px; border-radius: 4px; }
.rp-today-legend i.rev { background: linear-gradient(90deg, #3DB5D9, #2E5FA8); }
.rp-today-legend i.got { background: #F0962B; }
.rp-today-weeks { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; font: 600 12px 'IBM Plex Mono', monospace; color: #3A4A5E; }
.rp-today-weeks b { display: block; font-family: Manrope, sans-serif; font-size: 11.5px; color: #5F6E82; }
.rp-today-plan { grid-column: span 4; position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 22px; border-radius: 8px; color: #fff; background: var(--rp-hero); box-shadow: 0 22px 44px -22px rgba(20,31,45,.9); }
.rp-today-plan .rp-today-card-head { align-self: stretch; }
.rp-today-plan h3 { color: #fff; font-size: 16px; }
.rp-today-plan small { color: #9DB7CF; }
.rp-today-ring-value { font: 800 34px Montserrat, sans-serif; fill: #fff; }
.rp-today-ring-sub { font: 700 12px Manrope, sans-serif; fill: #9DB7CF; }
.rp-today-plan-note { font-size: 12px; font-weight: 600; color: #9DB7CF; text-align: center; }
.rp-today-plan-grid { align-self: stretch; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rp-today-plan-grid div { background: rgba(255,255,255,.08); border-radius: 6px; padding: 10px 12px; }
.rp-today-plan-grid span { display: block; font-size: 11px; font-weight: 700; color: #9DB7CF; }
.rp-today-plan-grid b { font: 600 18px 'IBM Plex Mono', monospace; }
.rp-today-empty { padding: 14px; border-radius: 8px; background: #F6F9FD; color: #5F6E82; font-size: 13px; font-weight: 600; text-align: center; }
@media (max-width: 1180px) {
  .rp-today-hero, .rp-today-crews, .rp-today-visits, .rp-today-actions, .rp-today-revenue, .rp-today-plan { grid-column: 1 / -1; }
  .rp-today-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .rp-today { gap: 12px; }
  .rp-today-hero { padding: 18px 16px; }
  .rp-today-hero-top { flex-direction: column; gap: 10px; }
  .rp-today-week { text-align: left; }
  .rp-today-hero h2 { font-size: 26px; }
  .rp-today-hero p { font-size: 14px; }
  .rp-today-ask { height: 50px; }
  .rp-today-ask button { padding: 0 12px; }
  .rp-today-asks { flex-wrap: nowrap; overflow-x: auto; }
  .rp-today-asks button { flex-shrink: 0; }
  .rp-today-tiles { gap: 10px; }
  .rp-today-tile { padding: 14px; }
  .rp-today-tile-value b { font-size: 32px; }
  .rp-today-tile-note { font-size: 11.5px; padding: 5px 8px; }
  .rp-today-card { padding: 14px; }
  .rp-today-visit { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "time main route" "kind main route"; column-gap: 10px; row-gap: 4px; align-items: center; }
  .rp-today-visit-time { grid-area: time; }
  .rp-today-visit-kind { grid-area: kind; justify-self: start; }
  .rp-today-visit-main { grid-area: main; }
  .rp-today-visit > a { grid-area: route; }
}
.rp-today-card-head .btn-ghost, .rp-today-visit > a { white-space: nowrap; }
.rp-today-asks { display: flex !important; scrollbar-width: none; }
.rp-today-asks::-webkit-scrollbar { display: none; }
html body .rp-today-hero, html body .rp-today-plan { overflow: hidden !important; }
html body .rp-today-crew-text b, html body .rp-today-action-text b, html body .rp-today-visit-main b,
html body .rp-today-crew-text small, html body .rp-today-action-text small, html body .rp-today-visit-main small { overflow: hidden !important; text-overflow: ellipsis; white-space: nowrap; }
/* The phone layer would turn these rows into stacked buttons; they stay rows. */
@media (max-width: 768px) {
  html body .rp-today [data-rolanpro-mobile-action-row] { display: flex !important; grid-template-columns: none !important; }
  html body .rp-today .rp-today-tiles[data-rolanpro-mobile-action-row] { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
}

/* «Создать» sheet */
.rp-create-sheet { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
/* The phone layer turns rows of 3+ buttons into one column; the tiles stay two across, as on the canvas. */
html body .rp-create-sheet[data-rolanpro-mobile-action-row] { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
.rp-create-tile {
  position: relative;
  overflow: hidden;
  min-height: 104px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  padding: 14px;
  border: 0;
  border-radius: 8px;
  color: #fff;
  text-align: left;
  cursor: pointer;
}
.rp-create-tile::before {
  content: '';
  position: absolute;
  right: 10px;
  top: -30px;
  width: 34px;
  height: 160px;
  background: linear-gradient(180deg, rgba(255,255,255,.26), rgba(255,255,255,0));
  transform: skewX(-30deg);
}
.rp-create-tile > * { position: relative; }
.rp-create-tile-icon { width: 34px; height: 34px; border-radius: 6px; background: rgba(255,255,255,.2); display: inline-flex; align-items: center; justify-content: center; }
.rp-create-tile b { display: block; font-size: 15px; font-weight: 800; }
.rp-create-tile small { display: block; font-size: 11.5px; font-weight: 700; opacity: .9; }
`;

export const DESIGN_THEME_HTML = `${FONTS}<style id="rolanpro-design-theme">${DESIGN_THEME_CSS}</style>`;
