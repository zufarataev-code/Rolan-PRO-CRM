const SURVEYOR_TASK_ACTIONS_PATCH = `
<style id="rolanpro-surveyor-task-actions-style">
  [data-rolanpro-surveyor-actions="1"] {
    display: grid !important;
    grid-template-columns: minmax(112px, 0.8fr) minmax(0, 1fr) 44px 44px !important;
    gap: 8px !important;
    align-items: stretch !important;
    width: 100% !important;
  }

  [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action] {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: auto !important;
    min-width: 0 !important;
    min-height: 44px !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0.65rem 0.8rem !important;
    text-align: center !important;
    white-space: normal !important;
    word-break: normal !important;
    overflow-wrap: break-word !important;
    writing-mode: horizontal-tb !important;
    text-orientation: mixed !important;
    line-height: 1.25 !important;
  }

  [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action="accept"] {
    grid-column: 1;
    grid-row: auto;
  }

  [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action="measure"] {
    grid-column: 2 / -1;
    grid-row: auto;
    font-weight: 700 !important;
  }

  [data-rolanpro-surveyor-actions="1"][data-rolanpro-has-accept="0"] > [data-rolanpro-surveyor-action="measure"] {
    grid-column: 1 / -1;
  }

  [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action="card"] {
    grid-column: 1 / 3;
  }

  [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action="call"] {
    grid-column: 3;
  }

  [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action="whatsapp"] {
    grid-column: 4;
  }

  [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action="call"],
  [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action="whatsapp"] {
    padding: 0 !important;
    aspect-ratio: 1;
    white-space: nowrap !important;
    overflow-wrap: normal !important;
  }

  [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action="complete"] {
    grid-column: 1 / -1;
  }

  @media (max-width: 430px) {
    [data-rolanpro-surveyor-actions="1"] {
      grid-template-columns: minmax(0, 1fr) 44px 44px !important;
    }

    [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action="accept"],
    [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action="measure"],
    [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action="complete"] {
      grid-column: 1 / -1;
    }

    [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action="card"] {
      grid-column: 1;
    }

    [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action="call"] {
      grid-column: 2;
    }

    [data-rolanpro-surveyor-actions="1"] > [data-rolanpro-surveyor-action="whatsapp"] {
      grid-column: 3;
    }
  }
</style>
<script id="rolanpro-surveyor-task-actions-script">
  (() => {
    const roleFor = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const onclick = element.getAttribute('onclick') || '';
      const href = element.getAttribute('href') || '';

      if (onclick.includes('acceptMeasurementTask(')) return 'accept';
      if (onclick.includes('openMeasurerV25ForOrder(')) return 'measure';
      if (onclick.includes('openOrder(')) return 'card';
      if (onclick.includes('startCall(')) return 'call';
      if (onclick.includes('changeStatus(') && onclick.includes('measurement_done')) return 'complete';
      if (/wa\\.me|whatsapp/i.test(href)) return 'whatsapp';
      return null;
    };

    const enhanceSurveyorTaskActions = () => {
      document.querySelectorAll('button[onclick*="openMeasurerV25ForOrder("]').forEach((measureButton) => {
        const row = measureButton.parentElement;
        if (!(row instanceof HTMLElement)) return;

        const actions = Array.from(row.children)
          .map((element) => ({ element, role: roleFor(element) }))
          .filter((action) => action.role);
        const roles = actions.map((action) => action.role);

        // The order details view has another measurer button. Only the task card
        // combines it with the order card and call actions.
        if (!roles.includes('card') || !roles.includes('call')) return;

        row.setAttribute('data-rolanpro-surveyor-actions', '1');
        row.setAttribute('data-rolanpro-has-accept', roles.includes('accept') ? '1' : '0');

        actions.forEach(({ element, role }) => {
          element.setAttribute('data-rolanpro-surveyor-action', role);
        });
      });
    };

    let queued = false;
    const queueEnhancement = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        enhanceSurveyorTaskActions();
      });
    };

    const observer = new MutationObserver(queueEnhancement);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('hashchange', queueEnhancement);
    window.addEventListener('resize', queueEnhancement, { passive: true });
    queueEnhancement();
  })();
</script>`;

export function injectSurveyorTaskActions(html: string) {
  if (html.includes('id="rolanpro-surveyor-task-actions-style"')) return html;

  const closingBodyIndex = html.toLowerCase().lastIndexOf('</body>');
  if (closingBodyIndex < 0) return `${html}${SURVEYOR_TASK_ACTIONS_PATCH}`;

  return `${html.slice(0, closingBodyIndex)}${SURVEYOR_TASK_ACTIONS_PATCH}${html.slice(closingBodyIndex)}`;
}
