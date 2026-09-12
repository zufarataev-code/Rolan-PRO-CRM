-- Google Ads conversion adjustments persistence.
-- Stores auditable restatements/retractions and a durable delivery outbox.
-- This migration does not enable any live Google Ads upload.

CREATE TABLE "conversion_adjustments" (
    "conversion_adjustment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversion_event_id" UUID NOT NULL,
    "adjustment_type" VARCHAR(20) NOT NULL,
    "financial_reference_id" VARCHAR(191) NOT NULL,
    "original_transaction_id" VARCHAR(191) NOT NULL,
    "adjusted_value" DECIMAL(14,2),
    "currency" VARCHAR(3),
    "reason" VARCHAR(255),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_adjustments_pkey" PRIMARY KEY ("conversion_adjustment_id")
);

CREATE TABLE "conversion_adjustment_outbox" (
    "conversion_adjustment_outbox_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversion_adjustment_id" UUID NOT NULL,
    "destination_account_id" VARCHAR(64) NOT NULL,
    "action_id" VARCHAR(64) NOT NULL,
    "original_transaction_id" VARCHAR(191) NOT NULL,
    "processing_status" VARCHAR(40) NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "request_id" VARCHAR(191),
    "last_error" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_adjustment_outbox_pkey" PRIMARY KEY ("conversion_adjustment_outbox_id")
);

CREATE UNIQUE INDEX "conversion_adjustments_conversion_event_id_financial_reference_id_adjustment_type_key"
    ON "conversion_adjustments"("conversion_event_id", "financial_reference_id", "adjustment_type");
CREATE INDEX "conversion_adjustments_original_transaction_id_idx"
    ON "conversion_adjustments"("original_transaction_id");

CREATE UNIQUE INDEX "conversion_adjustment_outbox_destination_account_id_action_id_original_transaction_id_conversion_adjustment_id_key"
    ON "conversion_adjustment_outbox"("destination_account_id", "action_id", "original_transaction_id", "conversion_adjustment_id");
CREATE INDEX "conversion_adjustment_outbox_processing_status_next_retry_at_idx"
    ON "conversion_adjustment_outbox"("processing_status", "next_retry_at");
CREATE INDEX "conversion_adjustment_outbox_conversion_adjustment_id_idx"
    ON "conversion_adjustment_outbox"("conversion_adjustment_id");

ALTER TABLE "conversion_adjustments"
    ADD CONSTRAINT "conversion_adjustments_conversion_event_id_fkey"
    FOREIGN KEY ("conversion_event_id") REFERENCES "conversion_events"("conversion_event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conversion_adjustment_outbox"
    ADD CONSTRAINT "conversion_adjustment_outbox_conversion_adjustment_id_fkey"
    FOREIGN KEY ("conversion_adjustment_id") REFERENCES "conversion_adjustments"("conversion_adjustment_id") ON DELETE CASCADE ON UPDATE CASCADE;
