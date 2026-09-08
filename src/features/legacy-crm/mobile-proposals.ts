const MOBILE_PROPOSALS_PATCH = `
<style id="rolanpro-mobile-proposals-cards-style">
  @media (max-width: 768px) {
    [data-rolanpro-mobile-proposals-wrap="1"],
    [data-rolanpro-mobile-proposals-card="1"] {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      overflow: visible !important;
    }

    table[data-rolanpro-mobile-proposals="1"] {
      display: block !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      table-layout: auto !important;
      border: 0 !important;
      background: transparent !important;
    }

    table[data-rolanpro-mobile-proposals="1"] colgroup,
    table[data-rolanpro-mobile-proposals="1"] thead {
      display: none !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody {
      display: grid !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      gap: 12px !important;
      padding: 12px !important;
      background: #f8fafc !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      gap: 9px !important;
      padding: 15px !important;
      margin: 0 !important;
      border: 1px solid #e2e8f0 !important;
      border-radius: 16px !important;
      background: #ffffff !important;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06) !important;
      overflow: hidden !important;
      writing-mode: horizontal-tb !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td {
      display: grid !important;
      grid-template-columns: 112px minmax(0, 1fr) !important;
      align-items: start !important;
      gap: 8px !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
      height: auto !important;
      min-height: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      border: 0 !important;
      white-space: normal !important;
      word-break: normal !important;
      overflow-wrap: anywhere !important;
      writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      line-height: 1.35 !important;
      color: #334155 !important;
      text-align: left !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-hidden="1"] {
      display: none !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="proposal"] {
      display: block !important;
      order: 1 !important;
      padding-bottom: 5px !important;
      font-size: 15px !important;
      font-weight: 800 !important;
      color: #0f172a !important;
      overflow-wrap: anywhere !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="proposal"]::before {
      content: none !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="contact"] { order: 2 !important; }
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="owner"] { order: 3 !important; }
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="status"] { order: 4 !important; }
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="sent"] { order: 5 !important; }
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="viewed"] { order: 6 !important; }
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="amount"] { order: 7 !important; }
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="detail"] { order: 8 !important; }
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="actions"] { order: 9 !important; }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="amount"] {
      font-weight: 800 !important;
      color: #0f172a !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="status"] > *,
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-proposal-role="actions"] > * {
      justify-self: start !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td[data-mobile-label]::before {
      content: attr(data-mobile-label) !important;
      display: block !important;
      width: auto !important;
      min-width: 0 !important;
      max-width: 112px !important;
      color: #94a3b8 !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      line-height: 1.25 !important;
      white-space: normal !important;
      word-break: keep-all !important;
      overflow-wrap: normal !important;
      writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      text-align: left !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td > *,
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td > a,
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td > div,
    table[data-rolanpro-mobile-proposals="1"] tbody > tr > td > span {
      min-width: 0 !important;
      max-width: 100% !important;
      white-space: normal !important;
      word-break: normal !important;
      overflow-wrap: anywhere !important;
      writing-mode: horizontal-tb !important;
      text-orientation: mixed !important;
      text-align: left !important;
    }

    table[data-rolanpro-mobile-proposals="1"] tbody > tr button,
    table[data-rolanpro-mobile-proposals="1"] tbody > tr a[role="button"] {
      min-height: 44px !important;
      max-width: 100% !important;
    }

    #proposal-registry-search {
      width: 100% !important;
      min-width: 0 !important;
      max-width: 100% !important;
    }
  }
</style>
<script id="rolanpro-mobile-proposals-cards-script">
  (() => {
    const MOBILE_MAX = 768;
    const FALLBACK_LABELS = ['КП / заказ', 'Кому отправлено', 'Менеджер', 'Статус', 'Отправлено', 'Просмотрено', 'Сумма', 'Действия'];
    const FALLBACK_ROLES = ['proposal', 'contact', 'owner', 'status', 'sent', 'viewed', 'amount', 'actions'];

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
      if (/кп\\s*\\/\\s*заказ|^кп$|proposal|quote|номер|^№$|^#$/.test(value)) return 'proposal';
      if (/кому\\s+отправлено|получател|recipient|email|e-mail|телефон|phone|контакт/.test(value)) return 'contact';
      if (/ответственн|менедж|manager|owner|владел/.test(value)) return 'owner';
      if (/статус|status|этап|stage/.test(value)) return 'status';
      if (/^отправлено$|дата\\s+отправ|sent/.test(value)) return 'sent';
      if (/просмотрено|просмотр|viewed|opened|открыт/.test(value)) return 'viewed';
      if (/сумм|итого|total|amount|стоим|price/.test(value)) return 'amount';
      if (/действ|action|открыть|open|скач|download/.test(value)) return 'actions';
      return 'detail';
    };

    const getHeaders = (table) => Array.from(table.querySelectorAll('thead th')).map((cell) =>
      String(cell.textContent || '').replace(/\\s+/g, ' ').trim(),
    );

    const findProposalsHeading = () => Array.from(document.querySelectorAll('h1, h2, h3, [data-page-title], .page-title'))
      .find((element) => isVisible(element) && /коммерческ\\w*\\s+предложен|commercial\\s+proposals?|^\\s*кп(?:\\s|$)/i.test(String(element.textContent || '').trim()));

    const looksLikeProposalsTable = (table) => {
      const headers = getHeaders(table);
      if (!headers.length) return false;
      const roles = headers.map(headerRole);
      const signature = ['proposal', 'contact', 'owner', 'status', 'sent', 'viewed'];
      const score = signature.filter((role) => roles.includes(role)).length;
      return roles.includes('proposal') && roles.includes('contact') && score >= 4;
    };

    const rowCount = (table) => table.querySelectorAll('tbody > tr').length;

    const findProposalsTable = () => {
      const tables = Array.from(document.querySelectorAll('table'))
        .filter((table) => isVisible(table) && !table.closest('.modal-backdrop, [role="dialog"]') && rowCount(table) > 0);

      if (!tables.length) return null;

      const semantic = tables.find(looksLikeProposalsTable);
      if (semantic) return semantic;

      const heading = findProposalsHeading();
      if (!heading) return null;

      const scope = heading.closest('section, main, [data-page], .page, .content, .workspace') || heading.parentElement;
      const scoped = scope ? tables.filter((table) => scope.contains(table)) : [];
      const candidates = scoped.length ? scoped : tables;

      return candidates
        .filter((table) => table.querySelectorAll('tbody > tr > td').length >= 6)
        .sort((left, right) => rowCount(right) - rowCount(left))[0] || null;
    };

    const markWrappers = (table) => {
      const direct = table.parentElement;
      if (direct) direct.setAttribute('data-rolanpro-mobile-proposals-wrap', '1');

      const card = table.closest('.card');
      if (card) card.setAttribute('data-rolanpro-mobile-proposals-card', '1');
    };

    const enhanceProposalsTable = () => {
      if (window.innerWidth > MOBILE_MAX) return;

      const table = findProposalsTable();
      if (!table) return;

      table.setAttribute('data-rolanpro-mobile-proposals', '1');
      markWrappers(table);

      const headers = getHeaders(table);
      Array.from(table.querySelectorAll('tbody > tr')).forEach((row) => {
        Array.from(row.children).forEach((cell, index) => {
          if (!(cell instanceof HTMLTableCellElement)) return;

          const header = headers[index] || FALLBACK_LABELS[index] || 'Детали';
          const role = headerRole(header) || FALLBACK_ROLES[index] || 'detail';
          const text = String(cell.textContent || '').replace(/\\s+/g, ' ').trim();

          cell.setAttribute('data-proposal-role', role);
          if (role !== 'proposal') cell.setAttribute('data-mobile-label', header);
          else cell.removeAttribute('data-mobile-label');

          if (!text || /^[-—–]+$/.test(text)) cell.setAttribute('data-proposal-hidden', '1');
          else cell.removeAttribute('data-proposal-hidden');
        });
      });
    };

    let queued = false;
    const queueEnhancement = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        enhanceProposalsTable();
      });
    };

    const observer = new MutationObserver(queueEnhancement);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('resize', queueEnhancement, { passive: true });
    window.addEventListener('hashchange', queueEnhancement);
    queueEnhancement();
  })();
</script>`;

export function injectMobileProposalsCards(html: string) {
  if (html.includes('id="rolanpro-mobile-proposals-cards-style"')) return html;

  const closingBodyIndex = html.toLowerCase().lastIndexOf('</body>');
  if (closingBodyIndex < 0) return `${html}${MOBILE_PROPOSALS_PATCH}`;

  return `${html.slice(0, closingBodyIndex)}${MOBILE_PROPOSALS_PATCH}${html.slice(closingBodyIndex)}`;
}
