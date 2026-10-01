-- «Создать проект» from a shared-queue lead: the lead is reserved (claimed) while
-- the project is saved and closed (CONTACTED) only afterwards. A claim older
-- than ten minutes is treated as abandoned. Additive and idempotent.
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "claimed_by_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMPTZ(6);
