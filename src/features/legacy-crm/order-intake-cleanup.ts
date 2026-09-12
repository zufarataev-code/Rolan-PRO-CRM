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

  #rolanpro-order-material-section select,
  #rolanpro-order-parameters-overlay select,
  #rolanpro-order-parameters-overlay input {
    width: 100%;
    min-height: 44px;
  }

  #rolanpro-order-material-section .rolanpro-material-note,
  #rolanpro-order-parameters-overlay .rolanpro-params-note {
    margin-top: 7px;
    color: #64748b;
    font-size: 12px;
    line-height: 1.45;
  }

  .rolanpro-film-picker-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .rolanpro-film-picker-grid label {
    display: block;
    margin-bottom: 6px;
    color: #475569;
    font-size: 12px;
    font-weight: 700;
  }

  #rolanpro-order-parameters-overlay {
    position: fixed;
    inset: 0;
    z-index: 2147482500;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(15, 23, 42, .52);
  }

  #rolanpro-order-parameters-panel {
    width: min(680px, 100%);
    max-height: min(92dvh, 820px);
    overflow: auto;
    border-radius: 18px;
    background: #fff;
    box-shadow: 0 28px 90px rgba(15, 23, 42, .28);
  }

  .rolanpro-order-parameters-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    padding: 18px 18px 14px;
    border-bottom: 1px solid #e2e8f0;
  }

  .rolanpro-order-parameters-title {
    color: #0f172a;
    font-size: 20px;
    font-weight: 850;
    line-height: 1.15;
  }

  .rolanpro-order-parameters-sub {
    margin-top: 4px;
    color: #64748b;
    font-size: 12px;
    line-height: 1.45;
  }

  .rolanpro-order-parameters-body {
    display: grid;
    gap: 14px;
    padding: 18px;
  }

  .rolanpro-order-parameters-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .rolanpro-order-parameters-field label {
    display: block;
    margin-bottom: 6px;
    color: #475569;
    font-size: 12px;
    font-weight: 700;
  }

  .rolanpro-order-parameters-summary {
    padding: 12px 14px;
    border: 1px solid #dbeafe;
    border-radius: 12px;
    background: #eff6ff;
    color: #1e3a8a;
    font-size: 13px;
    line-height: 1.45;
  }

  .rolanpro-order-parameters-footer {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 14px 18px 18px;
    border-top: 1px solid #e2e8f0;
  }

  .rolanpro-order-parameters-footer-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }

  @media (max-width: 640px) {
    #rolanpro-order-parameters-overlay {
      align-items: end;
      padding: 0;
    }

    #rolanpro-order-parameters-panel {
      width: 100%;
      max-height: 94dvh;
      border-radius: 18px 18px 0 0;
    }

    .rolanpro-order-parameters-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .rolanpro-film-picker-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .rolanpro-order-parameters-footer {
      flex-direction: column;
    }

    .rolanpro-order-parameters-footer-actions {
      width: 100%;
      margin-left: 0;
    }

    .rolanpro-order-parameters-footer-actions > button {
      flex: 1;
      min-height: 46px;
    }
  }
</style>
<script id="rolanpro-order-intake-cleanup-script">
  (() => {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const textOf = (element) => normalize(element?.textContent);
    const esc = (value) => String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

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
        'Услуги проекта',
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

    const serviceList = () => {
      if (typeof ORDER_PRIMARY_SERVICES === 'undefined' || !Array.isArray(ORDER_PRIMARY_SERVICES)) return [];
      return ORDER_PRIMARY_SERVICES;
    };

    const serviceInfoSafe = (serviceId) => {
      if (typeof primaryServiceInfo === 'function') return primaryServiceInfo(serviceId);
      return serviceList().find((service) => service.id === serviceId) || null;
    };

    const catalogList = () => {
      if (typeof db === 'undefined' || !Array.isArray(db?.settings?.catalog)) return [];
      return db.settings.catalog;
    };

    const legacyProductParts = (value) => {
      const source = normalize(value);
      const match = source.match(/^(.*?)\\s+([A-Z]{0,5}-?\\d+[A-Z0-9%.-]*)$/i);
      return match ? { name: normalize(match[1]), model: normalize(match[2]) } : { name: source, model: '' };
    };

    const materialCategory = (item) => normalize(
      item?.filmCategory || item?.appearance || item?.appearanceCode ||
      (typeof catLabel === 'function' && item?.category ? catLabel(item.category) : item?.category) || '',
    );

    const materialName = (item) => normalize(
      item?.productName || item?.series || legacyProductParts(item?.model).name || '',
    );

    const materialModel = (item) => normalize(
      item?.modelCode || item?.sku || item?.code || legacyProductParts(item?.model).model || '',
    );

    const materialLabel = (item) => {
      if (!item) return 'Не выбрана';
      return Array.from(new Set([materialCategory(item), materialName(item), materialModel(item)].filter(Boolean))).join(' · ') || 'Материал';
    };

    const materialsForService = (serviceId) => {
      const service = serviceInfoSafe(serviceId);
      const category = service?.catalogCategory || '';
      const items = catalogList();
      if (!category) return items;
      return items.filter((item) => item.category === category);
    };

    const complexityKeys = ['standard', 'ladder', 'tower', 'alpinism'];
    const complexityFallback = {
      standard: 'Обычная',
      ladder: 'Лестница',
      tower: 'Вышка / lift',
      alpinism: 'Высотные / rope',
    };

    const complexityLabel = (key) => {
      if (typeof T === 'function') {
        const token = 'complexity' + key.charAt(0).toUpperCase() + key.slice(1);
        const translated = T(token);
        if (translated && translated !== token) return translated;
      }
      return complexityFallback[key] || key;
    };

    const complexityCoef = (key) => {
      if (typeof db === 'undefined') return 1;
      const value = Number(db?.settings?.complexityCoefs?.[key]);
      return Number.isFinite(value) && value > 0 ? value : 1;
    };

    const uniqueSorted = (values) => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

    const optionListHtml = (values, selected, emptyLabel) => {
      if (!values.length) return '<option value="">' + esc(emptyLabel) + '</option>';
      return values.map((value) => '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(value) + '</option>').join('');
    };

    const syncMaterialPicker = ({ serviceId, categoryId, nameId, materialId, preferredId = '' }) => {
      const categorySelect = document.getElementById(categoryId);
      const nameSelect = document.getElementById(nameId);
      const materialSelect = document.getElementById(materialId);
      if (!categorySelect || !nameSelect || !materialSelect) return '';

      const items = materialsForService(serviceId).slice().sort((left, right) => materialLabel(left).localeCompare(materialLabel(right)));
      const preferred = items.find((item) => item.id === preferredId) || null;
      const categories = uniqueSorted(items.map(materialCategory));
      let category = preferred ? materialCategory(preferred) : categorySelect.value;
      if (!categories.includes(category)) category = categories[0] || '';
      categorySelect.innerHTML = optionListHtml(categories, category, 'Нет категорий');
      categorySelect.value = category;

      const categoryItems = items.filter((item) => materialCategory(item) === category);
      const names = uniqueSorted(categoryItems.map(materialName));
      let name = preferred && materialCategory(preferred) === category ? materialName(preferred) : nameSelect.value;
      if (!names.includes(name)) name = names[0] || '';
      nameSelect.innerHTML = optionListHtml(names, name, 'Нет названий');
      nameSelect.value = name;

      const modelItems = categoryItems.filter((item) => materialName(item) === name);
      let selectedId = preferred && modelItems.some((item) => item.id === preferred.id) ? preferred.id : materialSelect.value;
      if (!modelItems.some((item) => item.id === selectedId)) selectedId = modelItems[0]?.id || '';
      materialSelect.innerHTML = modelItems.length
        ? modelItems.map((item) => '<option value="' + esc(item.id) + '"' + (item.id === selectedId ? ' selected' : '') + '>' + esc(materialModel(item) || 'Модель не указана') + '</option>').join('')
        : '<option value="">Нет моделей</option>';
      materialSelect.value = selectedId;
      return selectedId;
    };

    const complexityOptionsHtml = (selectedKey) => complexityKeys
      .map((key) => '<option value="' + key + '"' + (key === selectedKey ? ' selected' : '') + '>' + esc(complexityLabel(key)) + ' ×' + complexityCoef(key).toFixed(2) + '</option>')
      .join('');

    const selectedMaterialFromOrder = (order) => {
      if (!order) return '';
      if (order.materialCatalogId && catalogList().some((item) => item.id === order.materialCatalogId)) return order.materialCatalogId;
      const ids = [];
      (order.measurements?.rooms || []).forEach((room) => {
        (room.windows || []).forEach((windowItem) => {
          if (windowItem.catalogId) ids.push(windowItem.catalogId);
        });
      });
      const unique = Array.from(new Set(ids));
      return unique.length === 1 ? unique[0] : '';
    };

    const refreshNewOrderMaterials = (preferredId) => {
      const serviceId = document.getElementById('no-svc')?.value || (typeof state !== 'undefined' ? state._newOrderService : '') || 'smart_film';
      const items = materialsForService(serviceId);
      const current = preferredId || (typeof state !== 'undefined' ? state._newOrderMaterial : '') || '';
      const selected = syncMaterialPicker({
        serviceId,
        categoryId: 'no-film-category',
        nameId: 'no-film-name',
        materialId: 'no-material',
        preferredId: current,
      });
      if (typeof state !== 'undefined') state._newOrderMaterial = selected;
      const note = document.getElementById('rolanpro-new-order-material-note');
      if (note) {
        note.textContent = items.length
          ? ''
          : 'Для этого направления в каталоге пока нет материала. Добавьте позицию в Каталог, затем вернитесь в заказ.';
      }
    };

    const ensureNewOrderMaterialField = () => {
      const serviceInput = document.getElementById('no-svc');
      if (!serviceInput) return;
      const modal = serviceInput.closest('.modal-content, [role="dialog"], [class*="modal"]') || serviceInput.parentElement;
      if (!modal) return;

      let section = document.getElementById('rolanpro-order-material-section');
      if (!section) {
        const serviceSection = serviceInput.closest('section') || serviceInput.parentElement;
        section = document.createElement('section');
        section.id = 'rolanpro-order-material-section';
        section.className = 'erp-intake-card';
        section.innerHTML =
          '<div class="erp-intake-card-head"><div>' +
            '<div class="erp-intake-card-title">Плёнка <span class="order-required">*</span></div>' +
          '</div></div>' +
          '<div class="rolanpro-film-picker-grid">' +
            '<div><label>Категория</label><select id="no-film-category"></select></div>' +
            '<div><label>Название</label><select id="no-film-name"></select></div>' +
            '<div><label>Модель</label><select id="no-material"></select></div>' +
          '</div>' +
          '<div>' +
          '<div id="rolanpro-new-order-material-note" class="rolanpro-material-note"></div></div>';

        if (serviceSection?.parentElement) serviceSection.insertAdjacentElement('afterend', section);
        else modal.appendChild(section);

        section.querySelector('#no-film-category')?.addEventListener('change', () => {
          const nameSelect = document.getElementById('no-film-name');
          const materialSelect = document.getElementById('no-material');
          if (nameSelect) nameSelect.value = '';
          if (materialSelect) materialSelect.value = '';
          if (typeof state !== 'undefined') state._newOrderMaterial = '';
          refreshNewOrderMaterials();
        });
        section.querySelector('#no-film-name')?.addEventListener('change', () => {
          const materialSelect = document.getElementById('no-material');
          if (materialSelect) materialSelect.value = '';
          if (typeof state !== 'undefined') state._newOrderMaterial = '';
          refreshNewOrderMaterials();
        });
        section.querySelector('#no-material')?.addEventListener('change', (event) => {
          if (typeof state !== 'undefined') state._newOrderMaterial = event.target.value || '';
        });
      }

      refreshNewOrderMaterials();
    };

    const installNewOrderWrappers = () => {
      if (typeof window.selectOrderService === 'function' && !window.selectOrderService.__rolanproMaterialWrapped) {
        const originalSelectOrderService = window.selectOrderService;
        const wrappedSelectOrderService = function wrappedSelectOrderService(serviceId) {
          const result = originalSelectOrderService.apply(this, arguments);
          window.requestAnimationFrame(() => refreshNewOrderMaterials());
          return result;
        };
        wrappedSelectOrderService.__rolanproMaterialWrapped = true;
        window.selectOrderService = wrappedSelectOrderService;
      }

      if (typeof window.createOrder === 'function' && !window.createOrder.__rolanproMaterialWrapped) {
        const originalCreateOrder = window.createOrder;
        const wrappedCreateOrder = function wrappedCreateOrder() {
          const materialSelect = document.getElementById('no-material');
          const serviceId = document.getElementById('no-svc')?.value || (typeof state !== 'undefined' ? state._newOrderService : '') || 'smart_film';
          const complexityKey = document.getElementById('no-complexity')?.value || 'standard';
          const availableMaterials = materialsForService(serviceId);
          const materialId = materialSelect?.value || '';

          if (availableMaterials.length && !materialId) {
            alert('Выберите плёнку / материал');
            return;
          }

          const beforeIds = new Set((typeof db !== 'undefined' && Array.isArray(db.orders) ? db.orders : []).map((order) => order.id));
          const result = originalCreateOrder.apply(this, arguments);
          if (typeof db === 'undefined' || !Array.isArray(db.orders)) return result;

          const createdOrder = db.orders.find((order) => !beforeIds.has(order.id));
          if (!createdOrder) return result;

          const material = catalogList().find((item) => item.id === materialId) || null;
          createdOrder.materialCatalogId = material?.id || '';
          createdOrder.materialLabel = material ? materialLabel(material) : '';
          createdOrder.materialCategory = material ? materialCategory(material) : '';
          createdOrder.materialName = material ? materialName(material) : '';
          createdOrder.materialModel = material ? materialModel(material) : '';
          createdOrder.complexityCoef = complexityCoef(complexityKey);
          createdOrder.orderBuilder = createdOrder.orderBuilder || {};
          createdOrder.orderBuilder.materialId = material?.id || '';
          createdOrder.orderBuilder.materialLabel = material ? materialLabel(material) : '';
          createdOrder.orderBuilder.materialCategory = material ? materialCategory(material) : '';
          createdOrder.orderBuilder.materialName = material ? materialName(material) : '';
          createdOrder.orderBuilder.materialModel = material ? materialModel(material) : '';
          createdOrder.orderBuilder.complexity = complexityKey;
          createdOrder.orderBuilder.complexityCoef = complexityCoef(complexityKey);
          createdOrder.timeline = Array.isArray(createdOrder.timeline) ? createdOrder.timeline : [];
          createdOrder.timeline.push({
            at: new Date().toISOString(),
            key: 'orderParametersSet',
            by: typeof state !== 'undefined' ? state.currentUserId : null,
            note: (material ? materialLabel(material) : 'Материал TBD') + ' · ' + complexityLabel(complexityKey) + ' ×' + complexityCoef(complexityKey).toFixed(2),
          });

          if (typeof save === 'function') save();
          if (typeof render === 'function') render();
          return result;
        };
        wrappedCreateOrder.__rolanproMaterialWrapped = true;
        window.createOrder = wrappedCreateOrder;
      }
    };

    window.closeRolanProOrderParameters = function closeRolanProOrderParameters() {
      document.getElementById('rolanpro-order-parameters-overlay')?.remove();
    };

    const refreshParameterMaterialSelect = (preferredId) => {
      const serviceSelect = document.getElementById('rp-op-service');
      if (!serviceSelect) return;
      const serviceId = serviceSelect.value || 'smart_film';
      syncMaterialPicker({
        serviceId,
        categoryId: 'rp-op-film-category',
        nameId: 'rp-op-film-name',
        materialId: 'rp-op-material',
        preferredId,
      });
      refreshParametersSummary();
    };

    const refreshParametersSummary = () => {
      const summary = document.getElementById('rp-op-summary');
      if (!summary) return;
      const serviceId = document.getElementById('rp-op-service')?.value || '';
      const materialId = document.getElementById('rp-op-material')?.value || '';
      const complexityKey = document.getElementById('rp-op-complexity')?.value || 'standard';
      const service = serviceInfoSafe(serviceId);
      const material = catalogList().find((item) => item.id === materialId) || null;
      summary.textContent =
        (service?.title || 'Услуга') + ' · ' +
        (material ? materialLabel(material) : 'материал не выбран') + ' · ' +
        complexityLabel(complexityKey) + ' ×' + complexityCoef(complexityKey).toFixed(2);
    };

    window.openRolanProOrderParameters = function openRolanProOrderParameters(orderId) {
      const id = orderId || (typeof state !== 'undefined' ? state.openOrderId : '');
      const order = typeof getOrder === 'function' ? getOrder(id) : null;
      if (!order) {
        alert('Не удалось открыть параметры заказа');
        return;
      }

      window.closeRolanProOrderParameters();
      const services = serviceList();
      const currentServiceId = services.some((service) => service.id === order.serviceType)
        ? order.serviceType
        : (services[0]?.id || 'smart_film');
      const currentMaterialId = selectedMaterialFromOrder(order);
      const currentComplexity = complexityKeys.includes(order.complexity) ? order.complexity : 'standard';

      const overlay = document.createElement('div');
      overlay.id = 'rolanpro-order-parameters-overlay';
      overlay.innerHTML =
        '<div id="rolanpro-order-parameters-panel">' +
          '<div class="rolanpro-order-parameters-head">' +
            '<div><div class="rolanpro-order-parameters-title">Параметры заказа</div>' +
            '</div>' +
            '<button type="button" class="btn-ghost" id="rp-op-close">Закрыть</button>' +
          '</div>' +
          '<div class="rolanpro-order-parameters-body">' +
            '<div class="rolanpro-order-parameters-grid">' +
              '<div class="rolanpro-order-parameters-field"><label>Основная услуга</label>' +
                '<select id="rp-op-service">' + services.map((service) => '<option value="' + esc(service.id) + '"' + (service.id === currentServiceId ? ' selected' : '') + '>' + esc(service.title) + '</option>').join('') + '</select>' +
              '</div>' +
              '<div class="rolanpro-order-parameters-field"><label>Сложность / коэффициент</label>' +
                '<select id="rp-op-complexity">' + complexityOptionsHtml(currentComplexity) + '</select>' +
              '</div>' +
            '</div>' +
            '<div class="rolanpro-film-picker-grid">' +
              '<div><label>Категория плёнки</label><select id="rp-op-film-category"></select></div>' +
              '<div><label>Название</label><select id="rp-op-film-name"></select></div>' +
              '<div><label>Модель</label><select id="rp-op-material"></select></div>' +
            '</div>' +
            '<div id="rp-op-summary" class="rolanpro-order-parameters-summary"></div>' +
          '</div>' +
          '<div class="rolanpro-order-parameters-footer">' +
            '<button type="button" class="btn-ghost" id="rp-op-extra-service">Услуги проекта</button>' +
            '<div class="rolanpro-order-parameters-footer-actions">' +
              '<button type="button" class="btn-ghost" id="rp-op-cancel">Отмена</button>' +
              '<button type="button" class="btn-primary" id="rp-op-save">Сохранить</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) window.closeRolanProOrderParameters();
      });
      document.body.appendChild(overlay);

      document.getElementById('rp-op-close')?.addEventListener('click', window.closeRolanProOrderParameters);
      document.getElementById('rp-op-cancel')?.addEventListener('click', window.closeRolanProOrderParameters);
      document.getElementById('rp-op-service')?.addEventListener('change', () => {
        const categorySelect = document.getElementById('rp-op-film-category');
        const nameSelect = document.getElementById('rp-op-film-name');
        const materialSelect = document.getElementById('rp-op-material');
        if (categorySelect) categorySelect.value = '';
        if (nameSelect) nameSelect.value = '';
        if (materialSelect) materialSelect.value = '';
        refreshParameterMaterialSelect();
      });
      document.getElementById('rp-op-film-category')?.addEventListener('change', () => {
        const nameSelect = document.getElementById('rp-op-film-name');
        const materialSelect = document.getElementById('rp-op-material');
        if (nameSelect) nameSelect.value = '';
        if (materialSelect) materialSelect.value = '';
        refreshParameterMaterialSelect();
      });
      document.getElementById('rp-op-film-name')?.addEventListener('change', () => {
        const materialSelect = document.getElementById('rp-op-material');
        if (materialSelect) materialSelect.value = '';
        refreshParameterMaterialSelect();
      });
      document.getElementById('rp-op-material')?.addEventListener('change', refreshParametersSummary);
      document.getElementById('rp-op-complexity')?.addEventListener('change', refreshParametersSummary);
      document.getElementById('rp-op-save')?.addEventListener('click', () => window.saveRolanProOrderParameters(id));
      document.getElementById('rp-op-extra-service')?.addEventListener('click', () => {
        window.closeRolanProOrderParameters();
        if (typeof openManagerProjectServicesModal === 'function') openManagerProjectServicesModal(id);
      });
      refreshParameterMaterialSelect(currentMaterialId);
      refreshParametersSummary();
    };

    window.saveRolanProOrderParameters = function saveRolanProOrderParameters(orderId) {
      const order = typeof getOrder === 'function' ? getOrder(orderId) : null;
      if (!order) return;

      const serviceId = document.getElementById('rp-op-service')?.value || '';
      const materialId = document.getElementById('rp-op-material')?.value || '';
      const complexityKey = document.getElementById('rp-op-complexity')?.value || 'standard';
      const service = serviceInfoSafe(serviceId);
      const availableMaterials = materialsForService(serviceId);
      const material = catalogList().find((item) => item.id === materialId) || null;

      if (!service) {
        alert('Выберите основную услугу');
        return;
      }
      if (availableMaterials.length && !material) {
        alert('Выберите плёнку / материал');
        return;
      }

      order.serviceType = service.id;
      order.serviceTypes = Array.from(new Set([service.id, ...(order.serviceTypes || [])]));
      order.serviceCategory = service.catalogCategory;
      order.serviceWorkflow = Array.isArray(service.workflow) ? [...service.workflow] : [];
      order.complexity = complexityKey;
      order.complexityCoef = complexityCoef(complexityKey);
      order.materialCatalogId = material?.id || '';
      order.materialLabel = material ? materialLabel(material) : '';
      order.materialCategory = material ? materialCategory(material) : '';
      order.materialName = material ? materialName(material) : '';
      order.materialModel = material ? materialModel(material) : '';

      const serviceTags = serviceList().map((item) => item.tag).filter(Boolean);
      order.tags = Array.isArray(order.tags) ? order.tags.filter((tag) => !serviceTags.includes(tag)) : [];
      order.serviceTypes.forEach((id) => {
        const selectedService = serviceInfoSafe(id);
        if (selectedService?.tag && !order.tags.includes(selectedService.tag)) order.tags.push(selectedService.tag);
      });

      order.orderBuilder = order.orderBuilder || {};
      order.orderBuilder.serviceId = service.id;
      order.orderBuilder.serviceTitle = service.title;
      order.orderBuilder.materialId = material?.id || '';
      order.orderBuilder.materialLabel = material ? materialLabel(material) : '';
      order.orderBuilder.materialCategory = material ? materialCategory(material) : '';
      order.orderBuilder.materialName = material ? materialName(material) : '';
      order.orderBuilder.materialModel = material ? materialModel(material) : '';
      order.orderBuilder.complexity = complexityKey;
      order.orderBuilder.complexityCoef = complexityCoef(complexityKey);

      if (material) {
        (order.measurements?.rooms || []).forEach((room) => {
          room.defaultCatalogByScope = room.defaultCatalogByScope || {};
          if (!room.defaultCatalogByScope[service.id]) room.defaultCatalogByScope[service.id] = material.id;
          (room.windows || []).forEach((windowItem) => {
            const windowScope = windowItem.measureScope || (typeof orderMeasureScope === 'function' ? orderMeasureScope(order) : order.serviceType);
            if (windowScope === service.id && !windowItem.catalogId) windowItem.catalogId = material.id;
          });
        });
      }

      order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
      order.timeline.push({
        at: new Date().toISOString(),
        key: 'orderParametersUpdated',
        by: typeof state !== 'undefined' ? state.currentUserId : null,
        note: service.title + ' · ' + (material ? materialLabel(material) : 'Материал TBD') + ' · ' + complexityLabel(complexityKey) + ' ×' + complexityCoef(complexityKey).toFixed(2),
      });

      if (typeof save === 'function') save();
      window.closeRolanProOrderParameters();
      if (typeof render === 'function') render();
    };

    const enhanceOrderParametersAction = () => {
      if (typeof state === 'undefined' || !state.openOrderId) return;
      const order = typeof getOrder === 'function' ? getOrder(state.openOrderId) : null;
      if (!order) return;
      const material = catalogList().find((item) => item.id === selectedMaterialFromOrder(order)) || null;
      const complexityKey = complexityKeys.includes(order.complexity) ? order.complexity : 'standard';

      document.querySelectorAll('button.order-action-card').forEach((button) => {
        const title = button.querySelector('.order-action-title');
        if (normalize(title?.textContent) !== 'Параметры') return;
        if (button.getAttribute('data-rolanpro-order-parameters') !== String(order.id)) {
          button.setAttribute('data-rolanpro-order-parameters', String(order.id));
          button.removeAttribute('onclick');
          button.onclick = (event) => {
            event.preventDefault();
            window.openRolanProOrderParameters(order.id);
          };
        }
        const sub = button.querySelector('.order-action-sub');
        if (sub) {
          sub.textContent = (material ? materialLabel(material) : 'плёнка не выбрана') + ' · ×' + complexityCoef(complexityKey).toFixed(2);
        }
      });
    };

    let queued = false;
    const queueEnhancement = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        cleanupOrderIntake();
        installNewOrderWrappers();
        ensureNewOrderMaterialField();
        enhanceOrderParametersAction();
      });
    };

    const observer = new MutationObserver(queueEnhancement);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('hashchange', queueEnhancement);
    window.addEventListener('resize', queueEnhancement, { passive: true });
    queueEnhancement();
  })();
</script>`;

export function injectOrderIntakeCleanup(html: string) {
  if (html.includes('id="rolanpro-order-intake-cleanup-style"')) return html;

  const closingBodyIndex = html.toLowerCase().lastIndexOf("</body>");
  if (closingBodyIndex < 0) return `${html}${ORDER_INTAKE_CLEANUP_PATCH}`;

  return `${html.slice(0, closingBodyIndex)}${ORDER_INTAKE_CLEANUP_PATCH}${html.slice(closingBodyIndex)}`;
}
