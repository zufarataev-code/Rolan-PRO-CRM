/**
 * «Зелёный стиль» — the look of the owner's «Кабинет проекта» demo (2026-11-17)
 * as an optional layer over the whole CRM: deep-green sidebar, light green
 * ground, green gradient for the active item and primary buttons.
 *
 * Nothing is removed or replaced. The layer only re-colours the brand tokens
 * of the design canvas theme (design-theme.ts) and the few places where that
 * theme names navy or blue directly. It applies only while
 * <html data-rp-style="green"> is set, which each employee switches on their
 * own device with the «Зелёный стиль» button in the top bar; the choice is
 * kept in localStorage and never written to the workspace.
 *
 * Meaning colours stay as they are: status chips, direction colours and the
 * entity colour code are not touched.
 */
import { BEFORE_PAINT_SCRIPT } from "./before-paint";

const ON = 'html[data-rp-style="green"]';

export const GREEN_STYLE_CSS = `
${ON} {
  --rp-navy-top: #17402F;
  --rp-navy-bottom: #0A1D15;
  --rp-blue: #178A52;
  --rp-cyan: #34BD79;
  --rp-gradient: linear-gradient(135deg, #178A52, #34BD79);
  --rp-ground: radial-gradient(1200px 640px at 100% -12%, rgba(52,189,121,.18), transparent 60%),
    radial-gradient(900px 700px at -12% 112%, rgba(90,170,200,.13), transparent 62%),
    linear-gradient(180deg, #F4F8F5, #E9F1EC);
  --rp-hero: radial-gradient(460px 280px at 108% -12%, rgba(52,189,121,.55), transparent 70%),
    radial-gradient(340px 240px at -12% 125%, rgba(23,138,82,.5), transparent 70%),
    linear-gradient(135deg, #1B4634 0%, #0B2018 100%);
  --rp-card-shadow: 0 1px 2px rgba(16,60,38,.05), 0 14px 34px -18px rgba(16,60,38,.28);
  --rp-card-shadow-hover: 0 2px 4px rgba(16,60,38,.06), 0 22px 40px -18px rgba(16,60,38,.40);
  --rp-line: #DFEAE3;
  --rp-input: #F3F8F5;
  --brand-blue: #178A52;
  --brand-blue-dark: #0F6B3E;
  --brand-accent: #34BD79;
  --brand-light: #E8F5EE;
  --bg: #EEF4F0;
  --border: #DFEAE3;
  --text: #11261B;
  --text-muted: #5F7468;
}
${ON} body { background: #E9F1EC; }
${ON} body .app-sidebar { box-shadow: 10px 0 30px -18px rgba(8,26,18,.7); }
${ON} body .app-sidebar::before { background: linear-gradient(180deg, rgba(52,189,121,0), rgba(52,189,121,.32)); }
${ON} body .app-sidebar::after { background: linear-gradient(180deg, rgba(255,255,255,0), rgba(200,243,218,.18)); }
${ON} body .app-sidebar .nav-item { color: #C9DCD1; }
${ON} body .app-sidebar .nav-item:hover { color: #fff; }
${ON} body .app-sidebar .nav-item.active { color: #fff; box-shadow: 0 10px 22px -8px rgba(52,189,121,.75); }
${ON} body .app-topbar { border-bottom-color: rgba(223,234,227,.9); }
${ON} body .topbar-eyebrow { color: #5F7468; }
${ON} body .card,
${ON} body .pw-panel,
${ON} body .pw-funnel { border-color: rgba(223,234,227,.9); }
${ON} body .pw-today-kicker { color: #178A52; }
${ON} body .btn-primary { box-shadow: 0 10px 24px -12px rgba(23,138,82,.9); }
${ON} body .btn-primary:hover { box-shadow: 0 14px 28px -12px rgba(23,138,82,.95); }
${ON} body .btn-ghost:hover { background: #E8F5EE; border-color: rgba(23,138,82,.2); }
${ON} body input:focus,
${ON} body select:focus,
${ON} body textarea:focus { border-color: #34BD79; box-shadow: 0 0 0 3px rgba(52,189,121,.22); }
${ON} body .modal-backdrop { background: rgba(8,26,18,.45); }
${ON} body .calendar-nav-button:hover,
${ON} body .calendar-nav-button:focus-visible { border-color: rgba(23,138,82,.28); background: #E8F5EE; }
${ON} body .calendar-mode-switch button.active { box-shadow: 0 8px 18px -12px rgba(23,138,82,.9); }
${ON} body .dispatch-week-head .today,
${ON} body .calendar-month-cell.today { background: rgba(52,189,121,.11); }
${ON} body .calendar-month-cell.today { box-shadow: inset 0 0 0 2px rgba(52,189,121,.55); }
${ON} body .dispatch-day-column.today { background-color: rgba(52,189,121,.05); }
${ON} body .mobile-primary-nav button { color: #5F7468; }
${ON} body .mobile-primary-nav button.active { color: #178A52; }
${ON} body .mobile-fab { box-shadow: 0 14px 28px -10px rgba(23,138,82,.95), 0 0 0 5px #F4F8F5; }

.rolanpro-style-toggle { white-space: nowrap; font-size: 12px; padding: 6px 10px; }
@media (max-width: 760px) { .rolanpro-style-toggle { font-size: 11px; padding: 5px 8px; } }
`;

/** Applies the saved choice and keeps one switch in the top bar across re-renders. */
export const GREEN_STYLE_SCRIPT = `
    <script>
      (() => {
        const KEY = 'rp_style';
        let current = '';
        try { current = localStorage.getItem(KEY) === 'green' ? 'green' : ''; } catch (error) { current = ''; }
        const apply = () => {
          if (current === 'green') document.documentElement.setAttribute('data-rp-style', 'green');
          else document.documentElement.removeAttribute('data-rp-style');
        };
        apply();

        function ensureStyleToggle() {
          const host = document.querySelector('.topbar-actions') || document.querySelector('.app-topbar');
          if (!host) return;
          let button = host.querySelector('[data-rolanpro-style-toggle="1"]');
          if (!button) {
            button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn-ghost rolanpro-style-toggle';
            button.setAttribute('data-rolanpro-style-toggle', '1');
            button.addEventListener('click', () => window.rolanproToggleStyle());
            host.insertBefore(button, host.firstChild);
          }
          const label = current === 'green' ? 'Синий стиль' : 'Зелёный стиль';
          if (button.textContent !== label) button.textContent = label;
        }

        window.rolanproToggleStyle = function rolanproToggleStyle() {
          current = current === 'green' ? '' : 'green';
          try {
            if (current) localStorage.setItem(KEY, current);
            else localStorage.removeItem(KEY);
          } catch (error) { /* private mode: the style lasts until the page is closed */ }
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

export const GREEN_STYLE_HTML = `<style id="rolanpro-green-style">${GREEN_STYLE_CSS}</style>${GREEN_STYLE_SCRIPT}`;
