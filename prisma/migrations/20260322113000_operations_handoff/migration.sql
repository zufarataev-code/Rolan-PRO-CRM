ALTER TABLE "projects"
  ADD COLUMN "proposal_id" UUID;

ALTER TABLE "project_positions"
  ADD COLUMN "proposal_item_id" UUID;

CREATE TABLE "deposits" (
  "deposit_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "proposal_id" UUID NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "paid_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "deposits_pkey" PRIMARY KEY ("deposit_id")
);

CREATE UNIQUE INDEX "projects_proposal_id_key" ON "projects"("proposal_id");
CREATE INDEX "projects_proposal_id_idx" ON "projects"("proposal_id");

CREATE UNIQUE INDEX "project_positions_proposal_item_id_key" ON "project_positions"("proposal_item_id");
CREATE INDEX "project_positions_proposal_item_id_idx" ON "project_positions"("proposal_item_id");

CREATE UNIQUE INDEX "deposits_proposal_id_key" ON "deposits"("proposal_id");
CREATE INDEX "deposits_status_idx" ON "deposits"("status");

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_proposal_id_fkey"
  FOREIGN KEY ("proposal_id") REFERENCES "proposals"("proposal_id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "project_positions"
  ADD CONSTRAINT "project_positions_proposal_item_id_fkey"
  FOREIGN KEY ("proposal_item_id") REFERENCES "proposal_items"("proposal_item_id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "deposits"
  ADD CONSTRAINT "deposits_proposal_id_fkey"
  FOREIGN KEY ("proposal_id") REFERENCES "proposals"("proposal_id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
