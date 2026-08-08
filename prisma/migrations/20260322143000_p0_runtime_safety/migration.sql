WITH ranked_schedule_assignments AS (
  SELECT
    "schedule_assignment_id",
    ROW_NUMBER() OVER (
      PARTITION BY "project_id"
      ORDER BY "updated_at" DESC, "created_at" DESC, "schedule_assignment_id" DESC
    ) AS row_number
  FROM "schedule_assignments"
)
DELETE FROM "schedule_assignments"
WHERE "schedule_assignment_id" IN (
  SELECT "schedule_assignment_id"
  FROM ranked_schedule_assignments
  WHERE row_number > 1
);

CREATE UNIQUE INDEX "schedule_assignments_project_id_key" ON "schedule_assignments"("project_id");
DROP INDEX IF EXISTS "schedule_assignments_project_id_idx";

ALTER TABLE "installer_jobs"
  ADD COLUMN "schedule_assignment_id" UUID;

UPDATE "installer_jobs" AS jobs
SET "schedule_assignment_id" = assignments."schedule_assignment_id"
FROM "schedule_assignments" AS assignments
WHERE assignments."project_id" = jobs."project_id"
  AND jobs."schedule_assignment_id" IS NULL;

WITH ranked_installer_jobs AS (
  SELECT
    "installer_job_id",
    ROW_NUMBER() OVER (
      PARTITION BY "project_position_id"
      ORDER BY "updated_at" DESC, "created_at" DESC, "installer_job_id" DESC
    ) AS row_number
  FROM "installer_jobs"
  WHERE "project_position_id" IS NOT NULL
)
DELETE FROM "installer_jobs"
WHERE "installer_job_id" IN (
  SELECT "installer_job_id"
  FROM ranked_installer_jobs
  WHERE row_number > 1
);

CREATE UNIQUE INDEX "installer_jobs_project_position_id_key" ON "installer_jobs"("project_position_id");
DROP INDEX IF EXISTS "installer_jobs_project_position_id_idx";
CREATE INDEX "installer_jobs_schedule_assignment_id_idx" ON "installer_jobs"("schedule_assignment_id");

ALTER TABLE "installer_jobs"
  ADD CONSTRAINT "installer_jobs_schedule_assignment_id_fkey"
  FOREIGN KEY ("schedule_assignment_id") REFERENCES "schedule_assignments"("schedule_assignment_id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
