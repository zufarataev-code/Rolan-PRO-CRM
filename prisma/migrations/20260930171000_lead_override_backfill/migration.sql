-- Team-lead 10% for installer accruals from 2026-09-01 (owner decision 2026-09-30)
-- that were recorded before the lead snapshot existed. The lead is the
-- installer's current group lead (groups were introduced on 2026-09-30, so no
-- earlier membership exists). Only rows without a lead are touched; no rows
-- are deleted and paid installer amounts are not changed.
UPDATE installer_payroll_accruals AS a
SET lead_id = u.installer_lead_id,
    lead_override_amount = ROUND(a.amount * 0.10, 2),
    lead_override_status = 'owed',
    updated_at = NOW()
FROM users AS u, users AS lead
WHERE u.user_id = a.installer_id
  AND lead.user_id = u.installer_lead_id
  AND lead.is_active = TRUE
  AND lead.user_id <> a.installer_id
  AND EXISTS (
    SELECT 1 FROM user_access ua JOIN roles r ON r.role_id = ua.role_id
    WHERE ua.user_id = lead.user_id AND ua.is_active = TRUE AND r.code = 'INSTALLER_LEAD'
  )
  AND a.lead_id IS NULL
  AND a.accrued_at >= TIMESTAMPTZ '2026-09-01 00:00:00+00';
