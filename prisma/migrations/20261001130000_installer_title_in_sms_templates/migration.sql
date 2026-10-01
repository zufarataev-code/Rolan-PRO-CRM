-- Owner decision 2026-10-01 (DECISIONS.md «Installation job titles»): clients
-- never read «монтажник». SMS templates are stored in the CRM workspace, so the
-- code change alone would keep sending «Монтажник принял ваш заказ…».
-- Longer word forms are replaced first; what remains is the base form.
-- Data only, idempotent; the revision bump makes open browsers merge it.
UPDATE "legacy_workspaces" AS w
SET "payload" = jsonb_set(
      w."payload",
      '{settings,sms,templates}',
      (
        SELECT jsonb_object_agg(
          t.key,
          CASE WHEN jsonb_typeof(t.value) = 'string' THEN to_jsonb(
            replace(replace(replace(replace(replace(replace(replace(replace(replace(
            replace(replace(replace(replace(replace(replace(replace(replace(replace(
              t.value #>> '{}',
              'Монтажниками', 'Специалистами по установке'), 'монтажниками', 'специалистами по установке'),
              'Монтажникам', 'Специалистам по установке'), 'монтажникам', 'специалистам по установке'),
              'Монтажников', 'Специалистов по установке'), 'монтажников', 'специалистов по установке'),
              'Монтажником', 'Специалистом по установке'), 'монтажником', 'специалистом по установке'),
              'Монтажники', 'Специалисты по установке'), 'монтажники', 'специалисты по установке'),
              'Монтажнику', 'Специалисту по установке'), 'монтажнику', 'специалисту по установке'),
              'Монтажника', 'Специалиста по установке'), 'монтажника', 'специалиста по установке'),
              'Монтажнике', 'Специалисте по установке'), 'монтажнике', 'специалисте по установке'),
              'Монтажник', 'Специалист по установке'), 'монтажник', 'специалист по установке')
          ) ELSE t.value END
        )
        FROM jsonb_each(w."payload" #> '{settings,sms,templates}') AS t
      )
    ),
    "revision" = w."revision" + 1,
    "updated_at" = now()
WHERE jsonb_typeof(w."payload" #> '{settings,sms,templates}') = 'object'
  AND (w."payload" #> '{settings,sms,templates}')::text ~ '[Мм]онтажник';
