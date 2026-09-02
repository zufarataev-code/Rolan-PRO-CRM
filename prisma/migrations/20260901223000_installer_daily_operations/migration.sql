CREATE TABLE "installer_work_sessions" (
    "work_session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "installer_id" UUID NOT NULL,
    "installer_job_id" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "work_minutes" INTEGER NOT NULL DEFAULT 0,
    "start_odometer_miles" DECIMAL(10,1),
    "end_odometer_miles" DECIMAL(10,1),
    "miles_driven" DECIMAL(10,1) NOT NULL DEFAULT 0,
    "tracking_enabled" BOOLEAN NOT NULL DEFAULT false,
    "tracking_consent_at" TIMESTAMPTZ(6),
    "last_latitude" DECIMAL(10,7),
    "last_longitude" DECIMAL(10,7),
    "last_accuracy_meters" DECIMAL(10,2),
    "last_location_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "installer_work_sessions_pkey" PRIMARY KEY ("work_session_id")
);

CREATE TABLE "installer_location_points" (
    "location_point_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_session_id" UUID NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracy_meters" DECIMAL(10,2),
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "installer_location_points_pkey" PRIMARY KEY ("location_point_id")
);

CREATE TABLE "installer_payroll_accruals" (
    "payroll_accrual_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "installer_id" UUID NOT NULL,
    "installer_job_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "service_name" VARCHAR(160) NOT NULL,
    "quantity_sqft" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "rate_per_sqft" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "complexity_multiplier" DECIMAL(6,2) NOT NULL DEFAULT 1,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'owed',
    "accrued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "installer_payroll_accruals_pkey" PRIMARY KEY ("payroll_accrual_id")
);

CREATE INDEX "installer_work_sessions_installer_id_started_at_idx" ON "installer_work_sessions"("installer_id", "started_at");
CREATE INDEX "installer_work_sessions_installer_job_id_idx" ON "installer_work_sessions"("installer_job_id");
CREATE INDEX "installer_work_sessions_ended_at_idx" ON "installer_work_sessions"("ended_at");
CREATE UNIQUE INDEX "installer_work_sessions_one_active_per_installer_idx" ON "installer_work_sessions"("installer_id") WHERE "ended_at" IS NULL;
CREATE INDEX "installer_location_points_work_session_id_captured_at_idx" ON "installer_location_points"("work_session_id", "captured_at");
CREATE UNIQUE INDEX "installer_payroll_accruals_installer_job_id_key" ON "installer_payroll_accruals"("installer_job_id");
CREATE INDEX "installer_payroll_accruals_installer_id_accrued_at_idx" ON "installer_payroll_accruals"("installer_id", "accrued_at");
CREATE INDEX "installer_payroll_accruals_project_id_idx" ON "installer_payroll_accruals"("project_id");
CREATE INDEX "installer_payroll_accruals_status_idx" ON "installer_payroll_accruals"("status");

ALTER TABLE "installer_work_sessions" ADD CONSTRAINT "installer_work_sessions_installer_id_fkey" FOREIGN KEY ("installer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "installer_work_sessions" ADD CONSTRAINT "installer_work_sessions_installer_job_id_fkey" FOREIGN KEY ("installer_job_id") REFERENCES "installer_jobs"("installer_job_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "installer_location_points" ADD CONSTRAINT "installer_location_points_work_session_id_fkey" FOREIGN KEY ("work_session_id") REFERENCES "installer_work_sessions"("work_session_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "installer_payroll_accruals" ADD CONSTRAINT "installer_payroll_accruals_installer_id_fkey" FOREIGN KEY ("installer_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "installer_payroll_accruals" ADD CONSTRAINT "installer_payroll_accruals_installer_job_id_fkey" FOREIGN KEY ("installer_job_id") REFERENCES "installer_jobs"("installer_job_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "installer_payroll_accruals" ADD CONSTRAINT "installer_payroll_accruals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE CASCADE ON UPDATE CASCADE;
