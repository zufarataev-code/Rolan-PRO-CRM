/**
 * Inline script fragment for the /legacy-crm DOM patches.
 *
 * The legacy CRM rebuilds the page on every click. The patches below used to
 * wait for the NEXT animation frame, so the browser first painted the
 * unpatched page (no «Калькулятор» item, old user pill, duplicate sidebar
 * user, manager-only items still visible) and corrected it one frame later:
 * the menu and the top bar visibly jumped after every click.
 *
 * `beforePaint` runs the patch as a microtask right after the render, before
 * the browser paints. A patch that keeps re-triggering itself (more than 50
 * runs in one frame across all patches) falls back to the next frame instead
 * of freezing the page.
 */
export const BEFORE_PAINT_SCRIPT = `
    const beforePaint = window.__rolanproBeforePaint || (window.__rolanproBeforePaint = (() => {
      let runs = 0;
      let resetQueued = false;
      return (callback) => {
        if (!resetQueued) {
          resetQueued = true;
          window.requestAnimationFrame(() => { runs = 0; resetQueued = false; });
        }
        runs += 1;
        if (runs > 50) window.requestAnimationFrame(callback);
        else queueMicrotask(callback);
      };
    })());
`;
