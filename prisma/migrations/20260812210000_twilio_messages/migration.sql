CREATE TABLE "twilio_messages" (
    "message_sid" VARCHAR(64) NOT NULL,
    "direction" VARCHAR(20) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "from_number" VARCHAR(32) NOT NULL,
    "to_number" VARCHAR(32) NOT NULL,
    "body" TEXT NOT NULL,
    "legacy_client_id" VARCHAR(100),
    "legacy_order_id" VARCHAR(100),
    "actor_user_id" UUID,
    "error_code" VARCHAR(20),
    "raw_payload" JSONB,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "twilio_messages_pkey" PRIMARY KEY ("message_sid")
);

CREATE INDEX "twilio_messages_legacy_client_id_idx" ON "twilio_messages"("legacy_client_id");
CREATE INDEX "twilio_messages_legacy_order_id_idx" ON "twilio_messages"("legacy_order_id");
CREATE INDEX "twilio_messages_sent_at_idx" ON "twilio_messages"("sent_at");
ALTER TABLE "twilio_messages" ADD CONSTRAINT "twilio_messages_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
