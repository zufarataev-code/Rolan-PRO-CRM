INSERT INTO pipeline_statuses (pipeline_status_id, status_code, name_ru, name_en, stage_group, color_token, is_closed, sort_order, is_active, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'CONTACTING', 'Пытаемся связаться', 'Contact Attempted', 'active', 'blue', false, 2, true, NOW(), NOW()),
  (gen_random_uuid(), 'QUALIFIED', 'Квалифицирован', 'Qualified Lead', 'active', 'emerald', false, 3, true, NOW(), NOW()),
  (gen_random_uuid(), 'DISQUALIFIED', 'Не квалифицирован', 'Disqualified Lead', 'lost', 'red', true, 22, true, NOW(), NOW()),
  (gen_random_uuid(), 'SPAM', 'Спам / дубль', 'Spam / Duplicate', 'lost', 'slate', true, 23, true, NOW(), NOW())
ON CONFLICT (status_code) DO NOTHING;
