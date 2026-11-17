CREATE TABLE "meta_capi_outbox" (
  "meta_capi_outbox_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lead_id" UUID,
  "conversion_event_id" UUID,
  "event_id" VARCHAR(191) NOT NULL,
  "event_name" VARCHAR(60) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  "dataset_id" VARCHAR(64),
  "payload_snapshot" JSONB,
  "processing_status" VARCHAR(40) NOT NULL DEFAULT 'queued',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_token" UUID,
  "lease_expires_at" TIMESTAMPTZ(6),
  "last_error_code" VARCHAR(100),
  "test_event_code_hash" VARCHAR(64),
  "test_accepted_at" TIMESTAMPTZ(6),
  "accepted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "meta_capi_outbox_pkey" PRIMARY KEY ("meta_capi_outbox_id"),
  CONSTRAINT "meta_capi_outbox_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "meta_capi_outbox_conversion_event_id_fkey" FOREIGN KEY ("conversion_event_id") REFERENCES "conversion_events"("conversion_event_id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "meta_capi_outbox_event_id_key" ON "meta_capi_outbox"("event_id");
CREATE INDEX "meta_capi_outbox_processing_status_next_attempt_at_idx" ON "meta_capi_outbox"("processing_status", "next_attempt_at");
CREATE INDEX "meta_capi_outbox_lead_id_idx" ON "meta_capi_outbox"("lead_id");
