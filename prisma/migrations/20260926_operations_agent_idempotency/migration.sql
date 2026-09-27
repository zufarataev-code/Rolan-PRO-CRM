CREATE UNIQUE INDEX IF NOT EXISTS "activity_log_operations_agent_idempotency_key_key"
ON "activity_log" ((metadata ->> 'idempotency_key'))
WHERE "action_key" = 'operations_agent.request'
  AND (metadata ->> 'idempotency_key') IS NOT NULL;
