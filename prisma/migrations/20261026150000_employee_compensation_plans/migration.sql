CREATE TABLE "employee_compensation_plans" (
    "compensation_plan_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "pay_type" VARCHAR(30) NOT NULL DEFAULT 'NONE',
    "monthly_salary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hourly_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commission_percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "fixed_per_job" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_compensation_plans_pkey" PRIMARY KEY ("compensation_plan_id"),
    CONSTRAINT "employee_compensation_plans_pay_type_check" CHECK (
      "pay_type" IN ('NONE', 'SALARY', 'HOURLY', 'COMMISSION', 'PIECEWORK', 'FIXED_PER_JOB')
    ),
    CONSTRAINT "employee_compensation_plans_nonnegative_check" CHECK (
      "monthly_salary" >= 0 AND "hourly_rate" >= 0 AND
      "commission_percent" >= 0 AND "commission_percent" <= 100 AND "fixed_per_job" >= 0
    )
);

CREATE TABLE "employee_piece_rates" (
    "employee_piece_rate_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "compensation_plan_id" UUID NOT NULL,
    "service_type_id" UUID,
    "service_addon_id" UUID,
    "personal_rate" DECIMAL(12,2),
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_piece_rates_pkey" PRIMARY KEY ("employee_piece_rate_id"),
    CONSTRAINT "employee_piece_rates_target_check" CHECK (
      ("service_type_id" IS NOT NULL AND "service_addon_id" IS NULL) OR
      ("service_type_id" IS NULL AND "service_addon_id" IS NOT NULL)
    ),
    CONSTRAINT "employee_piece_rates_personal_rate_check" CHECK (
      "personal_rate" IS NULL OR "personal_rate" >= 0
    )
);

CREATE UNIQUE INDEX "employee_compensation_plans_user_id_key"
  ON "employee_compensation_plans"("user_id");
CREATE INDEX "employee_compensation_plans_pay_type_idx"
  ON "employee_compensation_plans"("pay_type");
CREATE UNIQUE INDEX "employee_piece_rates_compensation_plan_id_service_type_id_key"
  ON "employee_piece_rates"("compensation_plan_id", "service_type_id");
CREATE UNIQUE INDEX "employee_piece_rates_compensation_plan_id_service_addon_id_key"
  ON "employee_piece_rates"("compensation_plan_id", "service_addon_id");
CREATE INDEX "employee_piece_rates_service_type_id_idx"
  ON "employee_piece_rates"("service_type_id");
CREATE INDEX "employee_piece_rates_service_addon_id_idx"
  ON "employee_piece_rates"("service_addon_id");

ALTER TABLE "employee_compensation_plans"
  ADD CONSTRAINT "employee_compensation_plans_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_piece_rates"
  ADD CONSTRAINT "employee_piece_rates_compensation_plan_id_fkey"
  FOREIGN KEY ("compensation_plan_id") REFERENCES "employee_compensation_plans"("compensation_plan_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_piece_rates"
  ADD CONSTRAINT "employee_piece_rates_service_type_id_fkey"
  FOREIGN KEY ("service_type_id") REFERENCES "service_types"("service_type_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_piece_rates"
  ADD CONSTRAINT "employee_piece_rates_service_addon_id_fkey"
  FOREIGN KEY ("service_addon_id") REFERENCES "service_addons"("service_addon_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "installer_payroll_accruals"
  ADD COLUMN "rate_source" VARCHAR(40) NOT NULL DEFAULT 'COMPANY_DEFAULT',
  ADD COLUMN "line_items" JSONB;
