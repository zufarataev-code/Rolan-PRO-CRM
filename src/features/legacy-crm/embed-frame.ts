/**
 * The working CRM inside the frame of the new interface (/crm).
 *
 * Owner, 2026-11-17: «все экраны между собой разные, каждый открывается
 * по-своему, нет единого архитектурного решения». Until a section is redrawn
 * in the new template, the new interface shows the working section inside its
 * own frame: one menu, one phone dock, one way to open every screen. Here the
 * working CRM only steps aside — its own menu, phone dock and account buttons
 * are hidden while it is shown inside /crm. Nothing else changes: the same
 * page, the same data, the same actions.
 *
 * Opened directly (not inside /crm) the working CRM is exactly as before.
 */
const ON = 'html[data-rp-embed="1"]';

export const EMBED_FRAME_CSS = `
${ON} .app-shell, ${ON} .app-shell.sidebar-collapsed { grid-template-columns: minmax(0, 1fr) !important; }
${ON} .app-sidebar,
${ON} .mobile-sidebar-scrim,
${ON} .mobile-primary-nav,
${ON} .pulse-mobile-header,
${ON} .app-topbar > .topbar-icon-btn:first-child,
${ON} .app-topbar .topbar-user-pill,
${ON} .app-topbar button[onclick="logout()"],
${ON} .app-topbar button[onclick="openRoleTesting()"] { display: none !important; }
`;

export const EMBED_FRAME_SCRIPT = `
    <script>
      (() => {
        let embedded = false;
        try { embedded = window.self !== window.top && /^\\/crm(\\/|$)/.test(window.parent.location.pathname); } catch (error) { embedded = false; }
        if (embedded) document.documentElement.setAttribute('data-rp-embed', '1');
      })();
    </script>`;

export const EMBED_FRAME_HTML = `<style id="rolanpro-embed-frame">${EMBED_FRAME_CSS}</style>${EMBED_FRAME_SCRIPT}`;
