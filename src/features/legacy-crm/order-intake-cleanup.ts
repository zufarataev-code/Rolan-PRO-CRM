const ORDER_INTAKE_CLEANUP_PATCH = `
<style id="rolanpro-order-intake-cleanup-style">
  [data-rolanpro-order-intake-sidebar="1"] {
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

    const findByExactText = (text) => Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,div,span,p,strong'))
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

    const findGridParent = (element) => {
      let node = element?.parentElement || null;
      for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
        const style = window.getComputedStyle(node);
        if (style.display === 'grid' || node.classList.contains('grid')) return node;
      }
      return null;
    };

    const cleanupOrderIntake = () => {
      const orderTitle = findByExactText('Новый заказ');
      const firstHeading = findByExactText('Что будет после создания');
      const secondHeading = findByExactText('Что происходит дальше');
      if (!orderTitle || !firstHeading || !secondHeading) return;

      const modal = orderTitle.closest('[role="dialog"], .modal, .modal-content, .fixed, [class*="modal"]') || orderTitle.parentElement;
      if (!modal || !modal.contains(firstHeading) || !modal.contains(secondHeading)) return;

      const common = lowestCommonAncestor(firstHeading, secondHeading);
      if (!common || common === modal) return;

      const commonText = normalize(common.textContent);
      if (commonText.includes('Клиент и объект') || commonText.includes('Направление услуги')) return;

      common.setAttribute('data-rolanpro-order-intake-sidebar', '1');

      const layout = findGridParent(common);
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
