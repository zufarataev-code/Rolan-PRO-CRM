CREATE TABLE "facebook_comments" (
    "facebook_comment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "page_id" VARCHAR(64) NOT NULL,
    "external_comment_id" VARCHAR(191) NOT NULL,
    "post_id" VARCHAR(191) NOT NULL,
    "parent_comment_id" VARCHAR(191),
    "author_id" VARCHAR(191) NOT NULL,
    "author_name" VARCHAR(160) NOT NULL,
    "message" TEXT NOT NULL,
    "intent" VARCHAR(40) NOT NULL DEFAULT 'other',
    "status" VARCHAR(40) NOT NULL DEFAULT 'pending_review',
    "draft_reply" TEXT,
    "published_reply_id" VARCHAR(191),
    "published_reply_text" TEXT,
    "permalink_url" TEXT,
    "assigned_to" UUID,
    "lead_id" UUID,
    "due_at" TIMESTAMPTZ(6),
    "commented_at" TIMESTAMPTZ(6) NOT NULL,
    "replied_at" TIMESTAMPTZ(6),
    "dismissed_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facebook_comments_pkey" PRIMARY KEY ("facebook_comment_id")
);

CREATE UNIQUE INDEX "facebook_comments_page_id_external_comment_id_key"
ON "facebook_comments"("page_id", "external_comment_id");

CREATE INDEX "facebook_comments_status_due_at_idx"
ON "facebook_comments"("status", "due_at");

CREATE INDEX "facebook_comments_assigned_to_status_idx"
ON "facebook_comments"("assigned_to", "status");

CREATE INDEX "facebook_comments_lead_id_idx"
ON "facebook_comments"("lead_id");

ALTER TABLE "facebook_comments"
ADD CONSTRAINT "facebook_comments_assigned_to_fkey"
FOREIGN KEY ("assigned_to") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "facebook_comments"
ADD CONSTRAINT "facebook_comments_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "leads"("lead_id") ON DELETE SET NULL ON UPDATE CASCADE;
