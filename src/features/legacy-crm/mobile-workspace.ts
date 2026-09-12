const MOBILE_WORKSPACE_PATCH = `
<style id="rolanpro-mobile-workspace-style">
  @media (max-width: 768px) {
    html,
    body,
    #app {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      overflow-x: hidden !important;
      -webkit-text-size-adjust: 100%;
    }

    body {
      margin: 0 !important;
    }

    #app,
    #app > *,
    main,
    section,
    article,
    form,
    fieldset {
      min-width: 0 !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }

    img,
    svg,
    canvas,
    video,
    iframe {
      max-width: 100% !important;
    }

    input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="button"]):not([type="submit"]):not([type="reset"]),
    select,
    textarea {
      width: 100%;
      max-width: 100% !important;
      min-width: 0 !important;
      box-sizing: border-box !important;
      font-size: 16px !important;
    }

    input[type="checkbox"],
    input[type="radio"],
    input[type="range"],
    input[type="color"] {
      width: auto !important;
      min-width: auto !important;
      max-width: none !important;
      flex: 0 0 auto !important;
    }

    textarea {
      min-height: 104px;
      resize: vertical;
    }

    button,
    [role="button"],
    a.btn,
    .btn-primary,
    .btn-secondary,
    .btn-ghost {
      min-height: 44px;
      max-width: 100%;
      touch-action: manipulation;
    }

    [data-rolanpro-mobile-stack="1"] {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      gap: 12px !important;
    }

    [data-rolanpro-mobile-toolbar="1"] {
      display: flex !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      flex-wrap: wrap !important;
      align-items: stretch !important;
      gap: 8px !important;
    }

    [data-rolanpro-mobile-toolbar="1"] > input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="button"]):not([type="submit"]):not([type="reset"]),
    [data-rolanpro-mobile-toolbar="1"] > select,
    [data-rolanpro-mobile-toolbar="1"] > textarea {
      flex: 1 1 100% !important;
    }

    [data-rolanpro-mobile-toolbar="1"] > button,
    [data-rolanpro-mobile-toolbar="1"] > [role="button"],
    [data-rolanpro-mobile-toolbar="1"] > a {
      flex: 1 1 auto;
    }

    [data-rolanpro-mobile-scroll="1"] {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-inline: contain;
    }

    .modal-backdrop,
    [data-modal-backdrop] {
      padding: 12px !important;
      box-sizing: border-box !important;
      overflow: auto !important;
      align-items: flex-start !important;
    }

    .modal-content,
    .workspace-modal,
    [role="dialog"],
    [data-rolanpro-mobile-dialog="1"] {
      width: min(100%, calc(100vw - 24px)) !important;
      max-width: calc(100vw - 24px) !important;
      min-width: 0 !important;
      max-height: calc(100dvh - 24px) !important;
      margin: 0 auto !important;
      overflow: auto !important;
      box-sizing: border-box !important;
      border-radius: 16px !important;
    }

    [data-rolanpro-mobile-nav="1"] {
      max-width: 100% !important;
      min-width: 0 !important;
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-inline: contain;
      scrollbar-width: thin;
    }

    [data-rolanpro-mobile-nav="1"] > * {
      min-width: max-content;
    }

    table[data-rolanpro-mobile-generic="1"] {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      border: 0 !important;
      background: transparent !important;
      table-layout: auto !important;
    }

    table[data-rolanpro-mobile-generic="1"] thead {
      display: none !important;
    }

    table[data-rolanpro-mobile-generic="1"] tbody {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 12px !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      padding: 2px 0 16px !important;
    }

    table[data-rolanpro-mobile-generic="1"] tbody > tr {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 8px !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      padding: 14px !important;
      margin: 0 !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 16px !important;
      background: #fff !important;
      box-shadow: 0 1px 2px rgba(15, 23, 42, .05) !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
    }

    table[data-rolanpro-mobile-generic="1"] tbody > tr > td {
      display: grid !important;
      grid-template-columns: minmax(86px, 34%) minmax(0, 1fr) !important;
      align-items: start !important;
      gap: 8px !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      white-space: normal !important;
      word-break: normal !important;
      overflow-wrap: anywhere !important;
      writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      line-height: 1.35 !important;
      box-sizing: border-box !important;
    }

    table[data-rolanpro-mobile-generic="1"] tbody > tr > td[data-mobile-empty="1"] {
      display: none !important;
    }

    table[data-rolanpro-mobile-generic="1"] tbody > tr > td[data-mobile-primary="1"] {
      display: block !important;
      font-size: 16px !important;
      font-weight: 750 !important;
      color: #0f172a !important;
      margin-bottom: 2px !important;
    }

    table[data-rolanpro-mobile-generic="1"] tbody > tr > td[data-mobile-primary="1"]::before {
      content: none !important;
    }

    table[data-rolanpro-mobile-generic="1"] tbody > tr > td[data-mobile-label]::before {
      content: attr(data-mobile-label);
      min-width: 0;
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.25;
      overflow-wrap: break-word;
    }

    table[data-rolanpro-mobile-generic="1"] tbody > tr > td button,
    table[data-rolanpro-mobile-generic="1"] tbody > tr > td a {
      min-height: 44px;
      white-space: normal !important;
    }

    [data-rolanpro-mobile-action-row="1"] {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 8px !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
    }

    [data-rolanpro-mobile-action-row="1"] > * {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
    }

    @media (max-width: 430px) {
      [data-rolanpro-mobile-action-row="1"] {
        grid-template-columns: minmax(0, 1fr) !important;
      }
    }
  }
</style>
<script id="rolanpro-mobile-workspace-script">
  (() => {
    const MOBILE_MAX = 768;
    const SPECIAL_TABLE_SELECTOR = [
      'table[data-rolanpro-mobile-orders="1"]',
      'table[data-rolanpro-mobile-proposals="1"]',
    ].join(',');

    const normalizeText = (value) => String(value || '').replace(/\\s+/g, ' ').trim();

    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };

    const hasInteractiveChild = (element) => Boolean(
      element.querySelector('input, select, textarea, button, a[href], [role="button"]'),
    );

    const isCalendarLike = (table) => {
      const haystack = [
        table.id,
        table.className,
        table.getAttribute('aria-label'),
        table.getAttribute('data-view'),
        table.closest('[class*="calendar" i], [id*="calendar" i], [class*="scheduler" i], [id*="scheduler" i]')?.className,
      ].filter(Boolean).join(' ').toLowerCase();
      return table.getAttribute('role') === 'grid' || /calendar|календар|scheduler|расписан|gantt/.test(haystack);
    };

    const tableHeaders = (table) => Array.from(table.querySelectorAll('thead th')).map((cell) =>
      normalizeText(cell.textContent),
    );

    const enhanceGenericTable = (table) => {
      if (!(table instanceof HTMLTableElement) || !isVisible(table)) return;
      if (table.matches(SPECIAL_TABLE_SELECTOR)) return;
      if (isCalendarLike(table)) {
        const holder = table.parentElement;
        if (holder) holder.setAttribute('data-rolanpro-mobile-scroll', '1');
        return;
      }

      const rows = Array.from(table.querySelectorAll(':scope > tbody > tr'));
      if (!rows.length) return;

      const headers = tableHeaders(table);
      table.setAttribute('data-rolanpro-mobile-generic', '1');

      rows.forEach((row) => {
        let primaryAssigned = false;
        Array.from(row.children).forEach((cell, index) => {
          if (!(cell instanceof HTMLTableCellElement)) return;
          const text = normalizeText(cell.textContent);
          const header = headers[index] || '';

          if (header) cell.setAttribute('data-mobile-label', header);
          else cell.removeAttribute('data-mobile-label');

          if (!text || /^[-—–]+$/.test(text)) {
            cell.setAttribute('data-mobile-empty', '1');
          } else {
            cell.removeAttribute('data-mobile-empty');
          }

          const onlyActions = Boolean(cell.querySelector('button, a[href], [role="button"]')) &&
            normalizeText(cell.textContent).length < 80;
          if (!primaryAssigned && text && !onlyActions) {
            cell.setAttribute('data-mobile-primary', '1');
            primaryAssigned = true;
          } else {
            cell.removeAttribute('data-mobile-primary');
          }
        });
      });
    };

    const enhanceGrid = (element) => {
      if (!(element instanceof HTMLElement) || !isVisible(element)) return;
      if (element.closest('table')) return;
      const style = window.getComputedStyle(element);
      if (style.display !== 'grid') return;
      const columns = style.gridTemplateColumns.split(' ').filter(Boolean);
      if (columns.length < 2) return;
      if (!hasInteractiveChild(element) && element.children.length <= 2) return;
      element.setAttribute('data-rolanpro-mobile-stack', '1');
    };

    const enhanceToolbar = (element) => {
      if (!(element instanceof HTMLElement) || !isVisible(element)) return;
      if (element.closest('table')) return;
      const style = window.getComputedStyle(element);
      if (style.display !== 'flex' && style.display !== 'inline-flex') return;
      if (element.children.length < 2) return;

      const interactiveChildren = Array.from(element.children).filter((child) =>
        child.matches?.('input, select, textarea, button, a[href], [role="button"]') ||
        child.querySelector?.('input, select, textarea, button, a[href], [role="button"]'),
      );

      if (interactiveChildren.length >= 2 && (element.scrollWidth > window.innerWidth || element.children.length >= 3)) {
        element.setAttribute('data-rolanpro-mobile-toolbar', '1');
      }
    };

    const enhanceDialogs = () => {
      document.querySelectorAll('.modal-content, .workspace-modal, [role="dialog"]').forEach((dialog) => {
        if (dialog instanceof HTMLElement && isVisible(dialog)) {
          dialog.setAttribute('data-rolanpro-mobile-dialog', '1');
        }
      });
    };

    const enhanceNavigation = () => {
      document.querySelectorAll('nav').forEach((nav) => {
        if (!(nav instanceof HTMLElement) || !isVisible(nav)) return;
        if (nav.scrollWidth > window.innerWidth || nav.querySelectorAll('a, button, [role="button"]').length >= 4) {
          nav.setAttribute('data-rolanpro-mobile-nav', '1');
        }
      });
    };

    const enhanceActionRows = () => {
      document.querySelectorAll('form, .modal-content, .workspace-modal, main, section').forEach((container) => {
        if (!(container instanceof HTMLElement) || !isVisible(container)) return;
        Array.from(container.children).forEach((row) => {
          if (!(row instanceof HTMLElement) || !isVisible(row) || row.closest('table')) return;
          const directActions = Array.from(row.children).filter((child) =>
            child.matches?.('button, a[href], [role="button"]'),
          );
          if (directActions.length >= 3) row.setAttribute('data-rolanpro-mobile-action-row', '1');
        });
      });
    };

    const clearMobileAnnotations = () => {
      document.querySelectorAll([
        '[data-rolanpro-mobile-generic]',
        '[data-rolanpro-mobile-stack]',
        '[data-rolanpro-mobile-toolbar]',
        '[data-rolanpro-mobile-scroll]',
        '[data-rolanpro-mobile-dialog]',
        '[data-rolanpro-mobile-nav]',
        '[data-rolanpro-mobile-action-row]',
        '[data-mobile-label]',
        '[data-mobile-empty]',
        '[data-mobile-primary]',
      ].join(',')).forEach((element) => {
        if (!(element instanceof HTMLElement)) return;
        if (element.matches(SPECIAL_TABLE_SELECTOR) || element.closest(SPECIAL_TABLE_SELECTOR)) return;
        [
          'data-rolanpro-mobile-generic',
          'data-rolanpro-mobile-stack',
          'data-rolanpro-mobile-toolbar',
          'data-rolanpro-mobile-scroll',
          'data-rolanpro-mobile-dialog',
          'data-rolanpro-mobile-nav',
          'data-rolanpro-mobile-action-row',
          'data-mobile-label',
          'data-mobile-empty',
          'data-mobile-primary',
        ].forEach((attribute) => element.removeAttribute(attribute));
      });
    };

    const auditOverflow = () => {
      document.querySelectorAll('main *, section *, .modal-content *, .workspace-modal *').forEach((element) => {
        if (!(element instanceof HTMLElement) || !isVisible(element) || element.closest('table')) return;
        if (element.scrollWidth > window.innerWidth + 4) {
          element.setAttribute('data-rolanpro-mobile-scroll', '1');
        }
      });
    };

    const enhanceMobileWorkspace = () => {
      if (window.innerWidth > MOBILE_MAX) {
        clearMobileAnnotations();
        return;
      }

      document.querySelectorAll('table').forEach(enhanceGenericTable);
      document.querySelectorAll('form > div, main .grid, section .grid, .modal-content .grid, .workspace-modal .grid').forEach(enhanceGrid);
      document.querySelectorAll('form > div, main > div, section > div, .modal-content > div, .workspace-modal > div').forEach(enhanceToolbar);
      enhanceDialogs();
      enhanceNavigation();
      enhanceActionRows();
      auditOverflow();
      document.documentElement.setAttribute('data-rolanpro-mobile-ready', '1');
    };

    let queued = false;
    const queueEnhancement = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        enhanceMobileWorkspace();
      });
    };

    const observer = new MutationObserver(queueEnhancement);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('resize', queueEnhancement, { passive: true });
    window.addEventListener('orientationchange', queueEnhancement, { passive: true });
    window.addEventListener('hashchange', queueEnhancement);
    queueEnhancement();
  })();
</script>`;

export function injectMobileWorkspaceAdapter(html: string) {
  if (html.includes('id="rolanpro-mobile-workspace-style"')) return html;

  const closingBodyIndex = html.toLowerCase().lastIndexOf("</body>");
  if (closingBodyIndex < 0) return `${html}${MOBILE_WORKSPACE_PATCH}`;

  return `${html.slice(0, closingBodyIndex)}${MOBILE_WORKSPACE_PATCH}${html.slice(closingBodyIndex)}`;
}
