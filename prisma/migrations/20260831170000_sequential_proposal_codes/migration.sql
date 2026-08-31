-- Commercial proposals use a short immutable public number: PRC-1, PRC-2, ...
-- Existing proposals are numbered chronologically once; their access tokens and
-- public links remain unchanged.
CREATE SEQUENCE IF NOT EXISTS "proposal_code_sequence" AS BIGINT START WITH 1 INCREMENT BY 1;

UPDATE "proposals"
SET "proposal_code" = 'MIG-' || "proposal_id"::text;

WITH numbered AS (
  SELECT
    "proposal_id",
    row_number() OVER (ORDER BY "created_at" ASC, "proposal_id" ASC) AS proposal_number
  FROM "proposals"
)
UPDATE "proposals" AS proposal
SET "proposal_code" = 'PRC-' || numbered.proposal_number::text
FROM numbered
WHERE proposal."proposal_id" = numbered."proposal_id";

SELECT setval(
  'proposal_code_sequence',
  GREATEST((SELECT COUNT(*) FROM "proposals"), 1),
  EXISTS(SELECT 1 FROM "proposals")
);

ALTER TABLE "proposals"
  ALTER COLUMN "proposal_code"
  SET DEFAULT ('PRC-' || nextval('proposal_code_sequence')::text);
