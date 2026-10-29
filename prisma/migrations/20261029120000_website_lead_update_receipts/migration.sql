-- Reuse the existing integration receipt store; no customer records are changed.
CREATE UNIQUE INDEX "activity_log_website_update_event_key"
ON "activity_log" ((metadata ->> 'event_key'))
WHERE action_key = 'integration.website.lead_update';

CREATE UNIQUE INDEX "activity_log_website_update_revision_key"
ON "activity_log" (entity_id, (metadata ->> 'revision'))
WHERE action_key = 'integration.website.lead_update';
