-- Installation groups (owner decision 2026-09-30): an installer can report to
-- a team lead (INSTALLER_LEAD role, seeded). Nullable; no existing rows change.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "installer_lead_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_installer_lead_id_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_installer_lead_id_fkey"
      FOREIGN KEY ("installer_lead_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "users_installer_lead_id_idx" ON "users"("installer_lead_id");
