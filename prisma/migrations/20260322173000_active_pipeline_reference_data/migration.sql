INSERT INTO pipeline_statuses (
  status_code,
  name_ru,
  name_en,
  stage_group,
  color_token,
  is_closed,
  sort_order,
  is_active,
  updated_at
)
VALUES (
  'APPROVED',
  'Proposal approved',
  'Proposal Approved',
  'active',
  'emerald',
  false,
  8,
  true,
  NOW()
)
ON CONFLICT (status_code) DO UPDATE
SET
  name_ru = EXCLUDED.name_ru,
  name_en = EXCLUDED.name_en,
  stage_group = EXCLUDED.stage_group,
  color_token = EXCLUDED.color_token,
  is_closed = EXCLUDED.is_closed,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

UPDATE pipeline_statuses
SET sort_order = CASE status_code
  WHEN 'PROPOSAL_UPDATED_BY_CLIENT' THEN 9
  WHEN 'AGREEMENT_SIGNED' THEN 10
  WHEN 'DEPOSIT_PENDING' THEN 11
  WHEN 'DEPOSIT_PAID' THEN 12
  WHEN 'PROJECT_CREATED' THEN 13
  WHEN 'SCHEDULED' THEN 14
  WHEN 'IN_PROGRESS' THEN 15
  WHEN 'COMPLETED' THEN 16
  WHEN 'FINAL_PAYMENT_PENDING' THEN 17
  WHEN 'PAID' THEN 18
  WHEN 'CLOSED_WON' THEN 19
  WHEN 'CLOSED_LOST' THEN 20
  WHEN 'WARRANTY_SERVICE' THEN 21
  ELSE sort_order
END
WHERE status_code IN (
  'PROPOSAL_UPDATED_BY_CLIENT',
  'AGREEMENT_SIGNED',
  'DEPOSIT_PENDING',
  'DEPOSIT_PAID',
  'PROJECT_CREATED',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'FINAL_PAYMENT_PENDING',
  'PAID',
  'CLOSED_WON',
  'CLOSED_LOST',
  'WARRANTY_SERVICE'
);
