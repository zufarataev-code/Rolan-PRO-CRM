CREATE TABLE "zadarma_calls" (
  "zadarma_call_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pbx_call_id" VARCHAR(100) NOT NULL,
  "direction" VARCHAR(20) NOT NULL,
  "phone_number" VARCHAR(32) NOT NULL,
  "internal_number" VARCHAR(20),
  "called_did" VARCHAR(32),
  "disposition" VARCHAR(60),
  "duration_seconds" INTEGER NOT NULL DEFAULT 0,
  "is_recorded" BOOLEAN NOT NULL DEFAULT false,
  "recording_id" VARCHAR(120),
  "started_at" TIMESTAMPTZ(6) NOT NULL,
  "answered_at" TIMESTAMPTZ(6),
  "ended_at" TIMESTAMPTZ(6),
  "raw_payload" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "zadarma_calls_pkey" PRIMARY KEY ("zadarma_call_id")
);

CREATE UNIQUE INDEX "zadarma_calls_pbx_call_id_key" ON "zadarma_calls"("pbx_call_id");
CREATE INDEX "zadarma_calls_phone_number_idx" ON "zadarma_calls"("phone_number");
CREATE INDEX "zadarma_calls_internal_number_idx" ON "zadarma_calls"("internal_number");
CREATE INDEX "zadarma_calls_started_at_idx" ON "zadarma_calls"("started_at");
