CREATE TABLE "legacy_workspaces" (
    "workspace_id" VARCHAR(50) NOT NULL DEFAULT 'primary',
    "payload" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_workspaces_pkey" PRIMARY KEY ("workspace_id")
);

CREATE INDEX "legacy_workspaces_updated_by_idx" ON "legacy_workspaces"("updated_by");

ALTER TABLE "legacy_workspaces"
ADD CONSTRAINT "legacy_workspaces_updated_by_fkey"
FOREIGN KEY ("updated_by") REFERENCES "users"("user_id")
ON DELETE SET NULL ON UPDATE CASCADE;
