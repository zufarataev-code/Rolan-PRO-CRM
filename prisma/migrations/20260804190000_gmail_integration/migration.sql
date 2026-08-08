CREATE TABLE "gmail_connections" (
    "gmail_connection_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_key" VARCHAR(80) NOT NULL DEFAULT 'primary',
    "email_address" VARCHAR(191) NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT NOT NULL,
    "token_expires_at" TIMESTAMPTZ(6),
    "scope" TEXT,
    "history_id" VARCHAR(80),
    "last_synced_at" TIMESTAMPTZ(6),
    "sync_error" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "connected_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gmail_connections_pkey" PRIMARY KEY ("gmail_connection_id")
);

CREATE TABLE "gmail_messages" (
    "gmail_message_id" VARCHAR(120) NOT NULL,
    "gmail_thread_id" VARCHAR(120) NOT NULL,
    "gmail_connection_id" UUID NOT NULL,
    "direction" VARCHAR(20) NOT NULL,
    "sender_email" VARCHAR(191),
    "sender_name" VARCHAR(191),
    "recipient_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cc_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" VARCHAR(500) NOT NULL DEFAULT '',
    "snippet" TEXT NOT NULL DEFAULT '',
    "body_text" TEXT NOT NULL DEFAULT '',
    "label_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_unread" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMPTZ(6) NOT NULL,
    "legacy_client_id" VARCHAR(120),
    "legacy_order_id" VARCHAR(120),
    "raw_headers" JSONB,
    "attachment_meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gmail_messages_pkey" PRIMARY KEY ("gmail_message_id")
);

CREATE UNIQUE INDEX "gmail_connections_connection_key_key" ON "gmail_connections"("connection_key");
CREATE INDEX "gmail_connections_connected_by_idx" ON "gmail_connections"("connected_by");
CREATE INDEX "gmail_messages_gmail_connection_id_sent_at_idx" ON "gmail_messages"("gmail_connection_id", "sent_at");
CREATE INDEX "gmail_messages_gmail_thread_id_idx" ON "gmail_messages"("gmail_thread_id");
CREATE INDEX "gmail_messages_legacy_client_id_idx" ON "gmail_messages"("legacy_client_id");
CREATE INDEX "gmail_messages_legacy_order_id_idx" ON "gmail_messages"("legacy_order_id");
CREATE INDEX "gmail_messages_is_unread_idx" ON "gmail_messages"("is_unread");

ALTER TABLE "gmail_connections" ADD CONSTRAINT "gmail_connections_connected_by_fkey" FOREIGN KEY ("connected_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gmail_messages" ADD CONSTRAINT "gmail_messages_gmail_connection_id_fkey" FOREIGN KEY ("gmail_connection_id") REFERENCES "gmail_connections"("gmail_connection_id") ON DELETE CASCADE ON UPDATE CASCADE;
