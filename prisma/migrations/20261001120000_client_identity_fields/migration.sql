-- Client identity (Owner, 2026-10-01): B2C first/last name; B2B company,
-- company type, representative and job title. Additive and idempotent:
-- existing rows keep `name`, new columns start empty.
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "first_name" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "last_name" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "customer_type" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "company_name" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "company_type" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "contact_title" VARCHAR(120);

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "first_name" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "last_name" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "company_name" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "company_type" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "contact_title" VARCHAR(120);
