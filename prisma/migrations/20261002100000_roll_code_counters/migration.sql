-- Readable roll codes RP-YYMM-NNNN are reserved here, one atomic increment per
-- roll, so two people receiving rolls at the same time never get the same code.
CREATE TABLE IF NOT EXISTS "roll_code_counters" (
  "period" VARCHAR(4) NOT NULL,
  "last_value" INTEGER NOT NULL,
  CONSTRAINT "roll_code_counters_pkey" PRIMARY KEY ("period")
);
