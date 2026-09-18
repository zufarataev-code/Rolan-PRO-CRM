ALTER TABLE "leads"
  ADD COLUMN "external_source" VARCHAR(60),
  ADD COLUMN "external_submission_id" VARCHAR(191);

CREATE UNIQUE INDEX "leads_external_source_external_submission_id_key"
  ON "leads"("external_source", "external_submission_id");
