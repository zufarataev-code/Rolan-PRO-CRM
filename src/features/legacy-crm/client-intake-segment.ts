const CLIENT_INTAKE_SEGMENT_PATCH = `
<style id="rolanpro-client-intake-segment-style">
  #order-client-overlay .rolanpro-b2b-only {
    display: none !important;
  }

  #order-client-overlay[data-rolanpro-client-segment="b2b"] .rolanpro-b2b-only {
    display: block !important;
  }

  #order-client-overlay .rolanpro-client-intake-group {
    grid-column: 1 / -1;
    margin-top: 2px;
    padding-top: 10px;
    border-top: 1px solid #e2e8f0;
    color: #0f172a;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .02em;
    text-transform: uppercase;
  }

  #order-client-overlay .rolanpro-client-intake-group:first-child {
    border-top: 0;
    padding-top: 0;
  }

  #order-client-overlay[data-rolanpro-client-segment="b2b"] #rolanpro-b2b-company-heading {
    order: 10;
  }

  #order-client-overlay[data-rolanpro-client-segment="b2b"] [data-rolanpro-oc-field="name"] {
    order: 11;
  }

  #order-client-overlay[data-rolanpro-client-segment="b2b"] #rolanpro-b2b-website-field {
    order: 12;
  }

  #order-client-overlay[data-rolanpro-client-segment="b2b"] #rolanpro-b2b-industry-field {
    order: 13;
  }

  #order-client-overlay[data-rolanpro-client-segment="b2b"] #rolanpro-b2b-contact-heading {
    order: 20;
  }

  #order-client-overlay[data-rolanpro-client-segment="b2b"] #rolanpro-b2b-contact-name-field {
    order: 21;
  }

  #order-client-overlay[data-rolanpro-client-segment="b2b"] #rolanpro-b2b-contact-title-field {
    order: 22;
  }

  #order-client-overlay[data-rolanpro-client-segment="b2b"] [data-rolanpro-oc-field="phone"] {
    order: 23;
  }

  #order-client-overlay[data-rolanpro-client-segment="b2b"] [data-rolanpro-oc-field="email"] {
    order: 24;
  }

  #order-client-overlay[data-rolanpro-client-segment="b2b"] #rolanpro-b2b-classification-heading {
    order: 30;
  }

  #order-client-overlay[data-rolanpro-client-segment="b2b"] [data-rolanpro-oc-field="type"] {
    order: 31;
  }

  #order-client-overlay[data-rolanpro-client-segment="b2b"] [data-rolanpro-oc-field="source"] {
    order: 32;
  }

  #order-client-overlay[data-rolanpro-client-segment="b2b"] [data-rolanpro-oc-field="relationship"] {
    order: 33;
  }
</style>
<script id="rolanpro-client-intake-segment-script">
  (() => {
    const fieldShell = (id) => document.getElementById(id)?.parentElement || null;

    const setFieldLabel = (id, html) => {
      const shell = fieldShell(id);
      const label = shell?.querySelector('label');
      if (label) label.innerHTML = html;
    };

    const markBaseFields = () => {
      const fields = [
        ['oc-name', 'name'],
        ['oc-phone', 'phone'],
        ['oc-email', 'email'],
        ['oc-source', 'source'],
        ['oc-type', 'type'],
        ['oc-relationship', 'relationship'],
      ];
      fields.forEach(([id, role]) => fieldShell(id)?.setAttribute('data-rolanpro-oc-field', role));
    };

    const b2bFieldMarkup = () => `
      <div id="rolanpro-b2b-company-heading" class="rolanpro-b2b-only rolanpro-client-intake-group">Компания</div>
      <div id="rolanpro-b2b-website-field" class="rolanpro-b2b-only">
        <label>Website</label>
        <input id="oc-company-website" type="url" placeholder="https://company.com">
      </div>
      <div id="rolanpro-b2b-industry-field" class="rolanpro-b2b-only">
        <label>Тип бизнеса / отрасль</label>
        <select id="oc-company-industry">
          <option value="">Выберите отрасль</option>
          <option value="property_management">Property Management</option>
          <option value="office_commercial">Office / Commercial</option>
          <option value="hospitality">Hospitality</option>
          <option value="healthcare">Healthcare</option>
          <option value="retail">Retail</option>
          <option value="education">Education</option>
          <option value="contractor_gc">Contractor / GC</option>
          <option value="dealer_partner">Dealer / Partner</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div id="rolanpro-b2b-contact-heading" class="rolanpro-b2b-only rolanpro-client-intake-group">Основное контактное лицо</div>
      <div id="rolanpro-b2b-contact-name-field" class="rolanpro-b2b-only">
        <label>Имя контактного лица <span class="order-required">*</span></label>
        <input id="oc-contact-name" autocomplete="name" placeholder="Имя и фамилия">
      </div>
      <div id="rolanpro-b2b-contact-title-field" class="rolanpro-b2b-only">
        <label>Должность / роль</label>
        <input id="oc-contact-title" placeholder="Property Manager, Owner, Facilities...">
      </div>
      <div id="rolanpro-b2b-classification-heading" class="rolanpro-b2b-only rolanpro-client-intake-group">Классификация</div>
    `;

    const ensureB2bFields = (overlay) => {
      if (overlay.querySelector('#oc-contact-name')) return;
      const grid = fieldShell('oc-name')?.parentElement;
      if (!grid) return;
      grid.insertAdjacentHTML('beforeend', b2bFieldMarkup());
    };

    const setInputPlaceholder = (id, placeholder) => {
      const input = document.getElementById(id);
      if (input) input.setAttribute('placeholder', placeholder);
    };

    const syncClientSegmentFields = () => {
      const overlay = document.getElementById('order-client-overlay');
      const typeSelect = document.getElementById('oc-type');
      if (!overlay || !typeSelect) return;

      markBaseFields();
      ensureB2bFields(overlay);

      const isB2b = typeSelect.value === 'commercial';
      overlay.setAttribute('data-rolanpro-client-segment', isB2b ? 'b2b' : 'b2c');

      const sectionTitle = fieldShell('oc-name')?.parentElement?.parentElement?.querySelector('.font-black');
      if (sectionTitle) sectionTitle.textContent = isB2b ? 'Компания и контактное лицо' : 'Основные данные';

      setFieldLabel('oc-name', isB2b
        ? 'Название компании <span class="order-required">*</span>'
        : 'Имя клиента <span class="order-required">*</span>');
      setInputPlaceholder('oc-name', isB2b ? 'Название компании' : 'Имя и фамилия клиента');

      setFieldLabel('oc-phone', isB2b
        ? 'Телефон контактного лица <span class="order-required">*</span>'
        : 'Телефон <span class="order-required">*</span>');
      setFieldLabel('oc-email', isB2b ? 'Рабочий email' : 'Email');
      setFieldLabel('oc-type', isB2b ? 'Тип клиента / сегмент' : 'Сегмент');

      const relationship = document.getElementById('oc-relationship');
      if (isB2b && relationship) relationship.value = 'regular';

      if (!typeSelect.dataset.rolanproSegmentBound) {
        typeSelect.dataset.rolanproSegmentBound = '1';
        typeSelect.addEventListener('change', syncClientSegmentFields);
      }
    };

    const wrapClientCreation = () => {
      if (window.__rolanproClientIntakeWrapped) return;
      if (typeof createOrderClientFromOverlay !== 'function') return;

      const originalCreate = createOrderClientFromOverlay;
      createOrderClientFromOverlay = function() {
        const type = String(document.getElementById('oc-type')?.value || 'residential');
        const isB2b = type === 'commercial';
        const companyName = String(document.getElementById('oc-name')?.value || '').trim();
        const contactName = String(document.getElementById('oc-contact-name')?.value || '').trim();
        const contactTitle = String(document.getElementById('oc-contact-title')?.value || '').trim();
        const website = String(document.getElementById('oc-company-website')?.value || '').trim();
        const industry = String(document.getElementById('oc-company-industry')?.value || '').trim();

        if (isB2b && !contactName) {
          alert('Заполните обязательное поле: имя контактного лица');
          document.getElementById('oc-contact-name')?.focus();
          return;
        }

        let beforeIds = null;
        try {
          beforeIds = new Set(Array.isArray(db?.clients) ? db.clients.map((client) => client.id) : []);
        } catch (_) {
          beforeIds = null;
        }

        const result = originalCreate.apply(this, arguments);

        if (!isB2b || !beforeIds) return result;

        try {
          const created = Array.isArray(db?.clients)
            ? db.clients.find((client) => !beforeIds.has(client.id))
            : null;
          if (!created) return result;

          const parsedContact = typeof splitClientName === 'function'
            ? splitClientName(contactName)
            : { firstName: contactName, lastName: '' };

          created.name = companyName;
          created.companyName = companyName;
          created.contactName = contactName;
          created.primaryContactName = contactName;
          created.contactTitle = contactTitle;
          created.primaryContactTitle = contactTitle;
          created.website = website;
          created.industry = industry;
          created.firstName = parsedContact.firstName || contactName;
          created.lastName = parsedContact.lastName || '';

          if (typeof save === 'function') save();
        } catch (error) {
          console.error('ROLANPRO B2B client metadata save failed', error);
        }

        return result;
      };

      window.__rolanproClientIntakeWrapped = true;
    };

    let queued = false;
    const queueEnhancement = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        wrapClientCreation();
        syncClientSegmentFields();
      });
    };

    const observer = new MutationObserver(queueEnhancement);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('hashchange', queueEnhancement);
    queueEnhancement();
  })();
</script>`;

export function injectClientIntakeSegment(html: string) {
  if (html.includes('id="rolanpro-client-intake-segment-style"')) return html;

  const closingBodyIndex = html.toLowerCase().lastIndexOf("</body>");
  if (closingBodyIndex < 0) return `${html}${CLIENT_INTAKE_SEGMENT_PATCH}`;

  return `${html.slice(0, closingBodyIndex)}${CLIENT_INTAKE_SEGMENT_PATCH}${html.slice(closingBodyIndex)}`;
}
