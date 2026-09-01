import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

import { provisionLegacyCrm } from "../scripts/provision-legacy-crm";
import { ROLE_CODES, ROLE_NAMES } from "../src/lib/auth/constants";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

async function seedRoles() {
  const roles = [
    {
      code: ROLE_CODES.OWNER,
      name_ru: ROLE_NAMES[ROLE_CODES.OWNER].ru,
      name_en: ROLE_NAMES[ROLE_CODES.OWNER].en,
      description_ru: "Полный доступ к ERP, финансам и аналитике.",
      description_en: "Full access to ERP, finance, and analytics.",
      sort_order: 1,
    },
    {
      code: ROLE_CODES.MANAGER,
      name_ru: ROLE_NAMES[ROLE_CODES.MANAGER].ru,
      name_en: ROLE_NAMES[ROLE_CODES.MANAGER].en,
      description_ru: "Управление продажами, проектами и календарем.",
      description_en: "Operates sales, projects, and scheduling.",
      sort_order: 2,
    },
    {
      code: ROLE_CODES.CONSULTANT,
      name_ru: ROLE_NAMES[ROLE_CODES.CONSULTANT].ru,
      name_en: ROLE_NAMES[ROLE_CODES.CONSULTANT].en,
      description_ru: "Работает только с назначенными консультациями и survey.",
      description_en: "Works only with assigned consultations and surveys.",
      sort_order: 3,
    },
    {
      code: ROLE_CODES.INSTALLER,
      name_ru: ROLE_NAMES[ROLE_CODES.INSTALLER].ru,
      name_en: ROLE_NAMES[ROLE_CODES.INSTALLER].en,
      description_ru: "Работает только со своими монтажами и статистикой.",
      description_en: "Works only with assigned installs and personal stats.",
      sort_order: 4,
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: {
        code: role.code,
      },
      update: role,
      create: role,
    });
  }
}

async function seedStatusesAndReferences() {
  const projectStatuses = [
    ["NEW", "Новый", "New", "slate", false, 1],
    ["SCHEDULED", "Запланирован", "Scheduled", "blue", false, 2],
    ["IN_PROGRESS", "В работе", "In Progress", "green", false, 3],
    ["COMPLETED", "Завершен", "Completed", "emerald", true, 4],
    ["WARRANTY_SERVICE", "Гарантия / Сервис", "Warranty / Service", "orange", false, 5],
  ] as const;

  for (const [status_code, name_ru, name_en, color_token, is_closed, sort_order] of projectStatuses) {
    await prisma.projectStatus.upsert({
      where: { status_code },
      update: { name_ru, name_en, color_token, is_closed, sort_order },
      create: { status_code, name_ru, name_en, color_token, is_closed, sort_order },
    });
  }

  const paymentStatuses = [
    ["DEPOSIT_PENDING", "Депозит ожидается", "Deposit Pending", "amber", false, 1],
    ["DEPOSIT_PAID", "Депозит оплачен", "Deposit Paid", "blue", false, 2],
    ["FINAL_PAYMENT_PENDING", "Финальный платеж ожидается", "Final Payment Pending", "orange", false, 3],
    ["PAID", "Оплачено", "Paid", "green", true, 4],
  ] as const;

  for (const [status_code, name_ru, name_en, color_token, is_closed, sort_order] of paymentStatuses) {
    await prisma.paymentStatus.upsert({
      where: { status_code },
      update: { name_ru, name_en, color_token, is_closed, sort_order },
      create: { status_code, name_ru, name_en, color_token, is_closed, sort_order },
    });
  }

  const positionStatuses = [
    ["DRAFT", "Черновик", "Draft", "slate", false, 1],
    ["READY", "Готово", "Ready", "blue", false, 2],
    ["SCHEDULED", "Назначено", "Scheduled", "amber", false, 3],
    ["IN_PROGRESS", "В работе", "In Progress", "green", false, 4],
    ["COMPLETED", "Выполнено", "Completed", "emerald", true, 5],
  ] as const;

  for (const [status_code, name_ru, name_en, color_token, is_closed, sort_order] of positionStatuses) {
    await prisma.positionStatus.upsert({
      where: { status_code },
      update: { name_ru, name_en, color_token, is_closed, sort_order },
      create: { status_code, name_ru, name_en, color_token, is_closed, sort_order },
    });
  }

  const eventTypes = [
    ["CONSULTATION", "Консультация", "Consultation", "yellow", 1],
    ["SITE_SURVEY", "Замер", "Site Survey", "blue", 2],
    ["INSTALL", "Монтаж", "Install", "green", 3],
    ["SERVICE_CALL", "Сервис", "Service Call", "orange", 4],
    ["WARRANTY_VISIT", "Гарантия", "Warranty Visit", "orange", 5],
  ] as const;

  for (const [event_code, name_ru, name_en, color_token, sort_order] of eventTypes) {
    await prisma.eventType.upsert({
      where: { event_code },
      update: { name_ru, name_en, color_token, sort_order },
      create: { event_code, name_ru, name_en, color_token, sort_order },
    });
  }

  const eventTracks = [
    ["SALES", "Продажи", "Sales", "yellow", 1],
    ["SURVEY", "Замер", "Survey", "blue", 2],
    ["INSTALL", "Монтаж", "Install", "green", 3],
    ["SERVICE", "Сервис", "Service", "orange", 4],
  ] as const;

  for (const [track_code, name_ru, name_en, color_token, sort_order] of eventTracks) {
    await prisma.eventTrack.upsert({
      where: { track_code },
      update: { name_ru, name_en, color_token, sort_order },
      create: { track_code, name_ru, name_en, color_token, sort_order },
    });
  }

  const complexityLevels = [
    ["LOW", "Стандарт", "Standard", 1, "1.00", "slate", 1],
    ["STANDARD", "Лестница", "Ladder", 2, "1.20", "blue", 2],
    ["HIGH", "Тура / техника", "Access Equipment", 3, "1.30", "orange", 3],
    ["EXPERT", "Альпинизм", "Alpine", 4, "1.50", "red", 4],
  ] as const;

  for (const [level_code, name_ru, name_en, numeric_rank, multiplier, color_token, sort_order] of complexityLevels) {
    await prisma.complexityLevel.upsert({
      where: { level_code },
      update: { name_ru, name_en, numeric_rank, multiplier, color_token, sort_order },
      create: { level_code, name_ru, name_en, numeric_rank, multiplier, color_token, sort_order },
    });
  }

  const cities = [
    ["LOS_ANGELES", "Лос-Анджелес", "Los Angeles", "CA", "90001", 1],
    ["GLENDALE", "Глендейл", "Glendale", "CA", "91201", 2],
    ["PASADENA", "Пасадена", "Pasadena", "CA", "91101", 3],
  ] as const;

  for (const [city_code, name_ru, name_en, state_code, default_zip_code, sort_order] of cities) {
    await prisma.city.upsert({
      where: { city_code },
      update: { name_ru, name_en, state_code, default_zip_code, sort_order },
      create: { city_code, name_ru, name_en, state_code, default_zip_code, sort_order },
    });
  }

  const documentTypes = [
    ["PROPOSAL", "Предложение", "Proposal", false, 1],
    ["AGREEMENT", "Соглашение", "Agreement", true, 2],
    ["INVOICE", "Инвойс", "Invoice", false, 3],
    ["SIGNED_FORM", "Подписанная форма", "Signed Form", true, 4],
    ["WARRANTY", "Гарантийный документ", "Warranty Document", false, 5],
  ] as const;

  for (const [document_code, name_ru, name_en, requires_signature, sort_order] of documentTypes) {
    await prisma.documentType.upsert({
      where: { document_code },
      update: { name_ru, name_en, requires_signature, sort_order },
      create: { document_code, name_ru, name_en, requires_signature, sort_order },
    });
  }

  const pipelineStatuses = [
    ["NEW_LEAD", "Новый лид", "New Lead", "active", "slate", false, 1],
    ["CONTACTED", "Контакт установлен", "Contacted", "active", "blue", false, 2],
    ["CONSULTATION_SCHEDULED", "Консультация назначена", "Consultation Scheduled", "active", "amber", false, 3],
    ["CONSULTATION_COMPLETED", "Консультация проведена", "Consultation Completed", "active", "yellow", false, 4],
    ["SURVEY_COMPLETED", "Замер завершен", "Survey Completed", "active", "indigo", false, 5],
    ["PROPOSAL_DRAFT", "Proposal черновик", "Proposal Draft", "active", "violet", false, 6],
    ["PROPOSAL_SENT", "Proposal отправлен", "Proposal Sent", "active", "purple", false, 7],
    ["APPROVED", "Proposal approved", "Proposal Approved", "active", "emerald", false, 8],
    ["PROPOSAL_UPDATED_BY_CLIENT", "Proposal обновлен клиентом", "Proposal Updated by Client", "active", "fuchsia", false, 9],
    ["AGREEMENT_SIGNED", "Agreement подписан", "Agreement Signed", "active", "emerald", false, 10],
    ["DEPOSIT_PENDING", "Депозит ожидается", "Deposit Pending", "active", "orange", false, 11],
    ["DEPOSIT_PAID", "Депозит оплачен", "Deposit Paid", "active", "green", false, 12],
    ["PROJECT_CREATED", "Проект создан", "Project Created", "active", "blue", false, 13],
    ["SCHEDULED", "Запланировано", "Scheduled", "active", "cyan", false, 14],
    ["IN_PROGRESS", "В работе", "In Progress", "active", "lime", false, 15],
    ["COMPLETED", "Завершено", "Completed", "active", "teal", false, 16],
    ["FINAL_PAYMENT_PENDING", "Финальный платеж ожидается", "Final Payment Pending", "active", "amber", false, 17],
    ["PAID", "Оплачено", "Paid", "won", "green", true, 18],
    ["CLOSED_WON", "Сделка выиграна", "Closed Won", "won", "emerald", true, 19],
    ["CLOSED_LOST", "Сделка проиграна", "Closed Lost", "lost", "red", true, 20],
    ["WARRANTY_SERVICE", "Гарантия / Сервис", "Warranty / Service", "service", "orange", false, 21],
  ] as const;

  for (const [status_code, name_ru, name_en, stage_group, color_token, is_closed, sort_order] of pipelineStatuses) {
    await prisma.pipelineStatus.upsert({
      where: { status_code },
      update: { name_ru, name_en, stage_group, color_token, is_closed, sort_order },
      create: { status_code, name_ru, name_en, stage_group, color_token, is_closed, sort_order },
    });
  }
}

async function seedServiceReferences() {
  const serviceTypes = [
    ["SMART_FILM", "Смарт-плёнка", "Smart Film", "sqft", "85.00", "72.00", "38.00", "14.00", "420.00", "280.00", 1],
    ["SOLAR_FILM", "Солнцезащитная плёнка", "Solar Film", "sqft", "19.00", "16.00", "5.50", "4.25", "0.00", "0.00", 2],
    ["SAFETY_FILM", "Защитная плёнка", "Safety Film", "sqft", "24.00", "20.00", "7.20", "5.60", "0.00", "0.00", 3],
    ["REMOVAL", "Удаление старой плёнки", "Removal", "sqft", "2.50", "2.00", "0.00", "0.00", "0.00", "0.00", 4],
    ["WASHING", "Мойка", "Washing", "sqft", "1.50", "1.20", "0.00", "0.00", "0.00", "0.00", 5],
    ["SILICONE", "Силикон", "Silicone", "sqft", "1.75", "1.50", "0.00", "0.00", "0.00", "0.00", 6],
    ["ELECTRICAL_WORK", "Электрика", "Electrical Work", "fixed", "350.00", "300.00", "0.00", "0.00", "0.00", "0.00", 7],
    ["BLOCK_INSTALLATION", "Установка блоков", "Block Installation", "qty", "420.00", "380.00", "0.00", "0.00", "0.00", "0.00", 8],
    ["ZONE_CONNECTION", "Подключение зон", "Zone Connection", "qty", "95.00", "80.00", "0.00", "0.00", "0.00", "0.00", 9],
    ["WARRANTY_SERVICE", "Сервис / гарантия", "Warranty / Service", "fixed", "250.00", "200.00", "0.00", "0.00", "0.00", "0.00", 10],
  ] as const;

  for (const [
    service_code,
    name_ru,
    name_en,
    unit_type,
    base_price,
    min_price,
    material_cost_per_sqft,
    installation_cost_per_sqft,
    block_revenue_price,
    block_cost_price,
    sort_order,
  ] of serviceTypes) {
    await prisma.serviceType.upsert({
      where: { service_code },
      update: {
        name_ru,
        name_en,
        unit_type,
        base_price,
        min_price,
        material_cost_per_sqft,
        installation_cost_per_sqft,
        block_revenue_price,
        block_cost_price,
        sort_order,
      },
      create: {
        service_code,
        name_ru,
        name_en,
        unit_type,
        base_price,
        min_price,
        material_cost_per_sqft,
        installation_cost_per_sqft,
        block_revenue_price,
        block_cost_price,
        sort_order,
      },
    });
  }

  const serviceTypeMap = Object.fromEntries(
    (
      await prisma.serviceType.findMany({
        select: {
          service_type_id: true,
          service_code: true,
        },
      })
    ).map((item) => [item.service_code, item.service_type_id]),
  );

  // Значения выпадающих списков для полей замера.
  // Ключи совпадают с field_key, значения кладутся в default_value
  // и читаются формой замера. Коды остекления и сторон света
  // совпадают с allowed_glass_types / restricted_orientations в каталоге.
  type FieldOption = { value: string; label_ru: string; label_en: string };
  const fieldOptionValues: Record<string, FieldOption[]> = {
    orientation: [
      { value: "south", label_ru: "Юг", label_en: "South" },
      { value: "west", label_ru: "Запад", label_en: "West" },
      { value: "east", label_ru: "Восток", label_en: "East" },
      { value: "north", label_ru: "Север", label_en: "North" },
      { value: "southwest", label_ru: "Юго-запад", label_en: "Southwest" },
      { value: "southeast", label_ru: "Юго-восток", label_en: "Southeast" },
      { value: "northwest", label_ru: "Северо-запад", label_en: "Northwest" },
      { value: "northeast", label_ru: "Северо-восток", label_en: "Northeast" },
    ],
    glass_type: [
      { value: "single_tempered", label_ru: "Одинарное закалённое", label_en: "Single tempered" },
      { value: "single_annealed", label_ru: "Одинарное обычное", label_en: "Single annealed" },
      { value: "dual_pane", label_ru: "Стеклопакет", label_en: "Dual pane" },
      { value: "low_e", label_ru: "Стеклопакет Low-E", label_en: "Low-E dual pane" },
      { value: "skylight", label_ru: "Skylight / потолочное", label_en: "Skylight" },
      { value: "panoramic", label_ru: "Панорамное", label_en: "Panoramic" },
      { value: "laminated", label_ru: "Триплекс", label_en: "Laminated" },
      { value: "unknown", label_ru: "Не определён — передать специалисту", label_en: "Unknown — escalate" },
    ],
    low_e_surface: [
      { value: "surface_2", label_ru: "Поверхность 2 (внутри камеры, наружное стекло)", label_en: "Surface 2" },
      { value: "surface_3", label_ru: "Поверхность 3 (внутри камеры, внутреннее стекло)", label_en: "Surface 3" },
      { value: "surface_4", label_ru: "Поверхность 4 (со стороны помещения)", label_en: "Surface 4" },
      { value: "unknown", label_ru: "Не определена — передать специалисту", label_en: "Unknown — escalate" },
    ],
    power_unit_access: [
      { value: "open", label_ru: "Открытый доступ", label_en: "Open access" },
      { value: "cabinet", label_ru: "Шкаф или ниша", label_en: "Cabinet or niche" },
      { value: "ceiling", label_ru: "За подвесным потолком", label_en: "Above ceiling" },
      { value: "attic", label_ru: "Чердак — нужна защита и СИЗ", label_en: "Attic — PPE required" },
      { value: "wall_opening", label_ru: "Требуется вскрытие стены", label_en: "Wall opening required" },
    ],
    block_type: [
      { value: "standard_remote", label_ru: "Стандартный блок с пультом", label_en: "Standard unit with remote" },
      { value: "timer", label_ru: "Блок с таймером", label_en: "Timer unit" },
      { value: "smart_home", label_ru: "Блок с интеграцией умного дома", label_en: "Smart home unit" },
    ],
    frame_type: [
      { value: "aluminum", label_ru: "Алюминий", label_en: "Aluminum" },
      { value: "vinyl", label_ru: "Винил / ПВХ", label_en: "Vinyl" },
      { value: "wood", label_ru: "Дерево", label_en: "Wood" },
      { value: "steel", label_ru: "Сталь", label_en: "Steel" },
      { value: "frameless", label_ru: "Без рамы", label_en: "Frameless" },
    ],
  };

  const smartFilmFields = [
    ["category", "Категория", "Category", "select", "string", "film_catalog", true, 1],
    ["brand", "Бренд", "Brand", "select", "string", "film_catalog", true, 2],
    ["model", "Модель", "Model", "select", "string", "film_catalog", true, 3],
    ["sqft", "Метраж для клиента", "Billable Sqft", "number", "decimal", null, true, 4],
    ["actual_film_sqft", "Фактический метраж плёнки", "Actual Film Sqft", "number", "decimal", null, true, 5],
    ["complexity_level_id", "Сложность монтажа", "Access Complexity", "select", "string", "complexity_levels", true, 6],
    ["zones_qty", "Кол-во зон", "Zones Qty", "number", "integer", null, true, 7],
    ["blocks_qty", "Кол-во блоков", "Blocks Qty", "number", "integer", null, false, 8],
    ["block_type", "Тип блока", "Block Type", "select", "string", "service_field_config", false, 9],

    // Электрика. Без этих ответов нельзя посчитать смету и спланировать
    // первый заход бригады — именно электромонтаж делает смарт-проект дорогим.
    ["power_unit_location", "Где ставим блок питания", "Power Unit Location", "text", "string", null, true, 10],
    ["power_unit_access", "Доступ к блоку", "Power Unit Access", "select", "string", "service_field_config", true, 11],
    ["wall_switch_needed", "Нужен настенный выключатель", "Wall Switch Needed", "checkbox", "boolean", null, true, 12],
    ["wall_switch_qty", "Сколько выключателей", "Wall Switch Qty", "number", "integer", null, false, 13],
    ["wall_switch_location", "Где выключатели", "Wall Switch Location", "text", "string", null, false, 14],
    ["wiring_route", "Как идёт проводка", "Wiring Route", "text", "string", null, true, 15],
    ["existing_conduit", "Есть готовая трасса", "Existing Conduit", "checkbox", "boolean", null, false, 16],
    ["voice_control", "Голосовое управление", "Voice Control", "checkbox", "boolean", null, false, 17],

    ["extra_costs", "Доп. расходы", "Extra Costs", "number", "decimal", null, false, 20],
  ] as const;

  for (const [field_key, field_label_ru, field_label_en, input_type, data_type, dropdown_source, is_required, sort_order] of smartFilmFields) {
    await prisma.serviceFieldConfig.upsert({
      where: {
        service_type_id_field_key: {
          service_type_id: serviceTypeMap.SMART_FILM,
          field_key,
        },
      },
      update: {
        field_label_ru,
        field_label_en,
        input_type,
        data_type,
        dropdown_source,
        is_required,
        sort_order,
        default_value: fieldOptionValues[field_key]
          ? { options: fieldOptionValues[field_key] }
          : undefined,
      },
      create: {
        service_type_id: serviceTypeMap.SMART_FILM,
        field_key,
        field_label_ru,
        field_label_en,
        input_type,
        data_type,
        dropdown_source,
        is_required,
        default_value: fieldOptionValues[field_key]
          ? { options: fieldOptionValues[field_key] }
          : undefined,
        sort_order,
      },
    });
  }

  await prisma.serviceFieldConfig.updateMany({
    where: {
      service_type_id: serviceTypeMap.SMART_FILM,
      field_key: {
        in: ["windows_qty", "zone_connections_qty", "electrical_required"],
      },
    },
    data: {
      is_active: false,
    },
  });

  const solarFilmFields = [
    ["category", "Категория", "Category", "select", "string", "film_catalog", true, 1],
    ["brand", "Бренд", "Brand", "select", "string", "film_catalog", true, 2],
    ["model", "Модель", "Model", "select", "string", "film_catalog", true, 3],
    ["sqft", "Метраж для клиента", "Billable Sqft", "number", "decimal", null, true, 4],
    ["actual_film_sqft", "Фактический метраж плёнки", "Actual Film Sqft", "number", "decimal", null, true, 5],
    ["complexity_level_id", "Сложность монтажа", "Access Complexity", "select", "string", "complexity_levels", true, 6],
    ["windows_qty", "Кол-во окон", "Windows Qty", "number", "integer", null, true, 7],

    // Подбор плёнки. Сторона света и тип стекла определяют, какая модель
    // допустима: тёмная плёнка на южном стеклопакете колет стекло.
    ["orientation", "Сторона света", "Orientation", "select", "string", "service_field_config", true, 8],
    ["glass_type", "Тип остекления", "Glass Type", "select", "string", "service_field_config", true, 9],
    ["glass_thickness_mm", "Толщина стекла, мм", "Glass Thickness mm", "number", "decimal", null, false, 10],
    ["low_e_surface", "Поверхность Low-E покрытия", "Low-E Surface", "select", "string", "service_field_config", false, 11],
    ["seam_expected", "Будет стык плёнки", "Seam Expected", "checkbox", "boolean", null, false, 12],
    ["seam_position_agreed", "Место стыка согласовано с клиентом", "Seam Position Agreed", "checkbox", "boolean", null, false, 13],

    ["extra_costs", "Доп. расходы", "Extra Costs", "number", "decimal", null, false, 20],
  ] as const;

  for (const [field_key, field_label_ru, field_label_en, input_type, data_type, dropdown_source, is_required, sort_order] of solarFilmFields) {
    await prisma.serviceFieldConfig.upsert({
      where: {
        service_type_id_field_key: {
          service_type_id: serviceTypeMap.SOLAR_FILM,
          field_key,
        },
      },
      update: {
        field_label_ru,
        field_label_en,
        input_type,
        data_type,
        dropdown_source,
        is_required,
        sort_order,
        default_value: fieldOptionValues[field_key]
          ? { options: fieldOptionValues[field_key] }
          : undefined,
      },
      create: {
        service_type_id: serviceTypeMap.SOLAR_FILM,
        field_key,
        field_label_ru,
        field_label_en,
        input_type,
        data_type,
        dropdown_source,
        is_required,
        sort_order,
        default_value: fieldOptionValues[field_key]
          ? { options: fieldOptionValues[field_key] }
          : undefined,
      },
    });
  }

  const safetyFilmFields = [
    ["category", "Категория", "Category", "select", "string", "film_catalog", true, 1],
    ["brand", "Бренд", "Brand", "select", "string", "film_catalog", true, 2],
    ["model", "Модель", "Model", "select", "string", "film_catalog", true, 3],
    ["thickness", "Толщина", "Thickness", "text", "string", null, false, 4],
    ["sqft", "Метраж для клиента", "Billable Sqft", "number", "decimal", null, true, 5],
    ["actual_film_sqft", "Фактический метраж плёнки", "Actual Film Sqft", "number", "decimal", null, true, 6],
    ["complexity_level_id", "Сложность монтажа", "Access Complexity", "select", "string", "complexity_levels", true, 7],
    ["windows_qty", "Кол-во окон", "Windows Qty", "number", "integer", null, true, 8],

    // Защита работает только вместе с креплением по периметру:
    // без силикона плёнка удерживает осколки, но стекло вылетает из рамы.
    ["risk_zones", "Опасные зоны", "Risk Zones", "textarea", "string", null, true, 9],
    ["silicone_perimeter_m", "Силикон по периметру, м", "Silicone Perimeter m", "number", "decimal", null, true, 10],
    ["frame_type", "Тип рамы", "Frame Type", "select", "string", "service_field_config", false, 11],
    ["glass_type", "Тип остекления", "Glass Type", "select", "string", "service_field_config", true, 12],

    ["extra_costs", "Доп. расходы", "Extra Costs", "number", "decimal", null, false, 20],
  ] as const;

  for (const [field_key, field_label_ru, field_label_en, input_type, data_type, dropdown_source, is_required, sort_order] of safetyFilmFields) {
    await prisma.serviceFieldConfig.upsert({
      where: {
        service_type_id_field_key: {
          service_type_id: serviceTypeMap.SAFETY_FILM,
          field_key,
        },
      },
      update: {
        field_label_ru,
        field_label_en,
        input_type,
        data_type,
        dropdown_source,
        is_required,
        sort_order,
        default_value: fieldOptionValues[field_key]
          ? { options: fieldOptionValues[field_key] }
          : undefined,
      },
      create: {
        service_type_id: serviceTypeMap.SAFETY_FILM,
        field_key,
        field_label_ru,
        field_label_en,
        input_type,
        data_type,
        dropdown_source,
        is_required,
        sort_order,
        default_value: fieldOptionValues[field_key]
          ? { options: fieldOptionValues[field_key] }
          : undefined,
      },
    });
  }

  const addons = [
    ["SMART_FILM", "WASHING", "Мойка", "Washing", "sqft", "1.50", "1.20", "0.35", 1],
    ["SMART_FILM", "REMOVAL", "Удаление", "Removal", "sqft", "2.50", "2.00", "0.80", 2],
    ["SMART_FILM", "SILICONE", "Силикон", "Silicone", "sqft", "1.75", "1.50", "0.45", 3],
    ["SMART_FILM", "EXTRA_ELECTRICAL", "Электромонтаж до зон", "Zone Wiring Installation", "fixed", "350.00", "300.00", "180.00", 4],
    ["SMART_FILM", "OTHER", "Другое", "Other", "fixed", "0.00", "0.00", "0.00", 5],
    ["SOLAR_FILM", "WASHING", "Мойка", "Washing", "sqft", "1.50", "1.20", "0.35", 1],
    ["SOLAR_FILM", "REMOVAL", "Удаление", "Removal", "sqft", "2.50", "2.00", "0.80", 2],
    ["SOLAR_FILM", "SILICONE", "Силикон", "Silicone", "sqft", "1.75", "1.50", "0.45", 3],
    ["SOLAR_FILM", "OTHER", "Другое", "Other", "fixed", "0.00", "0.00", "0.00", 4],
    ["SAFETY_FILM", "WASHING", "Мойка", "Washing", "sqft", "1.50", "1.20", "0.35", 1],
    ["SAFETY_FILM", "REMOVAL", "Удаление", "Removal", "sqft", "2.50", "2.00", "0.80", 2],
    ["SAFETY_FILM", "SILICONE", "Силикон", "Silicone", "sqft", "1.75", "1.50", "0.45", 3],
    ["SAFETY_FILM", "ANCHORING", "Крепление / Anchoring", "Attachment / Anchoring", "fixed", "240.00", "210.00", "110.00", 4],
    ["SAFETY_FILM", "OTHER", "Другое", "Other", "fixed", "0.00", "0.00", "0.00", 5],
  ] as const;

  for (const [serviceCode, addon_code, name_ru, name_en, unit_type, default_price, min_price, cost_price, sort_order] of addons) {
    await prisma.serviceAddon.upsert({
      where: {
        service_type_id_addon_code: {
          service_type_id: serviceTypeMap[serviceCode],
          addon_code,
        },
      },
      update: { name_ru, name_en, unit_type, default_price, min_price, cost_price, sort_order },
      create: {
        service_type_id: serviceTypeMap[serviceCode],
        addon_code,
        name_ru,
        name_en,
        unit_type,
        default_price,
        min_price,
        cost_price,
        sort_order,
      },
    });
  }

  // Реальная линейка RolanPRO. MAGNITRONIC PRIME SP — основная плёнка.
  // Внутренние коды MP05…MP70 сохранены, чтобы не сломать старые заказы;
  // клиентское название модели — SP-5%…SP-70%. Замеры прибором LS160A, 2026.
  //
  // Коды остекления: single_tempered, single_annealed, dual_pane,
  // low_e, skylight, panoramic. Стороны света: south, west, north, east.
  const films = [
    // category, cat_ru, cat_en, brand, brand_ru, brand_en, model_code,
    // model_ru, model_en, thickness, unit, sort, vlt, uv, ir, tser,
    // allowed_glass, restricted_orientations, requires_review, note
    ["SOLAR", "Солнцезащитная", "Solar Film", "MAGNITRONIC", "Magnitronic Prime", "Magnitronic Prime",
     "MP05", "SP-5%", "SP-5%", null, "sqft", 1, "5.70", "100.00", "95.60", "93.30",
     ["single_tempered"], ["south", "west"], false,
     "Максимальное затемнение. Только закалённое одинарное стекло."],
    ["SOLAR", "Солнцезащитная", "Solar Film", "MAGNITRONIC", "Magnitronic Prime", "Magnitronic Prime",
     "MP15", "SP-15%", "SP-15%", null, "sqft", 2, "14.00", "99.90", "97.40", "88.50",
     ["single_tempered", "single_annealed"], ["south", "west"], false,
     "Тёмная. На стеклопакет не ставить."],
    ["SOLAR", "Солнцезащитная", "Solar Film", "MAGNITRONIC", "Magnitronic Prime", "Magnitronic Prime",
     "MP20", "SP-20%", "SP-20%", null, "sqft", 3, "23.50", "99.90", "98.30", "83.20",
     ["single_tempered", "single_annealed", "dual_pane", "panoramic"], ["south", "west"], false,
     "На стеклопакет и панораму только север и восток."],
    ["SOLAR", "Солнцезащитная", "Solar Film", "MAGNITRONIC", "Magnitronic Prime", "Magnitronic Prime",
     "MP35", "SP-35%", "SP-35%", null, "sqft", 4, "35.50", "99.80", "98.50", "77.10",
     ["single_tempered", "single_annealed", "dual_pane", "panoramic"], [], false,
     "Универсальный выбор для стеклопакета и панорамы."],
    ["SOLAR", "Солнцезащитная", "Solar Film", "MAGNITRONIC", "Magnitronic Prime", "Magnitronic Prime",
     "MP50", "SP-50%", "SP-50%", null, "sqft", 5, "58.10", "99.60", "99.20", "68.20",
     ["single_tempered", "single_annealed", "dual_pane", "low_e", "skylight", "panoramic"], [], false,
     "Безопасен для Low-E и skylight. Для Low-E зафиксировать поверхность покрытия."],
    ["SOLAR", "Солнцезащитная", "Solar Film", "MAGNITRONIC", "Magnitronic Prime", "Magnitronic Prime",
     "MP70", "SP-70%", "SP-70%", null, "sqft", 6, "68.00", "99.20", "99.40", "63.60",
     ["single_tempered", "single_annealed", "dual_pane", "low_e", "skylight", "panoramic"], [], false,
     "Максимально прозрачная. Подходит везде, включая skylight."],

    // Защитная: три класса по толщине.
    ["SAFETY", "Защитная", "Safety Film", "ROLANPRO", "RolanPRO", "RolanPRO",
     "A1", "A1 — 8 mil", "A1 — 8 mil", "8 mil", "sqft", 11, null, null, null, null,
     null, null, false, "Базовый класс. Силикон по периметру обязателен."],
    ["SAFETY", "Защитная", "Safety Film", "ROLANPRO", "RolanPRO", "RolanPRO",
     "A2", "A2 — 12 mil", "A2 — 12 mil", "12 mil", "sqft", 12, null, null, null, null,
     null, null, false, "Средний класс. Силикон по периметру обязателен."],
    ["SAFETY", "Защитная", "Safety Film", "ROLANPRO", "RolanPRO", "RolanPRO",
     "A3", "A3 — 24 mil", "A3 — 24 mil", "24 mil", "sqft", 13, null, null, null, null,
     null, null, false, "Максимальный класс. Силикон по периметру обязателен."],
  ] as const;

  for (const [
    category_code,
    category_name_ru,
    category_name_en,
    brand_code,
    brand_name_ru,
    brand_name_en,
    model_code,
    model_name_ru,
    model_name_en,
    thickness,
    unit,
    sort_order,
    vlt_percent,
    uv_rejection_percent,
    ir_rejection_percent,
    tser_percent,
    allowed_glass_types,
    restricted_orientations,
    requires_review,
    selection_note_ru,
  ] of films) {
    const specs = {
      category_code,
      category_name_ru,
      category_name_en,
      brand_code,
      brand_name_ru,
      brand_name_en,
      model_name_ru,
      model_name_en,
      thickness,
      unit,
      sort_order,
      vlt_percent,
      uv_rejection_percent,
      ir_rejection_percent,
      tser_percent,
      allowed_glass_types: allowed_glass_types ? [...allowed_glass_types] : undefined,
      restricted_orientations: restricted_orientations ? [...restricted_orientations] : undefined,
      requires_review,
      selection_note_ru,
    };

    await prisma.filmCatalog.upsert({
      where: { model_code },
      update: specs,
      create: { model_code, ...specs },
    });
  }
}

async function seedDevUsers() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const bootstrapPasswordHash = hashPassword("ChangeMe123!");
  const roles = await prisma.role.findMany({
    select: {
      role_id: true,
      code: true,
    },
  });

  const roleMap = Object.fromEntries(roles.map((role) => [role.code, role.role_id]));
  const demoUsers = [
    ["owner@rolanpro.local", "ROLANPRO Owner", ROLE_CODES.OWNER],
    ["manager@rolanpro.local", "ROLANPRO Manager", ROLE_CODES.MANAGER],
    ["consultant@rolanpro.local", "ROLANPRO Consultant", ROLE_CODES.CONSULTANT],
    ["installer@rolanpro.local", "ROLANPRO Installer", ROLE_CODES.INSTALLER],
    ["installer2@rolanpro.local", "ROLANPRO Installer Crew 2", ROLE_CODES.INSTALLER],
    ["installer3@rolanpro.local", "ROLANPRO Installer Crew 3", ROLE_CODES.INSTALLER],
  ] as const;

  for (const [email, full_name, roleCode] of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        full_name,
        is_active: true,
      },
      create: {
        email,
        full_name,
        password_hash: bootstrapPasswordHash,
        is_active: true,
      },
    });

    await prisma.userAccess.upsert({
      where: {
        user_id_role_id: {
          user_id: user.user_id,
          role_id: roleMap[roleCode],
        },
      },
      update: {
        is_primary: true,
        is_active: true,
      },
      create: {
        user_id: user.user_id,
        role_id: roleMap[roleCode],
        is_primary: true,
        is_active: true,
      },
    });
  }
}

async function seedDevSalesData() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const [losAngeles, manager, newLeadStatus, proposalSentStatus, depositPendingStatus, clientCity] =
    await Promise.all([
      prisma.city.findUnique({ where: { city_code: "LOS_ANGELES" } }),
      prisma.user.findUnique({ where: { email: "manager@rolanpro.local" } }),
      prisma.pipelineStatus.findUnique({ where: { status_code: "NEW_LEAD" } }),
      prisma.pipelineStatus.findUnique({ where: { status_code: "PROPOSAL_SENT" } }),
      prisma.pipelineStatus.findUnique({ where: { status_code: "DEPOSIT_PENDING" } }),
      prisma.city.findUnique({ where: { city_code: "GLENDALE" } }),
    ]);

  if (!losAngeles || !manager || !newLeadStatus || !proposalSentStatus || !depositPendingStatus || !clientCity) {
    return;
  }

  const lead = await prisma.lead.upsert({
    where: { lead_code: "LD-1001" },
    update: {
      pipeline_status_id: newLeadStatus.pipeline_status_id,
      assigned_manager_id: manager.user_id,
    },
    create: {
      lead_code: "LD-1001",
      name: "Hillside Residence",
      phone: "(555) 301-1201",
      email: "hello@hillside-demo.com",
      source: "Google Ads",
      pipeline_status_id: newLeadStatus.pipeline_status_id,
      city_id: losAngeles.city_id,
      assigned_manager_id: manager.user_id,
      notes: "Smart film request for conference room and lobby.",
    },
  });

  const client = await prisma.client.upsert({
    where: { client_code: "CL-1001" },
    update: {},
    create: {
      client_code: "CL-1001",
      name: "Beverly Office Group",
      phone: "(555) 401-2290",
      email: "ops@beverly-office-demo.com",
      service_address: "1250 S Hope St, Los Angeles, CA 90017",
      billing_address: "1250 S Hope St, Los Angeles, CA 90017",
      city_id: clientCity.city_id,
      zip_code: "90017",
    },
  });

  const deal = await prisma.deal.upsert({
    where: { deal_code: "DL-1001" },
    update: {
      pipeline_status_id: proposalSentStatus.pipeline_status_id,
      client_id: client.client_id,
      assigned_manager_id: manager.user_id,
      estimated_value: "9300.00",
    },
    create: {
      deal_code: "DL-1001",
      lead_id: lead.lead_id,
      client_id: client.client_id,
      assigned_manager_id: manager.user_id,
      pipeline_status_id: proposalSentStatus.pipeline_status_id,
      title: "Downtown Office Smart + Solar",
      estimated_value: "9300.00",
      currency: "USD",
      notes: "Client requested optional washing and removal.",
    },
  });

  await prisma.followUp.upsert({
    where: { follow_up_id: "00000000-0000-0000-0000-000000000001" },
    update: {
      lead_id: lead.lead_id,
      deal_id: deal.deal_id,
      assigned_to: manager.user_id,
      created_by: manager.user_id,
    },
    create: {
      follow_up_id: "00000000-0000-0000-0000-000000000001",
      lead_id: lead.lead_id,
      deal_id: deal.deal_id,
      type_key: "proposal_review_call",
      status: "scheduled",
      due_at: new Date("2026-03-22T17:00:00.000Z"),
      notes: "Call client after proposal review.",
      assigned_to: manager.user_id,
      created_by: manager.user_id,
    },
  });

  await prisma.task.upsert({
    where: { task_id: "00000000-0000-0000-0000-000000000002" },
    update: {
      lead_id: lead.lead_id,
      deal_id: deal.deal_id,
      assigned_to: manager.user_id,
      created_by: manager.user_id,
    },
    create: {
      task_id: "00000000-0000-0000-0000-000000000002",
      lead_id: lead.lead_id,
      deal_id: deal.deal_id,
      title: "Подготовить deposit link",
      description: "После подтверждения proposal отправить Stripe deposit.",
      status: "open",
      priority: "high",
      due_at: new Date("2026-03-22T19:00:00.000Z"),
      assigned_to: manager.user_id,
      created_by: manager.user_id,
    },
  });

  const seededActivity = await prisma.activityLog.findFirst({
    where: {
      entity_type: "deal",
      entity_id: deal.deal_id,
      action_key: "deal.seeded",
    },
    select: {
      activity_id: true,
    },
  });

  if (!seededActivity) {
    await prisma.activityLog.create({
      data: {
        actor_user_id: manager.user_id,
        entity_type: "deal",
        entity_id: deal.deal_id,
        action_key: "deal.seeded",
        message: "Сделка и CRM pipeline seed-данные созданы для V1 demo.",
        metadata: {
          pipeline_status: depositPendingStatus.status_code,
        },
      },
    });
  }
}

async function seedDevConsultationData() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const [
    manager,
    consultant,
    consultationEventType,
    surveyTrack,
    losAngeles,
    glendale,
    consultationScheduledStatus,
    surveyCompletedStatus,
    standardComplexity,
    highComplexity,
    smartFilm,
    solarFilm,
    smartServiceType,
    solarServiceType,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { email: "manager@rolanpro.local" } }),
    prisma.user.findUnique({ where: { email: "consultant@rolanpro.local" } }),
    prisma.eventType.findUnique({ where: { event_code: "CONSULTATION" } }),
    prisma.eventTrack.findUnique({ where: { track_code: "SURVEY" } }),
    prisma.city.findUnique({ where: { city_code: "LOS_ANGELES" } }),
    prisma.city.findUnique({ where: { city_code: "GLENDALE" } }),
    prisma.pipelineStatus.findUnique({ where: { status_code: "CONSULTATION_SCHEDULED" } }),
    prisma.pipelineStatus.findUnique({ where: { status_code: "SURVEY_COMPLETED" } }),
    prisma.complexityLevel.findUnique({ where: { level_code: "STANDARD" } }),
    prisma.complexityLevel.findUnique({ where: { level_code: "HIGH" } }),
    prisma.filmCatalog.findUnique({ where: { model_code: "VISION" } }),
    prisma.filmCatalog.findUnique({ where: { model_code: "PRESTIGE_70" } }),
    prisma.serviceType.findUnique({ where: { service_code: "SMART_FILM" } }),
    prisma.serviceType.findUnique({ where: { service_code: "SOLAR_FILM" } }),
  ]);

  if (
    !manager ||
    !consultant ||
    !consultationEventType ||
    !surveyTrack ||
    !losAngeles ||
    !glendale ||
    !consultationScheduledStatus ||
    !surveyCompletedStatus ||
    !standardComplexity ||
    !highComplexity ||
    !smartFilm ||
    !solarFilm ||
    !smartServiceType ||
    !solarServiceType
  ) {
    return;
  }

  const completedLead = await prisma.lead.upsert({
    where: { lead_code: "LD-2001" },
    update: {
      pipeline_status_id: surveyCompletedStatus.pipeline_status_id,
      assigned_manager_id: manager.user_id,
    },
    create: {
      lead_code: "LD-2001",
      name: "Skyline Tower Survey",
      phone: "(555) 702-1101",
      email: "facilities@skyline-demo.com",
      source: "Referral",
      pipeline_status_id: surveyCompletedStatus.pipeline_status_id,
      city_id: losAngeles.city_id,
      assigned_manager_id: manager.user_id,
      notes: "Consultation and full survey for smart film conference rooms.",
    },
  });

  const completedClient = await prisma.client.upsert({
    where: { client_code: "CL-2001" },
    update: {},
    create: {
      client_code: "CL-2001",
      name: "Skyline Tower Management",
      phone: "(555) 702-1122",
      email: "ops@skyline-demo.com",
      service_address: "900 Wilshire Blvd, Los Angeles, CA 90017",
      billing_address: "900 Wilshire Blvd, Los Angeles, CA 90017",
      city_id: losAngeles.city_id,
      zip_code: "90017",
      notes: "Primary commercial account for survey flow.",
    },
  });

  const completedDeal = await prisma.deal.upsert({
    where: { deal_code: "DL-2001" },
    update: {
      pipeline_status_id: surveyCompletedStatus.pipeline_status_id,
      client_id: completedClient.client_id,
      assigned_manager_id: manager.user_id,
      estimated_value: "14800.00",
    },
    create: {
      deal_code: "DL-2001",
      lead_id: completedLead.lead_id,
      client_id: completedClient.client_id,
      assigned_manager_id: manager.user_id,
      pipeline_status_id: surveyCompletedStatus.pipeline_status_id,
      title: "Skyline Tower Smart Survey",
      estimated_value: "14800.00",
      currency: "USD",
      notes: "Survey completed, ready for proposal build.",
    },
  });

  const scheduledLead = await prisma.lead.upsert({
    where: { lead_code: "LD-2002" },
    update: {
      pipeline_status_id: consultationScheduledStatus.pipeline_status_id,
      assigned_manager_id: manager.user_id,
    },
    create: {
      lead_code: "LD-2002",
      name: "Glendale Medical Office",
      phone: "(555) 703-1101",
      email: "admin@glendale-med-demo.com",
      source: "Website",
      pipeline_status_id: consultationScheduledStatus.pipeline_status_id,
      city_id: glendale.city_id,
      assigned_manager_id: manager.user_id,
      notes: "Upcoming solar film consultation and measurements.",
    },
  });

  const scheduledClient = await prisma.client.upsert({
    where: { client_code: "CL-2002" },
    update: {},
    create: {
      client_code: "CL-2002",
      name: "Glendale Medical Office",
      phone: "(555) 703-1199",
      email: "admin@glendale-med-demo.com",
      service_address: "250 N Brand Blvd, Glendale, CA 91203",
      billing_address: "250 N Brand Blvd, Glendale, CA 91203",
      city_id: glendale.city_id,
      zip_code: "91203",
    },
  });

  const scheduledDeal = await prisma.deal.upsert({
    where: { deal_code: "DL-2002" },
    update: {
      pipeline_status_id: consultationScheduledStatus.pipeline_status_id,
      client_id: scheduledClient.client_id,
      assigned_manager_id: manager.user_id,
      estimated_value: "6200.00",
    },
    create: {
      deal_code: "DL-2002",
      lead_id: scheduledLead.lead_id,
      client_id: scheduledClient.client_id,
      assigned_manager_id: manager.user_id,
      pipeline_status_id: consultationScheduledStatus.pipeline_status_id,
      title: "Glendale Medical Solar Consultation",
      estimated_value: "6200.00",
      currency: "USD",
      notes: "Consultation scheduled for front office and waiting room.",
    },
  });

  await prisma.calendarEvent.upsert({
    where: { calendar_event_id: "00000000-0000-0000-0000-000000000201" },
    update: {
      assigned_user_id: consultant.user_id,
      lead_id: completedLead.lead_id,
      deal_id: completedDeal.deal_id,
      title: "Консультация / Skyline Tower",
      starts_at: new Date("2026-03-20T16:00:00.000Z"),
      ends_at: new Date("2026-03-20T18:00:00.000Z"),
      status: "completed",
      event_type_id: consultationEventType.event_type_id,
      event_track_id: surveyTrack.event_track_id,
    },
    create: {
      calendar_event_id: "00000000-0000-0000-0000-000000000201",
      event_type_id: consultationEventType.event_type_id,
      event_track_id: surveyTrack.event_track_id,
      lead_id: completedLead.lead_id,
      deal_id: completedDeal.deal_id,
      assigned_user_id: consultant.user_id,
      title: "Консультация / Skyline Tower",
      starts_at: new Date("2026-03-20T16:00:00.000Z"),
      ends_at: new Date("2026-03-20T18:00:00.000Z"),
      status: "completed",
      color_token: "yellow",
    },
  });

  await prisma.calendarEvent.upsert({
    where: { calendar_event_id: "00000000-0000-0000-0000-000000000202" },
    update: {
      assigned_user_id: consultant.user_id,
      lead_id: scheduledLead.lead_id,
      deal_id: scheduledDeal.deal_id,
      title: "Консультация / Glendale Medical",
      starts_at: new Date("2026-03-24T18:00:00.000Z"),
      ends_at: new Date("2026-03-24T20:00:00.000Z"),
      status: "scheduled",
      event_type_id: consultationEventType.event_type_id,
      event_track_id: surveyTrack.event_track_id,
    },
    create: {
      calendar_event_id: "00000000-0000-0000-0000-000000000202",
      event_type_id: consultationEventType.event_type_id,
      event_track_id: surveyTrack.event_track_id,
      lead_id: scheduledLead.lead_id,
      deal_id: scheduledDeal.deal_id,
      assigned_user_id: consultant.user_id,
      title: "Консультация / Glendale Medical",
      starts_at: new Date("2026-03-24T18:00:00.000Z"),
      ends_at: new Date("2026-03-24T20:00:00.000Z"),
      status: "scheduled",
      color_token: "yellow",
    },
  });

  const completedConsultation = await prisma.consultation.upsert({
    where: { consultation_id: "00000000-0000-0000-0000-000000000211" },
    update: {
      lead_id: completedLead.lead_id,
      deal_id: completedDeal.deal_id,
      client_id: completedClient.client_id,
      assigned_consultant_id: consultant.user_id,
      assigned_manager_id: manager.user_id,
      created_by: manager.user_id,
      status: "completed",
      completed_at: new Date("2026-03-20T18:05:00.000Z"),
      title: "Skyline Tower / Smart survey",
      location_address: completedClient.service_address,
      manager_notes: "Проверить electrical path для smart film и возможные блоки по этажу.",
      consultant_notes: "Survey completed. Main conference glazing is low-iron and easy access from corridor side.",
      scheduled_start_at: new Date("2026-03-20T16:00:00.000Z"),
      scheduled_end_at: new Date("2026-03-20T18:00:00.000Z"),
      calendar_event_id: "00000000-0000-0000-0000-000000000201",
    },
    create: {
      consultation_id: "00000000-0000-0000-0000-000000000211",
      calendar_event_id: "00000000-0000-0000-0000-000000000201",
      lead_id: completedLead.lead_id,
      deal_id: completedDeal.deal_id,
      client_id: completedClient.client_id,
      assigned_consultant_id: consultant.user_id,
      assigned_manager_id: manager.user_id,
      created_by: manager.user_id,
      status: "completed",
      title: "Skyline Tower / Smart survey",
      location_address: completedClient.service_address,
      scheduled_start_at: new Date("2026-03-20T16:00:00.000Z"),
      scheduled_end_at: new Date("2026-03-20T18:00:00.000Z"),
      manager_notes: "Проверить electrical path для smart film и возможные блоки по этажу.",
      consultant_notes: "Survey completed. Main conference glazing is low-iron and easy access from corridor side.",
      completed_at: new Date("2026-03-20T18:05:00.000Z"),
    },
  });

  await prisma.consultation.upsert({
    where: { consultation_id: "00000000-0000-0000-0000-000000000212" },
    update: {
      lead_id: scheduledLead.lead_id,
      deal_id: scheduledDeal.deal_id,
      client_id: scheduledClient.client_id,
      assigned_consultant_id: consultant.user_id,
      assigned_manager_id: manager.user_id,
      created_by: manager.user_id,
      status: "scheduled",
      title: "Glendale Medical / Solar consultation",
      location_address: scheduledClient.service_address,
      manager_notes: "Снять размеры front desk и waiting room, проверить glare complaints.",
      scheduled_start_at: new Date("2026-03-24T18:00:00.000Z"),
      scheduled_end_at: new Date("2026-03-24T20:00:00.000Z"),
      calendar_event_id: "00000000-0000-0000-0000-000000000202",
    },
    create: {
      consultation_id: "00000000-0000-0000-0000-000000000212",
      calendar_event_id: "00000000-0000-0000-0000-000000000202",
      lead_id: scheduledLead.lead_id,
      deal_id: scheduledDeal.deal_id,
      client_id: scheduledClient.client_id,
      assigned_consultant_id: consultant.user_id,
      assigned_manager_id: manager.user_id,
      created_by: manager.user_id,
      status: "scheduled",
      title: "Glendale Medical / Solar consultation",
      location_address: scheduledClient.service_address,
      scheduled_start_at: new Date("2026-03-24T18:00:00.000Z"),
      scheduled_end_at: new Date("2026-03-24T20:00:00.000Z"),
      manager_notes: "Снять размеры front desk и waiting room, проверить glare complaints.",
    },
  });

  const completedSurvey = await prisma.survey.upsert({
    where: { consultation_id: completedConsultation.consultation_id },
    update: {
      status: "completed",
      summary_notes: "Conference rooms fit smart film. Lobby side can take solar film as optional value-engineering option.",
      electrical_notes: "Electrical feed available above ceiling line near conference room A.",
      smart_recommended: true,
      solar_recommended: true,
      safety_recommended: false,
      completed_at: new Date("2026-03-20T18:05:00.000Z"),
    },
    create: {
      consultation_id: completedConsultation.consultation_id,
      status: "completed",
      summary_notes: "Conference rooms fit smart film. Lobby side can take solar film as optional value-engineering option.",
      electrical_notes: "Electrical feed available above ceiling line near conference room A.",
      smart_recommended: true,
      solar_recommended: true,
      safety_recommended: false,
      completed_at: new Date("2026-03-20T18:05:00.000Z"),
    },
  });

  await prisma.survey.upsert({
    where: { consultation_id: "00000000-0000-0000-0000-000000000212" },
    update: {
      status: "draft",
      summary_notes: "Consultation scheduled, survey not started yet.",
      smart_recommended: false,
      solar_recommended: false,
      safety_recommended: false,
    },
    create: {
      consultation_id: "00000000-0000-0000-0000-000000000212",
      status: "draft",
      summary_notes: "Consultation scheduled, survey not started yet.",
      smart_recommended: false,
      solar_recommended: false,
      safety_recommended: false,
    },
  });

  await prisma.measurement.upsert({
    where: { measurement_id: "00000000-0000-0000-0000-000000000221" },
    update: {
      survey_id: completedSurvey.survey_id,
      room_name: "Conference Room A",
      office_name: "Skyline Tower",
      zone_name: "East glazing",
      floor: "14",
      window_id: "CR-A-01",
      width: "82.00",
      height: "64.00",
      sqft: "36.44",
      glass_type: "Low-Iron Clear",
      orientation: "South",
      access_type: "Interior ladder",
      complexity_level_id: standardComplexity.complexity_level_id,
      notes: "Straight runs, clear ceiling access for smart film wiring.",
      sort_order: 1,
    },
    create: {
      measurement_id: "00000000-0000-0000-0000-000000000221",
      survey_id: completedSurvey.survey_id,
      room_name: "Conference Room A",
      office_name: "Skyline Tower",
      zone_name: "East glazing",
      floor: "14",
      window_id: "CR-A-01",
      width: "82.00",
      height: "64.00",
      sqft: "36.44",
      glass_type: "Low-Iron Clear",
      orientation: "South",
      access_type: "Interior ladder",
      complexity_level_id: standardComplexity.complexity_level_id,
      notes: "Straight runs, clear ceiling access for smart film wiring.",
      sort_order: 1,
    },
  });

  await prisma.measurement.upsert({
    where: { measurement_id: "00000000-0000-0000-0000-000000000222" },
    update: {
      survey_id: completedSurvey.survey_id,
      room_name: "Lobby Glass",
      office_name: "Skyline Tower",
      zone_name: "Reception frontage",
      floor: "14",
      window_id: "LB-02",
      width: "120.00",
      height: "96.00",
      sqft: "80.00",
      glass_type: "Tempered",
      orientation: "West",
      access_type: "Scissor lift",
      complexity_level_id: highComplexity.complexity_level_id,
      notes: "High glare after 3pm, lift access required after hours.",
      sort_order: 2,
    },
    create: {
      measurement_id: "00000000-0000-0000-0000-000000000222",
      survey_id: completedSurvey.survey_id,
      room_name: "Lobby Glass",
      office_name: "Skyline Tower",
      zone_name: "Reception frontage",
      floor: "14",
      window_id: "LB-02",
      width: "120.00",
      height: "96.00",
      sqft: "80.00",
      glass_type: "Tempered",
      orientation: "West",
      access_type: "Scissor lift",
      complexity_level_id: highComplexity.complexity_level_id,
      notes: "High glare after 3pm, lift access required after hours.",
      sort_order: 2,
    },
  });

  await prisma.surveyRecommendation.upsert({
    where: { survey_recommendation_id: "00000000-0000-0000-0000-000000000231" },
    update: {
      survey_id: completedSurvey.survey_id,
      measurement_id: "00000000-0000-0000-0000-000000000221",
      service_type_id: smartServiceType.service_type_id,
      film_id: smartFilm.film_id,
      is_primary: true,
      sort_order: 1,
      recommendation_notes: "Primary recommendation for privacy on demand in conference room.",
      electrical_notes: "Power can be dropped from ceiling tray above meeting room wall.",
    },
    create: {
      survey_recommendation_id: "00000000-0000-0000-0000-000000000231",
      survey_id: completedSurvey.survey_id,
      measurement_id: "00000000-0000-0000-0000-000000000221",
      service_type_id: smartServiceType.service_type_id,
      film_id: smartFilm.film_id,
      is_primary: true,
      sort_order: 1,
      recommendation_notes: "Primary recommendation for privacy on demand in conference room.",
      electrical_notes: "Power can be dropped from ceiling tray above meeting room wall.",
    },
  });

  await prisma.surveyRecommendation.upsert({
    where: { survey_recommendation_id: "00000000-0000-0000-0000-000000000232" },
    update: {
      survey_id: completedSurvey.survey_id,
      measurement_id: "00000000-0000-0000-0000-000000000222",
      service_type_id: solarServiceType.service_type_id,
      film_id: solarFilm.film_id,
      is_primary: false,
      sort_order: 2,
      recommendation_notes: "Optional solar film for west-facing lobby frontage to reduce afternoon glare.",
      electrical_notes: null,
    },
    create: {
      survey_recommendation_id: "00000000-0000-0000-0000-000000000232",
      survey_id: completedSurvey.survey_id,
      measurement_id: "00000000-0000-0000-0000-000000000222",
      service_type_id: solarServiceType.service_type_id,
      film_id: solarFilm.film_id,
      is_primary: false,
      sort_order: 2,
      recommendation_notes: "Optional solar film for west-facing lobby frontage to reduce afternoon glare.",
    },
  });

  await prisma.attachmentFile.upsert({
    where: { file_id: "00000000-0000-0000-0000-000000000241" },
    update: {
      deal_id: completedDeal.deal_id,
      lead_id: completedLead.lead_id,
      consultation_id: completedConsultation.consultation_id,
      survey_id: completedSurvey.survey_id,
      measurement_id: "00000000-0000-0000-0000-000000000221",
      uploaded_by: consultant.user_id,
      file_type: "survey",
      original_name: "conference-room-a-overview.jpg",
      storage_provider: "seed",
      storage_bucket: "local-demo",
      storage_key: "surveys/conference-room-a-overview.jpg",
      file_url: "https://files.rolanpro.local/surveys/conference-room-a-overview.jpg",
      mime_type: "image/jpeg",
      size_bytes: BigInt(2450000),
    },
    create: {
      file_id: "00000000-0000-0000-0000-000000000241",
      deal_id: completedDeal.deal_id,
      lead_id: completedLead.lead_id,
      consultation_id: completedConsultation.consultation_id,
      survey_id: completedSurvey.survey_id,
      measurement_id: "00000000-0000-0000-0000-000000000221",
      uploaded_by: consultant.user_id,
      file_type: "survey",
      original_name: "conference-room-a-overview.jpg",
      storage_provider: "seed",
      storage_bucket: "local-demo",
      storage_key: "surveys/conference-room-a-overview.jpg",
      file_url: "https://files.rolanpro.local/surveys/conference-room-a-overview.jpg",
      mime_type: "image/jpeg",
      size_bytes: BigInt(2450000),
    },
  });

  const surveyCompletedActivity = await prisma.activityLog.findFirst({
    where: {
      entity_type: "survey",
      entity_id: completedSurvey.survey_id,
      action_key: "survey.completed",
    },
    select: {
      activity_id: true,
    },
  });

  if (!surveyCompletedActivity) {
    await prisma.activityLog.create({
      data: {
        actor_user_id: consultant.user_id,
        entity_type: "survey",
        entity_id: completedSurvey.survey_id,
        action_key: "survey.completed",
        project_id: null,
        message: "Консультант завершил survey и передал результаты менеджеру.",
        metadata: {
          consultation_id: completedConsultation.consultation_id,
          deal_id: completedDeal.deal_id,
        },
      },
    });
  }

  const managerNotification = await prisma.notification.findFirst({
    where: {
      recipient_user_id: manager.user_id,
      entity_type: "survey",
      entity_id: completedSurvey.survey_id,
      type_key: "survey.completed",
    },
    select: {
      notification_id: true,
    },
  });

  if (!managerNotification) {
    await prisma.notification.create({
      data: {
        recipient_user_id: manager.user_id,
        actor_user_id: consultant.user_id,
        entity_type: "survey",
        entity_id: completedSurvey.survey_id,
        type_key: "survey.completed",
        title: "Survey completed",
        message: "Survey по Skyline Tower завершен. Measurements, film recommendations и photos доступны менеджеру.",
      },
    });
  }
}

function estimateProposalSeedPrice(serviceCode: string, sqft: number, thickness?: string | null) {
  switch (serviceCode) {
    case "SMART_FILM":
      return sqft * 85 + 18;
    case "SOLAR_FILM":
      return sqft * 19 + 7;
    case "SAFETY_FILM": {
      const base = sqft * 24 + 10;
      return thickness?.includes("8") ? base * 1.12 : base;
    }
    case "WASHING":
      return Math.max(150, sqft * 1.5);
    default:
      return Math.max(100, sqft * 12);
  }
}

async function seedDevProposalData() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const [manager, proposalSentStatus, washingService] = await Promise.all([
    prisma.user.findUnique({ where: { email: "manager@rolanpro.local" } }),
    prisma.pipelineStatus.findUnique({ where: { status_code: "PROPOSAL_SENT" } }),
    prisma.serviceType.findUnique({ where: { service_code: "WASHING" } }),
  ]);

  const completedDeal = await prisma.deal.findUnique({
    where: {
      deal_code: "DL-2001",
    },
    include: {
      client: true,
      consultations: {
        where: {
          survey: {
            status: "completed",
          },
        },
        orderBy: {
          scheduled_start_at: "desc",
        },
        include: {
          survey: {
            include: {
              measurements: {
                orderBy: {
                  sort_order: "asc",
                },
              },
              recommendations: {
                orderBy: [{ is_primary: "desc" }, { sort_order: "asc" }],
                include: {
                  measurement: true,
                  service_type: true,
                  film: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const survey = completedDeal?.consultations[0]?.survey;

  if (!manager || !proposalSentStatus || !completedDeal?.client || !survey) {
    return;
  }

  const proposal = await prisma.proposal.upsert({
    where: {
      proposal_code: "PRC-2001",
    },
    update: {
      deal_id: completedDeal.deal_id,
      client_id: completedDeal.client_id!,
      survey_id: survey.survey_id,
      created_by: manager.user_id,
      title: "Skyline Tower Proposal",
      status: "sent",
      currency: "USD",
      client_message:
        "Review the recommended services below, keep the items you want, remove what you do not need, and sign the agreement when ready.",
      notes: "Demo proposal seeded from completed survey.",
      sent_at: new Date("2026-03-22T06:00:00.000Z"),
    },
    create: {
      proposal_code: "PRC-2001",
      deal_id: completedDeal.deal_id,
      client_id: completedDeal.client_id!,
      survey_id: survey.survey_id,
      created_by: manager.user_id,
      title: "Skyline Tower Proposal",
      status: "sent",
      access_token: randomBytes(24).toString("hex"),
      currency: "USD",
      client_message:
        "Review the recommended services below, keep the items you want, remove what you do not need, and sign the agreement when ready.",
      notes: "Demo proposal seeded from completed survey.",
      sent_at: new Date("2026-03-22T06:00:00.000Z"),
    },
  });

  await prisma.proposalItem.deleteMany({
    where: {
      proposal_id: proposal.proposal_id,
    },
  });

  let subtotal = 0;
  let selectedTotal = 0;
  let sortOrder = 1;

  for (const recommendation of survey.recommendations) {
    const sqft = Number(recommendation.measurement?.sqft?.toString() ?? "0");
    const linePrice = estimateProposalSeedPrice(
      recommendation.service_type.service_code,
      sqft || 1,
      recommendation.film?.thickness,
    );

    subtotal += linePrice;
    selectedTotal += linePrice;

    await prisma.proposalItem.create({
      data: {
        proposal_id: proposal.proposal_id,
        measurement_id: recommendation.measurement_id,
        service_type_id: recommendation.service_type_id,
        film_id: recommendation.film_id,
        item_kind: "service",
        room_name: recommendation.measurement?.room_name ?? null,
        zone_name: recommendation.measurement?.zone_name ?? null,
        window_id: recommendation.measurement?.window_id ?? null,
        title_ru: `${recommendation.measurement?.room_name ?? "Room"} · ${recommendation.service_type.name_ru}`,
        title_en: `${recommendation.measurement?.room_name ?? "Room"} · ${recommendation.service_type.name_en}`,
        description_ru: recommendation.film
          ? `${recommendation.film.brand_name_ru} ${recommendation.film.model_name_ru}`
          : recommendation.recommendation_notes,
        description_en: recommendation.film
          ? `${recommendation.film.brand_name_en} ${recommendation.film.model_name_en}`
          : recommendation.recommendation_notes,
        measurement_snapshot: recommendation.measurement
          ? {
              room_name: recommendation.measurement.room_name,
              zone_name: recommendation.measurement.zone_name,
              window_id: recommendation.measurement.window_id,
              sqft,
            }
          : undefined,
        quantity: sqft || 1,
        unit_label: recommendation.service_type.unit_type,
        line_price: linePrice,
        is_optional: false,
        client_selected: true,
        sort_order: sortOrder++,
      },
    });
  }

  if (washingService && survey.measurements[0]) {
    const optionalPrice = estimateProposalSeedPrice(
      washingService.service_code,
      Number(survey.measurements[0].sqft?.toString() ?? "0") || 1,
    );

    subtotal += optionalPrice;

    await prisma.proposalItem.create({
      data: {
        proposal_id: proposal.proposal_id,
        measurement_id: survey.measurements[0].measurement_id,
        service_type_id: washingService.service_type_id,
        item_kind: "addon",
        room_name: survey.measurements[0].room_name,
        zone_name: survey.measurements[0].zone_name,
        window_id: survey.measurements[0].window_id,
        title_ru: `${survey.measurements[0].room_name} · ${washingService.name_ru}`,
        title_en: `${survey.measurements[0].room_name} · ${washingService.name_en}`,
        description_ru: "Опционально: мойка стекла перед монтажом.",
        description_en: "Optional: glass washing before installation.",
        measurement_snapshot: {
          room_name: survey.measurements[0].room_name,
          window_id: survey.measurements[0].window_id,
          sqft: Number(survey.measurements[0].sqft?.toString() ?? "0"),
        },
        quantity: 1,
        unit_label: washingService.unit_type,
        line_price: optionalPrice,
        is_optional: true,
        client_selected: false,
        sort_order: sortOrder++,
      },
    });
  }

  await prisma.proposal.update({
    where: {
      proposal_id: proposal.proposal_id,
    },
    data: {
      subtotal_amount: subtotal,
      selected_total_amount: selectedTotal,
    },
  });

  await prisma.proposalEvent.deleteMany({
    where: {
      proposal_id: proposal.proposal_id,
    },
  });

  await prisma.proposalEvent.createMany({
    data: [
      {
        proposal_id: proposal.proposal_id,
        actor_user_id: manager.user_id,
        actor_type: "manager",
        event_key: "proposal.created",
        message: "Proposal создан из completed survey.",
        metadata: {
          deal_id: completedDeal.deal_id,
          survey_id: survey.survey_id,
        },
      },
      {
        proposal_id: proposal.proposal_id,
        actor_user_id: manager.user_id,
        actor_type: "manager",
        event_key: "proposal.sent",
        message: "Proposal отправлен клиенту для выбора услуг и agreement.",
        metadata: {
          deal_id: completedDeal.deal_id,
        },
      },
    ],
  });

  await prisma.deal.update({
    where: {
      deal_id: completedDeal.deal_id,
    },
    data: {
      pipeline_status_id: proposalSentStatus.pipeline_status_id,
    },
  });
}

async function seedDevProjectData() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const [
    manager,
    leadInstaller,
    helperInstaller,
    helperInstallerTwo,
    skylineDeal,
    beverlyDeal,
    clientSkyline,
    clientBeverly,
    cityLosAngeles,
    cityGlendale,
    projectScheduledStatus,
    projectInProgressStatus,
    paymentDepositPaidStatus,
    paymentFinalPendingStatus,
    positionReadyStatus,
    positionInProgressStatus,
    installEventType,
    installTrack,
    smartServiceType,
    solarServiceType,
    safetyServiceType,
    smartFilm,
    solarFilm,
    safetyFilm,
    ladderComplexity,
    equipmentComplexity,
    alpineComplexity,
    proposalDocumentType,
    agreementDocumentType,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { email: "manager@rolanpro.local" } }),
    prisma.user.findUnique({ where: { email: "installer@rolanpro.local" } }),
    prisma.user.findUnique({ where: { email: "installer2@rolanpro.local" } }),
    prisma.user.findUnique({ where: { email: "installer3@rolanpro.local" } }),
    prisma.deal.findUnique({ where: { deal_code: "DL-2001" } }),
    prisma.deal.findUnique({ where: { deal_code: "DL-1001" } }),
    prisma.client.findUnique({ where: { client_code: "CL-2001" } }),
    prisma.client.findUnique({ where: { client_code: "CL-1001" } }),
    prisma.city.findUnique({ where: { city_code: "LOS_ANGELES" } }),
    prisma.city.findUnique({ where: { city_code: "GLENDALE" } }),
    prisma.projectStatus.findUnique({ where: { status_code: "SCHEDULED" } }),
    prisma.projectStatus.findUnique({ where: { status_code: "IN_PROGRESS" } }),
    prisma.paymentStatus.findUnique({ where: { status_code: "DEPOSIT_PAID" } }),
    prisma.paymentStatus.findUnique({ where: { status_code: "FINAL_PAYMENT_PENDING" } }),
    prisma.positionStatus.findUnique({ where: { status_code: "READY" } }),
    prisma.positionStatus.findUnique({ where: { status_code: "IN_PROGRESS" } }),
    prisma.eventType.findUnique({ where: { event_code: "INSTALL" } }),
    prisma.eventTrack.findUnique({ where: { track_code: "INSTALL" } }),
    prisma.serviceType.findUnique({ where: { service_code: "SMART_FILM" } }),
    prisma.serviceType.findUnique({ where: { service_code: "SOLAR_FILM" } }),
    prisma.serviceType.findUnique({ where: { service_code: "SAFETY_FILM" } }),
    prisma.filmCatalog.findUnique({ where: { model_code: "VISION" } }),
    prisma.filmCatalog.findUnique({ where: { model_code: "PRESTIGE_70" } }),
    prisma.filmCatalog.findUnique({ where: { model_code: "SECURITY_8MIL" } }),
    prisma.complexityLevel.findUnique({ where: { level_code: "STANDARD" } }),
    prisma.complexityLevel.findUnique({ where: { level_code: "HIGH" } }),
    prisma.complexityLevel.findUnique({ where: { level_code: "EXPERT" } }),
    prisma.documentType.findUnique({ where: { document_code: "PROPOSAL" } }),
    prisma.documentType.findUnique({ where: { document_code: "AGREEMENT" } }),
  ]);

  if (
    !manager ||
    !leadInstaller ||
    !helperInstaller ||
    !helperInstallerTwo ||
    !skylineDeal ||
    !beverlyDeal ||
    !clientSkyline ||
    !clientBeverly ||
    !cityLosAngeles ||
    !cityGlendale ||
    !projectScheduledStatus ||
    !projectInProgressStatus ||
    !paymentDepositPaidStatus ||
    !paymentFinalPendingStatus ||
    !positionReadyStatus ||
    !positionInProgressStatus ||
    !installEventType ||
    !installTrack ||
    !smartServiceType ||
    !solarServiceType ||
    !safetyServiceType ||
    !smartFilm ||
    !solarFilm ||
    !safetyFilm ||
    !ladderComplexity ||
    !equipmentComplexity ||
    !alpineComplexity ||
    !proposalDocumentType ||
    !agreementDocumentType
  ) {
    return;
  }

  const serviceAddons = await prisma.serviceAddon.findMany({
    include: {
      service_type: {
        select: {
          service_code: true,
        },
      },
    },
  });

  const addonMap = Object.fromEntries(
    serviceAddons.map((addon) => [`${addon.service_type.service_code}:${addon.addon_code}`, addon]),
  );

  const projectInProgress = await prisma.project.upsert({
    where: { project_code: "PRJ-3001" },
    update: {
      client_id: clientSkyline.client_id,
      deal_id: skylineDeal.deal_id,
      manager_id: manager.user_id,
      lead_installer_id: leadInstaller.user_id,
      project_status_id: projectInProgressStatus.project_status_id,
      payment_status_id: paymentDepositPaidStatus.payment_status_id,
      city_id: cityLosAngeles.city_id,
      title: "Skyline Tower Smart Install",
      address: clientSkyline.service_address,
      zip_code: clientSkyline.zip_code,
      install_date: new Date("2026-03-25T00:00:00.000Z"),
      start_time: new Date("1970-01-01T16:00:00.000Z"),
      end_time: new Date("1970-01-01T22:00:00.000Z"),
      priority: "high",
      problem_flag: false,
      manager_notes: "Lobby access only after 8am. Coordinate with front desk before lift delivery.",
      installer_notes: "Conference room first, then lobby west facade.",
      what_to_bring: "Ladder, smart controllers, sealant, extra electrical kit.",
    },
    create: {
      project_code: "PRJ-3001",
      client_id: clientSkyline.client_id,
      deal_id: skylineDeal.deal_id,
      manager_id: manager.user_id,
      lead_installer_id: leadInstaller.user_id,
      project_status_id: projectInProgressStatus.project_status_id,
      payment_status_id: paymentDepositPaidStatus.payment_status_id,
      city_id: cityLosAngeles.city_id,
      title: "Skyline Tower Smart Install",
      address: clientSkyline.service_address,
      zip_code: clientSkyline.zip_code,
      install_date: new Date("2026-03-25T00:00:00.000Z"),
      start_time: new Date("1970-01-01T16:00:00.000Z"),
      end_time: new Date("1970-01-01T22:00:00.000Z"),
      priority: "high",
      problem_flag: false,
      manager_notes: "Lobby access only after 8am. Coordinate with front desk before lift delivery.",
      installer_notes: "Conference room first, then lobby west facade.",
      what_to_bring: "Ladder, smart controllers, sealant, extra electrical kit.",
    },
  });

  const projectScheduled = await prisma.project.upsert({
    where: { project_code: "PRJ-3002" },
    update: {
      client_id: clientBeverly.client_id,
      deal_id: beverlyDeal.deal_id,
      manager_id: manager.user_id,
      lead_installer_id: helperInstaller.user_id,
      project_status_id: projectScheduledStatus.project_status_id,
      payment_status_id: paymentFinalPendingStatus.payment_status_id,
      city_id: cityGlendale.city_id,
      title: "Beverly Office Safety Upgrade",
      address: clientBeverly.service_address,
      zip_code: clientBeverly.zip_code,
      install_date: new Date("2026-03-28T00:00:00.000Z"),
      start_time: new Date("1970-01-01T18:00:00.000Z"),
      end_time: new Date("1970-01-01T23:00:00.000Z"),
      priority: "normal",
      problem_flag: true,
      manager_notes: "HOA elevator window is narrow. Confirm access one day before install.",
      installer_notes: "Bring anchoring hardware and extra edge seal.",
      what_to_bring: "Lift access kit, anchoring set, edge seal.",
    },
    create: {
      project_code: "PRJ-3002",
      client_id: clientBeverly.client_id,
      deal_id: beverlyDeal.deal_id,
      manager_id: manager.user_id,
      lead_installer_id: helperInstaller.user_id,
      project_status_id: projectScheduledStatus.project_status_id,
      payment_status_id: paymentFinalPendingStatus.payment_status_id,
      city_id: cityGlendale.city_id,
      title: "Beverly Office Safety Upgrade",
      address: clientBeverly.service_address,
      zip_code: clientBeverly.zip_code,
      install_date: new Date("2026-03-28T00:00:00.000Z"),
      start_time: new Date("1970-01-01T18:00:00.000Z"),
      end_time: new Date("1970-01-01T23:00:00.000Z"),
      priority: "normal",
      problem_flag: true,
      manager_notes: "HOA elevator window is narrow. Confirm access one day before install.",
      installer_notes: "Bring anchoring hardware and extra edge seal.",
      what_to_bring: "Lift access kit, anchoring set, edge seal.",
    },
  });

  const crewOne = await prisma.crew.upsert({
    where: { crew_id: "00000000-0000-0000-0000-000000000401" },
    update: {
      name: "Crew 1",
      active: true,
    },
    create: {
      crew_id: "00000000-0000-0000-0000-000000000401",
      name: "Crew 1",
      active: true,
    },
  });

  const crewTwo = await prisma.crew.upsert({
    where: { crew_id: "00000000-0000-0000-0000-000000000402" },
    update: {
      name: "Crew 2",
      active: true,
    },
    create: {
      crew_id: "00000000-0000-0000-0000-000000000402",
      name: "Crew 2",
      active: true,
    },
  });

  const smartPosition = await prisma.projectPosition.upsert({
    where: { position_id: "00000000-0000-0000-0000-000000000301" },
    update: {
      project_id: projectInProgress.project_id,
      service_type_id: smartServiceType.service_type_id,
      film_id: smartFilm.film_id,
      position_status_id: positionInProgressStatus.position_status_id,
      complexity_level_id: ladderComplexity.complexity_level_id,
      title: "Conference Room A Smart Film",
      dynamic_fields: {
        category: "SMART",
        brand: "GAUZY",
        model: "VISION",
        sqft: 120,
        actual_film_sqft: 132,
        complexity_level_id: ladderComplexity.complexity_level_id,
        zones_qty: 4,
        blocks_qty: 2,
        block_type: "STANDARD",
        block_unit_price: 450,
        extra_costs: 185,
      },
      pricing_source: "price_book",
      base_price: "85.00",
      min_price: "72.00",
      actual_price: "90.00",
      notes: "Main privacy-on-demand room. Electrical path already approved above ceiling line.",
      sort_order: 1,
    },
    create: {
      position_id: "00000000-0000-0000-0000-000000000301",
      project_id: projectInProgress.project_id,
      service_type_id: smartServiceType.service_type_id,
      film_id: smartFilm.film_id,
      position_status_id: positionInProgressStatus.position_status_id,
      complexity_level_id: ladderComplexity.complexity_level_id,
      title: "Conference Room A Smart Film",
      dynamic_fields: {
        category: "SMART",
        brand: "GAUZY",
        model: "VISION",
        sqft: 120,
        actual_film_sqft: 132,
        complexity_level_id: ladderComplexity.complexity_level_id,
        zones_qty: 4,
        blocks_qty: 2,
        block_type: "STANDARD",
        block_unit_price: 450,
        extra_costs: 185,
      },
      pricing_source: "price_book",
      base_price: "85.00",
      min_price: "72.00",
      actual_price: "90.00",
      notes: "Main privacy-on-demand room. Electrical path already approved above ceiling line.",
      sort_order: 1,
    },
  });

  const solarPosition = await prisma.projectPosition.upsert({
    where: { position_id: "00000000-0000-0000-0000-000000000302" },
    update: {
      project_id: projectInProgress.project_id,
      service_type_id: solarServiceType.service_type_id,
      film_id: solarFilm.film_id,
      position_status_id: positionReadyStatus.position_status_id,
      complexity_level_id: equipmentComplexity.complexity_level_id,
      title: "Lobby West Solar Film",
      dynamic_fields: {
        category: "SOLAR",
        brand: "3M",
        model: "PRESTIGE_70",
        sqft: 86,
        actual_film_sqft: 94,
        complexity_level_id: equipmentComplexity.complexity_level_id,
        windows_qty: 6,
        extra_costs: 95,
      },
      pricing_source: "manual_override",
      base_price: "19.00",
      min_price: "16.00",
      actual_price: "21.00",
      notes: "Lobby west facade. Requires lift after noon and glare control review.",
      sort_order: 2,
    },
    create: {
      position_id: "00000000-0000-0000-0000-000000000302",
      project_id: projectInProgress.project_id,
      service_type_id: solarServiceType.service_type_id,
      film_id: solarFilm.film_id,
      position_status_id: positionReadyStatus.position_status_id,
      complexity_level_id: equipmentComplexity.complexity_level_id,
      title: "Lobby West Solar Film",
      dynamic_fields: {
        category: "SOLAR",
        brand: "3M",
        model: "PRESTIGE_70",
        sqft: 86,
        actual_film_sqft: 94,
        complexity_level_id: equipmentComplexity.complexity_level_id,
        windows_qty: 6,
        extra_costs: 95,
      },
      pricing_source: "manual_override",
      base_price: "19.00",
      min_price: "16.00",
      actual_price: "21.00",
      notes: "Lobby west facade. Requires lift after noon and glare control review.",
      sort_order: 2,
    },
  });

  const safetyPosition = await prisma.projectPosition.upsert({
    where: { position_id: "00000000-0000-0000-0000-000000000303" },
    update: {
      project_id: projectScheduled.project_id,
      service_type_id: safetyServiceType.service_type_id,
      film_id: safetyFilm.film_id,
      position_status_id: positionReadyStatus.position_status_id,
      complexity_level_id: alpineComplexity.complexity_level_id,
      title: "Beverly Office Safety Film",
      dynamic_fields: {
        category: "SAFETY",
        brand: "LLUMAR",
        model: "SECURITY_8MIL",
        thickness: "8 mil",
        sqft: 140,
        actual_film_sqft: 154,
        complexity_level_id: alpineComplexity.complexity_level_id,
        windows_qty: 12,
        extra_costs: 240,
      },
      pricing_source: "price_book",
      base_price: "24.00",
      min_price: "20.00",
      actual_price: "24.00",
      notes: "Street-facing glazing. Include anchoring and HOA access control.",
      sort_order: 1,
    },
    create: {
      position_id: "00000000-0000-0000-0000-000000000303",
      project_id: projectScheduled.project_id,
      service_type_id: safetyServiceType.service_type_id,
      film_id: safetyFilm.film_id,
      position_status_id: positionReadyStatus.position_status_id,
      complexity_level_id: alpineComplexity.complexity_level_id,
      title: "Beverly Office Safety Film",
      dynamic_fields: {
        category: "SAFETY",
        brand: "LLUMAR",
        model: "SECURITY_8MIL",
        thickness: "8 mil",
        sqft: 140,
        actual_film_sqft: 154,
        complexity_level_id: alpineComplexity.complexity_level_id,
        windows_qty: 12,
        extra_costs: 240,
      },
      pricing_source: "price_book",
      base_price: "24.00",
      min_price: "20.00",
      actual_price: "24.00",
      notes: "Street-facing glazing. Include anchoring and HOA access control.",
      sort_order: 1,
    },
  });

  if (addonMap["SMART_FILM:WASHING"]) {
    await prisma.projectPositionAddon.upsert({
      where: {
        position_id_service_addon_id: {
          position_id: smartPosition.position_id,
          service_addon_id: addonMap["SMART_FILM:WASHING"].service_addon_id,
        },
      },
      update: {
        quantity: "120.00",
        unit_price: "1.50",
        total_price: "180.00",
        notes: "Clean all glass before smart install.",
      },
      create: {
        position_id: smartPosition.position_id,
        service_addon_id: addonMap["SMART_FILM:WASHING"].service_addon_id,
        quantity: "120.00",
        unit_price: "1.50",
        total_price: "180.00",
        notes: "Clean all glass before smart install.",
      },
    });
  }

  if (addonMap["SMART_FILM:EXTRA_ELECTRICAL"]) {
    await prisma.projectPositionAddon.upsert({
      where: {
        position_id_service_addon_id: {
          position_id: smartPosition.position_id,
          service_addon_id: addonMap["SMART_FILM:EXTRA_ELECTRICAL"].service_addon_id,
        },
      },
      update: {
        quantity: "1.00",
        unit_price: "360.00",
        total_price: "360.00",
        notes: "Zone wiring installation to controller area.",
      },
      create: {
        position_id: smartPosition.position_id,
        service_addon_id: addonMap["SMART_FILM:EXTRA_ELECTRICAL"].service_addon_id,
        quantity: "1.00",
        unit_price: "360.00",
        total_price: "360.00",
        notes: "Zone wiring installation to controller area.",
      },
    });
  }

  if (addonMap["SOLAR_FILM:REMOVAL"]) {
    await prisma.projectPositionAddon.upsert({
      where: {
        position_id_service_addon_id: {
          position_id: solarPosition.position_id,
          service_addon_id: addonMap["SOLAR_FILM:REMOVAL"].service_addon_id,
        },
      },
      update: {
        quantity: "86.00",
        unit_price: "2.50",
        total_price: "215.00",
        notes: "Remove old lobby film before new install.",
      },
      create: {
        position_id: solarPosition.position_id,
        service_addon_id: addonMap["SOLAR_FILM:REMOVAL"].service_addon_id,
        quantity: "86.00",
        unit_price: "2.50",
        total_price: "215.00",
        notes: "Remove old lobby film before new install.",
      },
    });
  }

  if (addonMap["SAFETY_FILM:ANCHORING"]) {
    await prisma.projectPositionAddon.upsert({
      where: {
        position_id_service_addon_id: {
          position_id: safetyPosition.position_id,
          service_addon_id: addonMap["SAFETY_FILM:ANCHORING"].service_addon_id,
        },
      },
      update: {
        quantity: "1.00",
        unit_price: "240.00",
        total_price: "240.00",
        notes: "Required anchoring package for exterior code compliance.",
      },
      create: {
        position_id: safetyPosition.position_id,
        service_addon_id: addonMap["SAFETY_FILM:ANCHORING"].service_addon_id,
        quantity: "1.00",
        unit_price: "240.00",
        total_price: "240.00",
        notes: "Required anchoring package for exterior code compliance.",
      },
    });
  }

  await prisma.calendarEvent.upsert({
    where: { calendar_event_id: "00000000-0000-0000-0000-000000000311" },
    update: {
      event_type_id: installEventType.event_type_id,
      event_track_id: installTrack.event_track_id,
      project_id: projectInProgress.project_id,
      assigned_user_id: leadInstaller.user_id,
      title: "Монтаж / Skyline Tower Smart Install",
      starts_at: new Date("2026-03-25T16:00:00.000Z"),
      ends_at: new Date("2026-03-25T22:00:00.000Z"),
      status: "in_progress",
      color_token: "green",
      problem_flag: false,
      metadata: {
        crew: "Crew 1",
        arrival_window: "08:00-09:00",
      },
    },
    create: {
      calendar_event_id: "00000000-0000-0000-0000-000000000311",
      event_type_id: installEventType.event_type_id,
      event_track_id: installTrack.event_track_id,
      project_id: projectInProgress.project_id,
      assigned_user_id: leadInstaller.user_id,
      title: "Монтаж / Skyline Tower Smart Install",
      starts_at: new Date("2026-03-25T16:00:00.000Z"),
      ends_at: new Date("2026-03-25T22:00:00.000Z"),
      status: "in_progress",
      color_token: "green",
      problem_flag: false,
      metadata: {
        crew: "Crew 1",
        arrival_window: "08:00-09:00",
      },
    },
  });

  await prisma.scheduleAssignment.upsert({
    where: { schedule_assignment_id: "00000000-0000-0000-0000-000000000411" },
    update: {
      project_id: projectInProgress.project_id,
      date: new Date("2026-03-25T00:00:00.000Z"),
      start_time: new Date("1970-01-01T16:00:00.000Z"),
      end_time: new Date("1970-01-01T22:00:00.000Z"),
      crew_id: crewOne.crew_id,
    },
    create: {
      schedule_assignment_id: "00000000-0000-0000-0000-000000000411",
      project_id: projectInProgress.project_id,
      date: new Date("2026-03-25T00:00:00.000Z"),
      start_time: new Date("1970-01-01T16:00:00.000Z"),
      end_time: new Date("1970-01-01T22:00:00.000Z"),
      crew_id: crewOne.crew_id,
    },
  });

  await prisma.scheduleAssignment.upsert({
    where: { schedule_assignment_id: "00000000-0000-0000-0000-000000000412" },
    update: {
      project_id: projectScheduled.project_id,
      date: new Date("2026-03-28T00:00:00.000Z"),
      start_time: new Date("1970-01-01T18:00:00.000Z"),
      end_time: new Date("1970-01-01T23:00:00.000Z"),
      crew_id: crewTwo.crew_id,
    },
    create: {
      schedule_assignment_id: "00000000-0000-0000-0000-000000000412",
      project_id: projectScheduled.project_id,
      date: new Date("2026-03-28T00:00:00.000Z"),
      start_time: new Date("1970-01-01T18:00:00.000Z"),
      end_time: new Date("1970-01-01T23:00:00.000Z"),
      crew_id: crewTwo.crew_id,
    },
  });

  await prisma.calendarEvent.upsert({
    where: { calendar_event_id: "00000000-0000-0000-0000-000000000312" },
    update: {
      event_type_id: installEventType.event_type_id,
      event_track_id: installTrack.event_track_id,
      project_id: projectScheduled.project_id,
      assigned_user_id: helperInstaller.user_id,
      title: "Монтаж / Beverly Office Safety Upgrade",
      starts_at: new Date("2026-03-28T18:00:00.000Z"),
      ends_at: new Date("2026-03-28T23:00:00.000Z"),
      status: "scheduled",
      color_token: "green",
      problem_flag: true,
      metadata: {
        crew: "Crew 2",
        arrival_window: "10:00-11:00",
      },
    },
    create: {
      calendar_event_id: "00000000-0000-0000-0000-000000000312",
      event_type_id: installEventType.event_type_id,
      event_track_id: installTrack.event_track_id,
      project_id: projectScheduled.project_id,
      assigned_user_id: helperInstaller.user_id,
      title: "Монтаж / Beverly Office Safety Upgrade",
      starts_at: new Date("2026-03-28T18:00:00.000Z"),
      ends_at: new Date("2026-03-28T23:00:00.000Z"),
      status: "scheduled",
      color_token: "green",
      problem_flag: true,
      metadata: {
        crew: "Crew 2",
        arrival_window: "10:00-11:00",
      },
    },
  });

  await prisma.installerJob.upsert({
    where: { installer_job_id: "00000000-0000-0000-0000-000000000321" },
    update: {
      project_id: projectInProgress.project_id,
      project_position_id: smartPosition.position_id,
      schedule_assignment_id: "00000000-0000-0000-0000-000000000411",
      crew_id: crewOne.crew_id,
      calendar_event_id: "00000000-0000-0000-0000-000000000311",
      installer_id: leadInstaller.user_id,
      status: "started",
      on_the_way_at: new Date("2026-03-25T15:30:00.000Z"),
      started_at: new Date("2026-03-25T16:10:00.000Z"),
      before_photos_required: true,
      after_photos_required: true,
      checklist_completed: false,
      completion_confirmed: false,
      installer_comment: "Conference room completed 40%, electrical rough-in done.",
    },
    create: {
      installer_job_id: "00000000-0000-0000-0000-000000000321",
      project_id: projectInProgress.project_id,
      project_position_id: smartPosition.position_id,
      schedule_assignment_id: "00000000-0000-0000-0000-000000000411",
      crew_id: crewOne.crew_id,
      calendar_event_id: "00000000-0000-0000-0000-000000000311",
      installer_id: leadInstaller.user_id,
      status: "started",
      on_the_way_at: new Date("2026-03-25T15:30:00.000Z"),
      started_at: new Date("2026-03-25T16:10:00.000Z"),
      before_photos_required: true,
      after_photos_required: true,
      checklist_completed: false,
      completion_confirmed: false,
      installer_comment: "Conference room completed 40%, electrical rough-in done.",
    },
  });

  await prisma.installerJob.upsert({
    where: { installer_job_id: "00000000-0000-0000-0000-000000000322" },
    update: {
      project_id: projectInProgress.project_id,
      project_position_id: solarPosition.position_id,
      schedule_assignment_id: "00000000-0000-0000-0000-000000000411",
      crew_id: crewOne.crew_id,
      calendar_event_id: "00000000-0000-0000-0000-000000000311",
      installer_id: helperInstaller.user_id,
      status: "assigned",
      before_photos_required: true,
      after_photos_required: true,
      checklist_completed: false,
      completion_confirmed: false,
      installer_comment: "Waiting for conference room handoff before lobby install.",
    },
    create: {
      installer_job_id: "00000000-0000-0000-0000-000000000322",
      project_id: projectInProgress.project_id,
      project_position_id: solarPosition.position_id,
      schedule_assignment_id: "00000000-0000-0000-0000-000000000411",
      crew_id: crewOne.crew_id,
      calendar_event_id: "00000000-0000-0000-0000-000000000311",
      installer_id: helperInstaller.user_id,
      status: "assigned",
      before_photos_required: true,
      after_photos_required: true,
      checklist_completed: false,
      completion_confirmed: false,
      installer_comment: "Waiting for conference room handoff before lobby install.",
    },
  });

  await prisma.installerJob.upsert({
    where: { installer_job_id: "00000000-0000-0000-0000-000000000323" },
    update: {
      project_id: projectScheduled.project_id,
      project_position_id: safetyPosition.position_id,
      schedule_assignment_id: "00000000-0000-0000-0000-000000000412",
      crew_id: crewTwo.crew_id,
      calendar_event_id: "00000000-0000-0000-0000-000000000312",
      installer_id: helperInstallerTwo.user_id,
      status: "assigned",
      before_photos_required: true,
      after_photos_required: true,
      checklist_completed: false,
      completion_confirmed: false,
      installer_comment: "Awaiting HOA elevator confirmation.",
    },
    create: {
      installer_job_id: "00000000-0000-0000-0000-000000000323",
      project_id: projectScheduled.project_id,
      project_position_id: safetyPosition.position_id,
      schedule_assignment_id: "00000000-0000-0000-0000-000000000412",
      crew_id: crewTwo.crew_id,
      calendar_event_id: "00000000-0000-0000-0000-000000000312",
      installer_id: helperInstallerTwo.user_id,
      status: "assigned",
      before_photos_required: true,
      after_photos_required: true,
      checklist_completed: false,
      completion_confirmed: false,
      installer_comment: "Awaiting HOA elevator confirmation.",
    },
  });

  await prisma.attachmentFile.upsert({
    where: { file_id: "00000000-0000-0000-0000-000000000331" },
    update: {
      project_id: projectInProgress.project_id,
      position_id: smartPosition.position_id,
      installer_job_id: "00000000-0000-0000-0000-000000000321",
      uploaded_by: leadInstaller.user_id,
      file_type: "before_install",
      original_name: "conference-room-before.jpg",
      storage_provider: "seed",
      storage_bucket: "local-demo",
      storage_key: "projects/skyline/conference-room-before.jpg",
      file_url: "https://files.rolanpro.local/projects/skyline/conference-room-before.jpg",
      mime_type: "image/jpeg",
      size_bytes: BigInt(1840000),
    },
    create: {
      file_id: "00000000-0000-0000-0000-000000000331",
      project_id: projectInProgress.project_id,
      position_id: smartPosition.position_id,
      installer_job_id: "00000000-0000-0000-0000-000000000321",
      uploaded_by: leadInstaller.user_id,
      file_type: "before_install",
      original_name: "conference-room-before.jpg",
      storage_provider: "seed",
      storage_bucket: "local-demo",
      storage_key: "projects/skyline/conference-room-before.jpg",
      file_url: "https://files.rolanpro.local/projects/skyline/conference-room-before.jpg",
      mime_type: "image/jpeg",
      size_bytes: BigInt(1840000),
    },
  });

  await prisma.attachmentFile.upsert({
    where: { file_id: "00000000-0000-0000-0000-000000000332" },
    update: {
      project_id: projectInProgress.project_id,
      uploaded_by: manager.user_id,
      file_type: "proposal",
      original_name: "skyline-tower-proposal.pdf",
      storage_provider: "seed",
      storage_bucket: "local-demo",
      storage_key: "projects/skyline/proposal.pdf",
      file_url: "https://files.rolanpro.local/projects/skyline/proposal.pdf",
      mime_type: "application/pdf",
      size_bytes: BigInt(920000),
    },
    create: {
      file_id: "00000000-0000-0000-0000-000000000332",
      project_id: projectInProgress.project_id,
      uploaded_by: manager.user_id,
      file_type: "proposal",
      original_name: "skyline-tower-proposal.pdf",
      storage_provider: "seed",
      storage_bucket: "local-demo",
      storage_key: "projects/skyline/proposal.pdf",
      file_url: "https://files.rolanpro.local/projects/skyline/proposal.pdf",
      mime_type: "application/pdf",
      size_bytes: BigInt(920000),
    },
  });

  await prisma.document.upsert({
    where: { document_id: "00000000-0000-0000-0000-000000000341" },
    update: {
      client_id: clientSkyline.client_id,
      project_id: projectInProgress.project_id,
      document_type_id: proposalDocumentType.document_type_id,
      file_id: "00000000-0000-0000-0000-000000000332",
      title: "Skyline Tower Proposal PDF",
      language_code: "en",
      status: "active",
      created_by: manager.user_id,
    },
    create: {
      document_id: "00000000-0000-0000-0000-000000000341",
      client_id: clientSkyline.client_id,
      project_id: projectInProgress.project_id,
      document_type_id: proposalDocumentType.document_type_id,
      file_id: "00000000-0000-0000-0000-000000000332",
      title: "Skyline Tower Proposal PDF",
      language_code: "en",
      status: "active",
      created_by: manager.user_id,
    },
  });

  await prisma.document.upsert({
    where: { document_id: "00000000-0000-0000-0000-000000000342" },
    update: {
      client_id: clientSkyline.client_id,
      project_id: projectInProgress.project_id,
      document_type_id: agreementDocumentType.document_type_id,
      title: "Skyline Tower Agreement",
      language_code: "en",
      status: "signed",
      created_by: manager.user_id,
    },
    create: {
      document_id: "00000000-0000-0000-0000-000000000342",
      client_id: clientSkyline.client_id,
      project_id: projectInProgress.project_id,
      document_type_id: agreementDocumentType.document_type_id,
      title: "Skyline Tower Agreement",
      language_code: "en",
      status: "signed",
      created_by: manager.user_id,
    },
  });

  const activityItems = [
    {
      activity_id: "00000000-0000-0000-0000-000000000351",
      actor_user_id: manager.user_id,
      action_key: "project.created",
      message: "Проект создан и передан в operations.",
    },
    {
      activity_id: "00000000-0000-0000-0000-000000000352",
      actor_user_id: manager.user_id,
      action_key: "crew.assigned",
      message: "Назначены lead installer и helper installers для Skyline Tower.",
    },
    {
      activity_id: "00000000-0000-0000-0000-000000000353",
      actor_user_id: leadInstaller.user_id,
      action_key: "install.started",
      message: "Монтаж по smart позиции начат в Conference Room A.",
    },
  ] as const;

  for (const activity of activityItems) {
    await prisma.activityLog.upsert({
      where: { activity_id: activity.activity_id },
      update: {
        actor_user_id: activity.actor_user_id,
        entity_type: "project",
        entity_id: projectInProgress.project_id,
        project_id: projectInProgress.project_id,
        action_key: activity.action_key,
        message: activity.message,
      },
      create: {
        activity_id: activity.activity_id,
        actor_user_id: activity.actor_user_id,
        entity_type: "project",
        entity_id: projectInProgress.project_id,
        project_id: projectInProgress.project_id,
        action_key: activity.action_key,
        message: activity.message,
      },
    });
  }

  await prisma.notification.upsert({
    where: { notification_id: "00000000-0000-0000-0000-000000000361" },
    update: {
      recipient_user_id: manager.user_id,
      actor_user_id: leadInstaller.user_id,
      entity_type: "project",
      entity_id: projectInProgress.project_id,
      type_key: "install.progress",
      title: "Монтаж начат",
      message: "Skyline Tower: lead installer начал smart film install.",
      is_read: false,
    },
    create: {
      notification_id: "00000000-0000-0000-0000-000000000361",
      recipient_user_id: manager.user_id,
      actor_user_id: leadInstaller.user_id,
      entity_type: "project",
      entity_id: projectInProgress.project_id,
      type_key: "install.progress",
      title: "Монтаж начат",
      message: "Skyline Tower: lead installer начал smart film install.",
      is_read: false,
    },
  });

  await prisma.notification.upsert({
    where: { notification_id: "00000000-0000-0000-0000-000000000362" },
    update: {
      recipient_user_id: manager.user_id,
      actor_user_id: manager.user_id,
      entity_type: "project",
      entity_id: projectScheduled.project_id,
      type_key: "materials.warning",
      title: "Проблема по проекту",
      message: "Beverly Office: требуется повторно подтвердить access window и anchoring kit.",
      is_read: false,
    },
    create: {
      notification_id: "00000000-0000-0000-0000-000000000362",
      recipient_user_id: manager.user_id,
      actor_user_id: manager.user_id,
      entity_type: "project",
      entity_id: projectScheduled.project_id,
      type_key: "materials.warning",
      title: "Проблема по проекту",
      message: "Beverly Office: требуется повторно подтвердить access window и anchoring kit.",
      is_read: false,
    },
  });

  await prisma.emailAction.upsert({
    where: { email_action_id: "00000000-0000-0000-0000-000000000371" },
    update: {
      entity_type: "project",
      entity_id: projectInProgress.project_id,
      recipient_email: clientSkyline.email ?? "ops@skyline-demo.com",
      subject: "Installation scheduled for Skyline Tower",
      status: "sent",
      created_by: manager.user_id,
      sent_at: new Date("2026-03-24T18:15:00.000Z"),
    },
    create: {
      email_action_id: "00000000-0000-0000-0000-000000000371",
      entity_type: "project",
      entity_id: projectInProgress.project_id,
      recipient_email: clientSkyline.email ?? "ops@skyline-demo.com",
      subject: "Installation scheduled for Skyline Tower",
      status: "sent",
      created_by: manager.user_id,
      sent_at: new Date("2026-03-24T18:15:00.000Z"),
    },
  });
}

async function main() {
  await seedRoles();
  if (process.env.NODE_ENV === "production") {
    await provisionLegacyCrm(
      prisma,
      "data/legacy-crm-empty.json",
      process.env.ROLANPRO_INITIAL_ACCESS_PATH || "/home/runcloud/rolanpro-initial-access.json",
    );
  }
  await seedStatusesAndReferences();
  await seedServiceReferences();
  await seedDevUsers();
  await seedDevSalesData();
  await seedDevConsultationData();
  await seedDevProposalData();
  await seedDevProjectData();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
