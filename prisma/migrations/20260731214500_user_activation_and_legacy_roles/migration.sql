ALTER TABLE "users"
ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "legacy_user_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
