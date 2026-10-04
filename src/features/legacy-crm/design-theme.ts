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
