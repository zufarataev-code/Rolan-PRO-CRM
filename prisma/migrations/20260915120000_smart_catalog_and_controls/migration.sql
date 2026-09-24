-- Confirmed Rolan PRO Smart film catalog. Unknown prices/specifications remain NULL.
INSERT INTO film_catalog (
  film_id, category_code, category_name_ru, category_name_en,
  brand_code, brand_name_ru, brand_name_en,
  model_code, model_name_ru, model_name_en, thickness, unit,
  technology_code, appearance_code, application_side, capability_tags,
  requires_review, selection_note_ru, is_active, sort_order, created_at, updated_at
)
VALUES
  (gen_random_uuid(), 'SMART', 'Смарт-плёнка', 'Smart Film', 'ROLANPRO_MS', 'Rolan PRO MS (Mitsubishi)', 'Rolan PRO MS (Mitsubishi)', 'Vision 85', 'Vision', 'Vision', NULL, 'sqft', 'PDLC', 'Rolan PRO MS (Mitsubishi)', 'INTERIOR', '["SWITCHABLE_PRIVACY","CLEAR_OPAQUE"]'::jsonb, FALSE, 'Линейка Rolan PRO MS.', TRUE, 21, NOW(), NOW()),
  (gen_random_uuid(), 'SMART', 'Смарт-плёнка', 'Smart Film', 'ROLANPRO_MS', 'Rolan PRO MS (Mitsubishi)', 'Rolan PRO MS (Mitsubishi)', 'Vision 89', 'Vision', 'Vision', NULL, 'sqft', 'PDLC', 'Rolan PRO MS (Mitsubishi)', 'INTERIOR', '["SWITCHABLE_PRIVACY","CLEAR_OPAQUE"]'::jsonb, FALSE, 'Линейка Rolan PRO MS.', TRUE, 22, NOW(), NOW()),
  (gen_random_uuid(), 'SMART', 'Смарт-плёнка', 'Smart Film', 'ROLANPRO_MS', 'Rolan PRO MS (Mitsubishi)', 'Rolan PRO MS (Mitsubishi)', 'Vision 95', 'Vision', 'Vision', NULL, 'sqft', 'PDLC', 'Rolan PRO MS (Mitsubishi)', 'INTERIOR', '["SWITCHABLE_PRIVACY","CLEAR_OPAQUE"]'::jsonb, FALSE, 'Линейка Rolan PRO MS.', TRUE, 23, NOW(), NOW()),
  (gen_random_uuid(), 'SMART', 'Смарт-плёнка', 'Smart Film', 'ROLANPRO_AR', 'Rolan PRO AR (Arshi · Китай)', 'Rolan PRO AR (Arshi · China)', 'Vision A-85', 'Vision', 'Vision', NULL, 'sqft', 'PDLC', 'Rolan PRO AR (Arshi · Китай)', 'INTERIOR', '["SWITCHABLE_PRIVACY","CLEAR_OPAQUE"]'::jsonb, FALSE, 'Линейка Rolan PRO AR.', TRUE, 24, NOW(), NOW()),
  (gen_random_uuid(), 'SMART', 'Смарт-плёнка', 'Smart Film', 'ROLANPRO_AR', 'Rolan PRO AR (Arshi · Китай)', 'Rolan PRO AR (Arshi · China)', 'Vision B-88', 'Vision', 'Vision', NULL, 'sqft', 'PDLC', 'Rolan PRO AR (Arshi · Китай)', 'INTERIOR', '["SWITCHABLE_PRIVACY","CLEAR_OPAQUE"]'::jsonb, FALSE, 'Линейка Rolan PRO AR.', TRUE, 25, NOW(), NOW()),
  (gen_random_uuid(), 'SMART', 'Смарт-плёнка', 'Smart Film', 'ROLANPRO_AR', 'Rolan PRO AR (Arshi · Китай)', 'Rolan PRO AR (Arshi · China)', 'Vision C-92', 'Vision', 'Vision', NULL, 'sqft', 'PDLC', 'Rolan PRO AR (Arshi · Китай)', 'INTERIOR', '["SWITCHABLE_PRIVACY","CLEAR_OPAQUE"]'::jsonb, FALSE, 'Линейка Rolan PRO AR.', TRUE, 26, NOW(), NOW()),
  (gen_random_uuid(), 'SMART', 'Смарт-плёнка', 'Smart Film', 'ROLANPRO_DEC', 'Rolan PRO', 'Rolan PRO', 'DEC-SMART 1', 'Переменный рисунок / текстура', 'Variable Pattern / Texture', NULL, 'sqft', 'PDLC_DECORATIVE', 'Декоративная Smart', 'INTERIOR', '["SWITCHABLE_PRIVACY","DYNAMIC_PATTERN"]'::jsonb, FALSE, 'Декоративная Smart-плёнка.', TRUE, 27, NOW(), NOW()),
  (gen_random_uuid(), 'SMART', 'Смарт-плёнка', 'Smart Film', 'ROLANPRO_DEC', 'Rolan PRO', 'Rolan PRO', 'DEC-SMART 2', 'Переменный рисунок / текстура', 'Variable Pattern / Texture', NULL, 'sqft', 'PDLC_DECORATIVE', 'Декоративная Smart', 'INTERIOR', '["SWITCHABLE_PRIVACY","DYNAMIC_PATTERN"]'::jsonb, FALSE, 'Декоративная Smart-плёнка.', TRUE, 28, NOW(), NOW()),
  (gen_random_uuid(), 'SMART', 'Смарт-плёнка', 'Smart Film', 'ROLANPRO_DEC', 'Rolan PRO', 'Rolan PRO', 'DEC-SMART 3', 'Переменный рисунок / текстура', 'Variable Pattern / Texture', NULL, 'sqft', 'PDLC_DECORATIVE', 'Декоративная Smart', 'INTERIOR', '["SWITCHABLE_PRIVACY","DYNAMIC_PATTERN"]'::jsonb, FALSE, 'Декоративная Smart-плёнка.', TRUE, 29, NOW(), NOW())
ON CONFLICT (model_code) DO UPDATE SET
  category_code = EXCLUDED.category_code,
  category_name_ru = EXCLUDED.category_name_ru,
  category_name_en = EXCLUDED.category_name_en,
  brand_code = EXCLUDED.brand_code,
  brand_name_ru = EXCLUDED.brand_name_ru,
  brand_name_en = EXCLUDED.brand_name_en,
  model_name_ru = EXCLUDED.model_name_ru,
  model_name_en = EXCLUDED.model_name_en,
  technology_code = EXCLUDED.technology_code,
  appearance_code = EXCLUDED.appearance_code,
  application_side = EXCLUDED.application_side,
  capability_tags = EXCLUDED.capability_tags,
  selection_note_ru = EXCLUDED.selection_note_ru,
  is_active = TRUE,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Smart power supplies and control options are add-ons, not film models.
INSERT INTO service_addons (
  service_addon_id, service_type_id, addon_code, name_ru, name_en, unit_type,
  default_price, min_price, cost_price, is_active, sort_order, created_at, updated_at
)
SELECT gen_random_uuid(), st.service_type_id, item.addon_code, item.name_ru, item.name_en,
       item.unit_type, 0, 0, 0, TRUE, item.sort_order, NOW(), NOW()
FROM service_types st
CROSS JOIN (VALUES
  ('ROLAN_CONTROL_50W', 'Rolan Control 50W', 'Rolan Control 50W', 'qty', 10),
  ('ROLAN_CONTROL_100W', 'Rolan Control 100W', 'Rolan Control 100W', 'qty', 11),
  ('ROLAN_CONTROL_200W', 'Rolan Control 200W', 'Rolan Control 200W', 'qty', 12),
  ('ROLAN_CONTROL_300W', 'Rolan Control 300W', 'Rolan Control 300W', 'qty', 13),
  ('ROLAN_CONTROL_500W', 'Rolan Control 500W', 'Rolan Control 500W', 'qty', 14),
  ('ROLAN_CONTROL_1000W', 'Rolan Control 1000W', 'Rolan Control 1000W', 'qty', 15),
  ('WIFI_CONTROL', 'Wi-Fi управление', 'Wi-Fi Control', 'fixed', 20),
  ('MULTIZONE_CONTROL', 'Мультизонное управление', 'Multi-zone Control', 'fixed', 21),
  ('VOICE_CONTROL', 'Голосовое управление', 'Voice Control', 'fixed', 22),
  ('GOOGLE_HOME', 'Google Home', 'Google Home', 'fixed', 23),
  ('AMAZON_ALEXA', 'Amazon Alexa', 'Amazon Alexa', 'fixed', 24),
  ('APPLE_HOME', 'Apple Home', 'Apple Home', 'fixed', 25),
  ('WALL_SWITCH', 'Настенный выключатель', 'Wall Switch', 'qty', 26)
) AS item(addon_code, name_ru, name_en, unit_type, sort_order)
WHERE st.service_code = 'SMART_FILM'
ON CONFLICT (service_type_id, addon_code) DO UPDATE SET
  name_ru = EXCLUDED.name_ru,
  name_en = EXCLUDED.name_en,
  unit_type = EXCLUDED.unit_type,
  is_active = TRUE,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Measurement fields store the selected supply and ecosystem options.
INSERT INTO service_field_config (
  service_field_config_id, service_type_id, field_key, field_label_ru, field_label_en,
  input_type, data_type, dropdown_source, is_required, default_value,
  sort_order, is_active, created_at, updated_at
)
SELECT gen_random_uuid(), st.service_type_id, item.field_key, item.label_ru, item.label_en,
       item.input_type, item.data_type, item.dropdown_source, FALSE, item.default_value,
       item.sort_order, TRUE, NOW(), NOW()
FROM service_types st
CROSS JOIN (VALUES
  ('block_type', 'Тип блока', 'Block Type', 'select', 'string', 'service_field_config', '{"options":[{"value":"rolan_control_50w","label_ru":"Rolan Control 50W","label_en":"Rolan Control 50W"},{"value":"rolan_control_100w","label_ru":"Rolan Control 100W","label_en":"Rolan Control 100W"},{"value":"rolan_control_200w","label_ru":"Rolan Control 200W","label_en":"Rolan Control 200W"},{"value":"rolan_control_300w","label_ru":"Rolan Control 300W","label_en":"Rolan Control 300W"},{"value":"rolan_control_500w","label_ru":"Rolan Control 500W","label_en":"Rolan Control 500W"},{"value":"rolan_control_1000w","label_ru":"Rolan Control 1000W","label_en":"Rolan Control 1000W"}]}'::jsonb, 9),
  ('wifi_control', 'Wi-Fi управление', 'Wi-Fi Control', 'checkbox', 'boolean', NULL, NULL::jsonb, 18),
  ('multizone_control', 'Мультизонное управление', 'Multi-zone Control', 'checkbox', 'boolean', NULL, NULL::jsonb, 19),
  ('google_home', 'Google Home', 'Google Home', 'checkbox', 'boolean', NULL, NULL::jsonb, 20),
  ('amazon_alexa', 'Amazon Alexa', 'Amazon Alexa', 'checkbox', 'boolean', NULL, NULL::jsonb, 21),
  ('apple_home', 'Apple Home', 'Apple Home', 'checkbox', 'boolean', NULL, NULL::jsonb, 22)
) AS item(field_key, label_ru, label_en, input_type, data_type, dropdown_source, default_value, sort_order)
WHERE st.service_code = 'SMART_FILM'
ON CONFLICT (service_type_id, field_key) DO UPDATE SET
  field_label_ru = EXCLUDED.field_label_ru,
  field_label_en = EXCLUDED.field_label_en,
  input_type = EXCLUDED.input_type,
  data_type = EXCLUDED.data_type,
  dropdown_source = EXCLUDED.dropdown_source,
  default_value = EXCLUDED.default_value,
  sort_order = EXCLUDED.sort_order,
  is_active = TRUE,
  updated_at = NOW();
