const ORDER_INTAKE_CLEANUP_PATCH = `
<style id="rolanpro-order-intake-cleanup-style">
  [data-rolanpro-order-intake-sidebar="1"],
  [data-rolanpro-order-intake-hint-card="1"] {
    display: none !important;
  }

  [data-rolanpro-order-intake-layout="1"] {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  [data-rolanpro-order-intake-layout="1"] > * {
    min-width: 0 !important;
    max-width: 100% !important;
  }
</style>
<script id="rolanpro-order-intake-cleanup-script">
  (() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();

    const findByExactText = (root, text) => Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,div,span,p,strong'))
      .find((element) => normalize(element.textContent) === text);

    const lowestCommonAncestor = (left, right) => {
      if (!left || !right) return null;
      const leftAncestors = new Set();
      let node = left;
      while (node) {
        leftAncestors.add(node);
        node = node.parentElement;
      }
      node = right;
      while (node) {
        if (leftAncestors.has(node)) return node;
        node = node.parentElement;
      }
      return null;
    };

    const findGridParent = (element, stopAt) => {
      let node = element?.parentElement || null;
      for (let depth = 0; node && depth < 7 && node !== stopAt; depth += 1, node = node.parentElement) {
        const style = window.getComputedStyle(node);
        if (style.display === 'grid' || node.classList.contains('grid')) return node;
      }
      return null;
    };

    const findHintCard = (heading, modal) => {
      let node = heading;
      for (let depth = 0; node && depth < 5 && node !== modal; depth += 1, node = node.parentElement) {
        const text = normalize(node.textContent);
        const hasOneKnownHeading = text.includes('Что будет после создания') || text.includes('Что происходит дальше');
        const hasMainFormText = text.includes('Клиент и объект') || text.includes('Направление услуги');
        if (hasOneKnownHeading && !hasMainFormText && node.children.length > 1) return node;
      }
      return heading.parentElement;
    };

    const cleanupOrderIntake = () => {
      const orderTitle = Array.from(document.querySelectorAll('h1,h2,h3,[data-page-title],.page-title'))
        .find((element) => normalize(element.textContent) === 'Новый заказ');
      if (!orderTitle) return;

      const modal = orderTitle.closest('[role="dialog"], .modal, .modal-content, .fixed, [class*="modal"]') || orderTitle.parentElement;
      if (!modal) return;

      const firstHeading = findByExactText(modal, 'Что будет после создания');
      const secondHeading = findByExactText(modal, 'Что происходит дальше');
      if (!firstHeading && !secondHeading) return;

      const common = firstHeading && secondHeading ? lowestCommonAncestor(firstHeading, secondHeading) : null;
      const commonText = common ? normalize(common.textContent) : '';
      const safeCommon = common && common !== modal && !commonText.includes('Клиент и объект') && !commonText.includes('Направление услуги');

      let anchor = null;
      if (safeCommon) {
        common.setAttribute('data-rolanpro-order-intake-sidebar', '1');
        anchor = common;
      } else {
        [firstHeading, secondHeading].filter(Boolean).forEach((heading) => {
          const card = findHintCard(heading, modal);
          if (card && card !== modal) {
            card.setAttribute('data-rolanpro-order-intake-hint-card', '1');
            anchor = anchor || card;
          }
        });
      }

      const layout = anchor ? findGridParent(anchor, modal) : null;
      if (layout && modal.contains(layout)) {
        layout.setAttribute('data-rolanpro-order-intake-layout', '1');
      }
    };

    let queued = false;
    const queueCleanup = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        cleanupOrderIntake();
      });
    };

    const observer = new MutationObserver(queueCleanup);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('hashchange', queueCleanup);
    queueCleanup();
  })();
</script>`;

export function injectOrderIntakeCleanup(html: string) {
  if (html.includes('id="rolanpro-order-intake-cleanup-style"')) return html;

  const closingBodyIndex = html.toLowerCase().lastIndexOf("</body>");
  if (closingBodyIndex < 0) return `${html}${ORDER_INTAKE_CLEANUP_PATCH}`;

  return `${html.slice(0, closingBodyIndex)}${ORDER_INTAKE_CLEANUP_PATCH}${html.slice(closingBodyIndex)}`;
}
