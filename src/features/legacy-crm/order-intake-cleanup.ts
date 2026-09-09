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
    const textOf = (element) => normalize(element?.textContent);

    const containsAll = (element, needles) => {
      const text = textOf(element);
      return needles.every((needle) => text.includes(needle));
    };

    const findSmallestContaining = (root, needles) => {
      if (!root) return null;

      const candidates = [root, ...Array.from(root.querySelectorAll('*'))]
        .filter((element) => element instanceof HTMLElement && containsAll(element, needles));

      if (!candidates.length) return null;

      return candidates.sort((left, right) => {
        const textDelta = textOf(left).length - textOf(right).length;
        if (textDelta !== 0) return textDelta;
        return left.querySelectorAll('*').length - right.querySelectorAll('*').length;
      })[0];
    };

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

    const containsProtectedOrderUi = (element) => {
      const text = textOf(element);
      return [
        'Клиент и объект',
        'Направление услуги',
        'Создать заказ',
        'Отмена',
      ].some((marker) => text.includes(marker));
    };

    const findGridParent = (element, stopAt) => {
      let node = element?.parentElement || null;
      for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
        if (node === stopAt) break;
        const style = window.getComputedStyle(node);
        if (style.display === 'grid') return node;
      }
      return null;
    };

    const hideCard = (card) => {
      if (!card || containsProtectedOrderUi(card)) return false;
      card.setAttribute('data-rolanpro-order-intake-hint-card', '1');
      card.style.setProperty('display', 'none', 'important');
      return true;
    };

    const cleanupOrderIntake = () => {
      const modal = findSmallestContaining(document.body, [
        'Новый заказ',
        'Клиент и объект',
        'Направление услуги',
      ]);
      if (!modal) return;

      const firstCard =
        findSmallestContaining(modal, ['Что будет после создания', 'Менеджер назначит']) ||
        findSmallestContaining(modal, ['Что будет после создания', 'Замерщик увидит']);

      const secondCard =
        findSmallestContaining(modal, ['Что происходит дальше', 'СОБИРАЕМ ЗАКАЗ КАРТОЧКАМИ']) ||
        findSmallestContaining(modal, ['Что происходит дальше', 'Стандартный проект']);

      if (!firstCard && !secondCard) return;

      const sidebar = firstCard && secondCard ? lowestCommonAncestor(firstCard, secondCard) : null;
      let layoutAnchor = null;

      if (
        sidebar &&
        sidebar !== modal &&
        containsAll(sidebar, ['Что будет после создания', 'Что происходит дальше']) &&
        !containsProtectedOrderUi(sidebar)
      ) {
        sidebar.setAttribute('data-rolanpro-order-intake-sidebar', '1');
        sidebar.style.setProperty('display', 'none', 'important');
        layoutAnchor = sidebar;
      } else {
        if (hideCard(firstCard)) layoutAnchor = layoutAnchor || firstCard;
        if (hideCard(secondCard)) layoutAnchor = layoutAnchor || secondCard;
      }

      const layout = layoutAnchor ? findGridParent(layoutAnchor, modal) : null;
      if (layout) {
        layout.setAttribute('data-rolanpro-order-intake-layout', '1');
        layout.style.setProperty('grid-template-columns', 'minmax(0, 1fr)', 'important');
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
    window.addEventListener('resize', queueCleanup, { passive: true });
    queueCleanup();
  })();
</script>`;

export function injectOrderIntakeCleanup(html: string) {
  if (html.includes('id="rolanpro-order-intake-cleanup-style"')) return html;

  const closingBodyIndex = html.toLowerCase().lastIndexOf("</body>");
  if (closingBodyIndex < 0) return `${html}${ORDER_INTAKE_CLEANUP_PATCH}`;

  return `${html.slice(0, closingBodyIndex)}${ORDER_INTAKE_CLEANUP_PATCH}${html.slice(closingBodyIndex)}`;
}
