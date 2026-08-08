CREATE TABLE "crews" (
  "crew_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(120) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "crews_pkey" PRIMARY KEY ("crew_id")
);

CREATE INDEX "crews_active_idx" ON "crews"("active");

CREATE TABLE "schedule_assignments" (
  "schedule_assignment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "start_time" TIME(6),
  "end_time" TIME(6),
  "crew_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "schedule_assignments_pkey" PRIMARY KEY ("schedule_assignment_id")
);

CREATE INDEX "schedule_assignments_project_id_idx" ON "schedule_assignments"("project_id");
CREATE INDEX "schedule_assignments_date_idx" ON "schedule_assignments"("date");
CREATE INDEX "schedule_assignments_crew_id_idx" ON "schedule_assignments"("crew_id");

ALTER TABLE "schedule_assignments"
  ADD CONSTRAINT "schedule_assignments_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("project_id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "schedule_assignments"
  ADD CONSTRAINT "schedule_assignments_crew_id_fkey"
  FOREIGN KEY ("crew_id") REFERENCES "crews"("crew_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "installer_jobs"
  RENAME COLUMN "position_id" TO "project_position_id";

ALTER TABLE "installer_jobs"
  ADD COLUMN "crew_id" UUID;

CREATE INDEX "installer_jobs_crew_id_idx" ON "installer_jobs"("crew_id");

ALTER TABLE "installer_jobs"
  ADD CONSTRAINT "installer_jobs_crew_id_fkey"
  FOREIGN KEY ("crew_id") REFERENCES "crews"("crew_id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
