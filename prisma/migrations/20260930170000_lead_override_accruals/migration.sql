-- Team-lead pay (owner decision 2026-09-30): each installer accrual records
-- the installer's group lead at completion and the lead's 10% on top.
-- Nullable / defaulted columns; existing rows are unchanged.
ALTER TABLE "installer_payroll_accruals" ADD COLUMN IF NOT EXISTS "lead_id" UUID;
ALTER TABLE "installer_payroll_accruals" ADD COLUMN IF NOT EXISTS "lead_override_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "installer_payroll_accruals" ADD COLUMN IF NOT EXISTS "lead_override_status" VARCHAR(30) NOT NULL DEFAULT 'owed';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installer_payroll_accruals_lead_id_fkey') THEN
    ALTER TABLE "installer_payroll_accruals" ADD CONSTRAINT "installer_payroll_accruals_lead_id_fkey"
      FOREIGN KEY ("lead_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "installer_payroll_accruals_lead_id_idx" ON "installer_payroll_accruals"("lead_id");
