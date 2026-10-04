-- Pay-after-completion agreed with the client (manager confirmation, 2026-09-30):
-- sale closure and project launch do not require a deposit for such proposals.
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "payment_terms" VARCHAR(30) NOT NULL DEFAULT 'deposit';
