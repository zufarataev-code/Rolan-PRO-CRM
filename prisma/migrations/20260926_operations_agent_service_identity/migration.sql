INSERT INTO "roles" (
  "role_id",
  "code",
  "name_ru",
  "name_en",
  "description_ru",
  "description_en",
  "is_system",
  "is_active",
  "sort_order",
  "created_at",
  "updated_at"
)
VALUES (
  gen_random_uuid(),
  'AI_SERVICE',
  'AI-сервис',
  'AI Service',
  'Внутренняя сервисная роль для проверенных AI-интеграций без браузерного входа.',
  'Internal service role for authenticated AI integrations without browser login.',
  true,
  true,
  900,
  now(),
  now()
)
ON CONFLICT ("code") DO UPDATE
SET
  "name_ru" = EXCLUDED."name_ru",
  "name_en" = EXCLUDED."name_en",
  "description_ru" = EXCLUDED."description_ru",
  "description_en" = EXCLUDED."description_en",
  "is_system" = true,
  "is_active" = true,
  "updated_at" = now();

INSERT INTO "users" (
  "user_id",
  "email",
  "full_name",
  "password_hash",
  "must_change_password",
  "is_active",
  "created_at",
  "updated_at"
)
VALUES (
  gen_random_uuid(),
  'crm-operations-agent@rolanpro.internal',
  'ROLANPRO CRM Operations Agent',
  NULL,
  false,
  true,
  now(),
  now()
)
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "user_access" (
  "user_access_id",
  "user_id",
  "role_id",
  "is_primary",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  u."user_id",
  r."role_id",
  true,
  true,
  now(),
  now()
FROM "users" u
JOIN "roles" r ON r."code" = 'AI_SERVICE'
WHERE u."email" = 'crm-operations-agent@rolanpro.internal'
ON CONFLICT ("user_id", "role_id") DO UPDATE
SET
  "is_primary" = true,
  "is_active" = true,
  "updated_at" = now();
