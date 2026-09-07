const APP_START = '<div id="app">';
const SCRIPT_START = "\n<script>";

const MOBILE_ORDERS_PATCH = `
<style id="rolanpro-mobile-orders-cards-style">
  @media (max-width: 768px) {
    table[data-rolanpro-mobile-orders="1"] {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      table-layout: auto !important;
      border: 0 !important;
      background: transparent !important;
    }

    table[data-rolanpro-mobile-orders="1"] thead {
      display: none !important;
    }

    table[data-rolanpro-mobile-orders="1"] tbody {
      display: grid !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      gap: 12px !important;
      padding: 2px 0 18px !important;
    }

    table[data-rolanpro-mobile-orders="1"] tbody > tr {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      gap: 8px 12px !important;
      padding: 14px !important;
      margin: 0 !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 16px !important;
      background: #ffffff !important;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05) !important;
      overflow: hidden !important;
      cursor: pointer;
    }

    table[data-rolanpro-mobile-orders="1"] tbody > tr > td {
      display: block !important;
      width: auto !important;
      min-width: 0 !important;
      max-width: 100% !important;
      padding: 0 !important;
      border: 0 !important;
      white-space: normal !important;
      word-break: normal !important;
      overflow-wrap: break-word !important;
      writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      line-height: 1.35 !important;
    }

    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-hidden="1"] {
      display: none !important;
    }

    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="client"] {
      grid-column: 1;
      grid-row: 1;
      font-size: 16px !important;
      font-weight: 750 !important;
      color: #0f172a !important;
    }

    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="status"] {
      grid-column: 2;
      grid-row: 1;
      justify-self: end;
      align-self: start;
      max-width: min(46vw, 190px) !important;
    }

    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="status"] *,
    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="status"] .status-badge {
      max-width: 100% !important;
      white-space: normal !important;
      word-break: normal !important;
      overflow-wrap: break-word !important;
      writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      line-height: 1.25 !important;
    }

    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="amount"] {
      grid-column: 2;
      justify-self: end;
      align-self: center;
      font-size: 17px !important;
      font-weight: 800 !important;
      color: #0f172a !important;
      white-space: nowrap !important;
      overflow-wrap: normal !important;
    }

    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="order"],
    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="contact"],
    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="service"],
    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="meta"],
    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="unknown"] {
      grid-column: 1 / -1;
      display: grid !important;
      grid-template-columns: minmax(72px, 92px) minmax(0, 1fr) !important;
      align-items: baseline !important;
      gap: 8px !important;
      font-size: 13px !important;
      color: #475569 !important;
    }

    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="area"] {
      grid-column: 1;
      align-self: center;
      font-size: 13px !important;
      color: #475569 !important;
    }

    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-mobile-label]::before {
      content: attr(data-mobile-label);
      min-width: 0;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.2;
      text-transform: none;
      white-space: normal;
      word-break: normal;
      writing-mode: horizontal-tb;
    }

    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="client"]::before,
    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="status"]::before,
    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="amount"]::before,
    table[data-rolanpro-mobile-orders="1"] tbody > tr > td[data-order-role="area"]::before {
      content: none !important;
    }

    table[data-rolanpro-mobile-orders="1"] tbody > tr button,
    table[data-rolanpro-mobile-orders="1"] tbody > tr a {
      min-height: 44px;
      max-width: 100% !important;
    }
  }
</style>
<script id="rolanpro-mobile-orders-cards-script">
  (() => {
    const MOBILE_MAX = 768;
    const FALLBACK_LABELS = ['Заказ', 'Клиент', 'Статус', 'Площадь', 'Сумма'];
    const FALLBACK_ROLES = ['order', 'client', 'status', 'area', 'amount'];

    const normalize = (value) => String(value || '')
      .replace(/\\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('ru-RU');

    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };

    const headerRole = (header) => {
      const value = normalize(header);
      if (!value) return null;
      if (/клиент|customer|заказчик/.test(value)) return 'client';
      if (/телефон|phone|email|e-mail|почт|контакт/.test(value)) return 'contact';
      if (/статус|status|этап|stage/.test(value)) return 'status';
      if (/площад|area|sq\\.? ?ft|sqft|м²|m²/.test(value)) return 'area';
      if (/сумм|итого|total|amount|стоим|price/.test(value)) return 'amount';
      if (/услуг|service|работ|scope|тип/.test(value)) return 'service';
      if (/заказ|order|номер|^№$|^#$/.test(value)) return 'order';
      if (/дата|date|менедж|manager|ответств|owner|след|next|срок|due/.test(value)) return 'meta';
      return null;
    };

    const getHeaders = (table) => Array.from(table.querySelectorAll('thead th')).map((cell) =>
      String(cell.textContent || '').replace(/\\s+/g, ' ').trim(),
    );

    const hasOrdersHeading = () => Array.from(document.querySelectorAll('h1, h2, h3, [data-page-title], .page-title'))
      .some((element) => isVisible(element) && /^заказы(?:\\s|\\(|$)/i.test(String(element.textContent || '').trim()));

    const looksLikeOrdersTable = (table) => {
      const headers = getHeaders(table);
      const roles = headers.map(headerRole).filter(Boolean);
      return roles.includes('client') && roles.includes('status') && roles.includes('order');
    };

    const rowCount = (table) => table.querySelectorAll('tbody > tr').length;

    const findOrdersTable = () => {
      const tables = Array.from(document.querySelectorAll('table'))
        .filter((table) => isVisible(table) && !table.closest('.modal-backdrop, [role="dialog"]') && rowCount(table) > 0);

      if (!tables.length) return null;

      const semantic = tables.find(looksLikeOrdersTable);
      if (semantic) return semantic;

      if (!hasOrdersHeading()) return null;

      return tables
        .filter((table) => table.querySelectorAll('tbody > tr > td').length >= 3)
        .sort((left, right) => rowCount(right) - rowCount(left))[0] || null;
    };

    const enhanceOrdersTable = () => {
      if (window.innerWidth > MOBILE_MAX) return;

      const table = findOrdersTable();
      if (!table) return;

      table.setAttribute('data-rolanpro-mobile-orders', '1');
      const headers = getHeaders(table);

      Array.from(table.querySelectorAll('tbody > tr')).forEach((row) => {
        Array.from(row.children).forEach((cell, index) => {
          if (!(cell instanceof HTMLTableCellElement)) return;

          const header = headers[index] || FALLBACK_LABELS[index] || '';
          const role = headerRole(header) || FALLBACK_ROLES[index] || 'unknown';
          const text = String(cell.textContent || '').replace(/\\s+/g, ' ').trim();

          cell.setAttribute('data-order-role', role);
          if (header) cell.setAttribute('data-mobile-label', header);
          else cell.removeAttribute('data-mobile-label');

          if (!text || /^[-—–]+$/.test(text)) cell.setAttribute('data-order-hidden', '1');
          else cell.removeAttribute('data-order-hidden');
        });
      });
    };

    let queued = false;
    const queueEnhancement = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        enhanceOrdersTable();
      });
    };

    const observer = new MutationObserver(queueEnhancement);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('resize', queueEnhancement, { passive: true });
    window.addEventListener('hashchange', queueEnhancement);
    queueEnhancement();
  })();
</script>`;

const MOBILE_PROPOSALS_PATCH = `
<style id="rolanpro-mobile-proposals-cards-style">
  @media (max-width: 768px) {
    table[data-rolanpro-mobile-proposals="1"] {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      table-layout: auto !important;
      border: 0 !important;
      background: transparent !important;
    }

    table[data-rolanpro-mobile-proposals="1"] thead {
      display: none !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody {
      display: grid !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      gap: 12px !important;
      padding: 2px 0 18px !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      gap: 8px 12px !important;
      padding: 14px !important;
      margin: 0 !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 16px !important;
      background: #ffffff !important;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05) !important;
      overflow: hidden !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td {
      display: block !important;
      width: auto !important;
      min-width: 0 !important;
      max-width: 100% !important;
      padding: 0 !important;
      border: 0 !important;
      white-space: normal !important;
      word-break: normal !important;
      overflow-wrap: break-word !important;
      writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      line-height: 1.35 !important;
      color: #334155 !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-hidden="1"] {
      display: none !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="primary"] {
      grid-column: 1 / -1;
      font-size: 15px !important;
      font-weight: 800 !important;
      color: #0f172a !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="recipient"] {
      grid-column: 1 / -1;
      font-size: 14px !important;
      font-weight: 650 !important;
      color: #1e293b !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="status"] {
      grid-column: 1 / -1;
      justify-self: start;
      max-width: 100% !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="status"] *,
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="status"] .status-badge {
      max-width: 100% !important;
      white-space: normal !important;
      word-break: normal !important;
      overflow-wrap: break-word !important;
      writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      line-height: 1.25 !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="manager"],
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="sent"],
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="viewed"],
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="accepted"],
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="meta"] {
      grid-column: 1 / -1;
      display: grid !important;
      grid-template-columns: minmax(82px, 108px) minmax(0, 1fr) !important;
      gap: 8px !important;
      align-items: baseline !important;
      font-size: 13px !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-mobile-label]::before {
      content: attr(data-proposal-mobile-label);
      color: #94a3b8;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.2;
      white-space: normal;
      word-break: normal;
      writing-mode: horizontal-tb;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="primary"]::before,
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="recipient"]::before,
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="status"]::before {
      content: none !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr button,
    table[data-rolanpro-mobile-proposals="1"] tbody > tr a {
      min-height: 44px;
      max-width: 100% !important;
      white-space: normal !important;
      word-break: normal !important;
      writing-mode: horizontal-tb !important;
    }
  }
</style>
<script id="rolanpro-mobile-proposals-cards-script">
  (() => {
    const MOBILE_MAX = 768;

    const normalizeProposal = (value) => String(value || '')
      .replace(/\\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('ru-RU');

    const isProposalVisible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };

    const proposalHeaderRole = (header) => {
      const value = normalizeProposal(header);
      if (!value) return 'meta';
      if (/^кп|proposal|предлож|заказ|order/.test(value)) return 'primary';
      if (/кому|клиент|customer|получател|recipient/.test(value)) return 'recipient';
      if (/менедж|manager/.test(value)) return 'manager';
      if (/статус|status/.test(value)) return 'status';
      if (/отправ|sent/.test(value)) return 'sent';
      if (/просмотр|viewed|open/.test(value)) return 'viewed';
      if (/принят|accepted|approved/.test(value)) return 'accepted';
      return 'meta';
    };

    const proposalHeaders = (table) => Array.from(table.querySelectorAll('thead th')).map((cell) =>
      String(cell.textContent || '').replace(/\\s+/g, ' ').trim(),
    );

    const hasProposalsHeading = () => Array.from(document.querySelectorAll('h1, h2, h3, [data-page-title], .page-title'))
      .some((element) => {
        if (!isProposalVisible(element)) return false;
        return /коммерческие предложения|реестр кп/i.test(String(element.textContent || '').trim());
      });

    const looksLikeProposalsTable = (table) => {
      const roles = proposalHeaders(table).map(proposalHeaderRole);
      return roles.includes('primary') && roles.includes('status') && (roles.includes('recipient') || roles.includes('manager'));
    };

    const proposalRowCount = (table) => table.querySelectorAll('tbody > tr').length;

    const findProposalsTable = () => {
      const tables = Array.from(document.querySelectorAll('table'))
        .filter((table) => isProposalVisible(table) && !table.closest('.modal-backdrop, [role="dialog"]') && proposalRowCount(table) > 0);

      if (!tables.length) return null;

      const semantic = tables.find(looksLikeProposalsTable);
      if (semantic) return semantic;

      if (!hasProposalsHeading()) return null;

      return tables
        .filter((table) => table.querySelectorAll('tbody > tr > td').length >= 3)
        .sort((left, right) => proposalRowCount(right) - proposalRowCount(left))[0] || null;
    };

    const enhanceProposalsTable = () => {
      if (window.innerWidth > MOBILE_MAX) return;

      const table = findProposalsTable();
      if (!table) return;

      table.setAttribute('data-rolanpro-mobile-proposals', '1');
      const headers = proposalHeaders(table);

      Array.from(table.querySelectorAll('tbody > tr')).forEach((row) => {
        Array.from(row.children).forEach((cell, index) => {
          if (!(cell instanceof HTMLTableCellElement)) return;

          const header = headers[index] || '';
          const role = proposalHeaderRole(header);
          const text = String(cell.textContent || '').replace(/\\s+/g, ' ').trim();

          cell.setAttribute('data-proposal-role', role);
          if (header) cell.setAttribute('data-proposal-mobile-label', header);
          else cell.removeAttribute('data-proposal-mobile-label');

          if (!text || /^[-—–]+$/.test(text)) cell.setAttribute('data-proposal-hidden', '1');
          else cell.removeAttribute('data-proposal-hidden');
        });
      });
    };

    let proposalsQueued = false;
    const queueProposalsEnhancement = () => {
      if (proposalsQueued) return;
      proposalsQueued = true;
      window.requestAnimationFrame(() => {
        proposalsQueued = false;
        enhanceProposalsTable();
      });
    };

    const proposalsObserver = new MutationObserver(queueProposalsEnhancement);
    proposalsObserver.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('resize', queueProposalsEnhancement, { passive: true });
    window.addEventListener('hashchange', queueProposalsEnhancement);
    queueProposalsEnhancement();
  })();
</script>`;

function injectMobileOrdersCards(html: string) {
  if (html.includes('id="rolanpro-mobile-orders-cards-style"')) return html;

  const closingBodyIndex = html.toLowerCase().lastIndexOf("</body>");
  if (closingBodyIndex < 0) return `${html}${MOBILE_ORDERS_PATCH}`;

  return `${html.slice(0, closingBodyIndex)}${MOBILE_ORDERS_PATCH}${html.slice(closingBodyIndex)}`;
}

function injectMobileProposalsCards(html: string) {
  if (html.includes('id="rolanpro-mobile-proposals-cards-style"')) return html;

  const closingBodyIndex = html.toLowerCase().lastIndexOf("</body>");
  if (closingBodyIndex < 0) return `${html}${MOBILE_PROPOSALS_PATCH}`;

  return `${html.slice(0, closingBodyIndex)}${MOBILE_PROPOSALS_PATCH}${html.slice(closingBodyIndex)}`;
}

export function replaceLegacyBootstrapLogin(html: string) {
  const appStart = html.indexOf(APP_START);
  const scriptStart = html.indexOf(SCRIPT_START, appStart + APP_START.length);

  if (appStart < 0 || scriptStart < 0) {
    throw new Error("Legacy CRM application shell markers were not found.");
  }

  const loadingShell = `<div id="app" aria-busy="true">
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;color:#334155;font:700 16px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    Загрузка ROLANPRO CRM…
  </div>
</div>`;

  const withoutBootstrapLogin = `${html.slice(0, appStart)}${loadingShell}${html.slice(scriptStart)}`;
  return injectMobileProposalsCards(injectMobileOrdersCards(withoutBootstrapLogin));
}