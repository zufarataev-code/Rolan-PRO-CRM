-- One-time owner account recovery requested on 2026-08-24.
-- The temporary password is high-entropy and must be replaced after sign-in.
DO $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE "users"
  SET
    "password_hash" = 'scrypt$4c409f67d7b179ee1aaa1c672df50c72$3f88953e0e7c37eb611276e6aac3df60f348e32bce006e43026286bcf4861e2c6211574d8244201e1ab2735f94de4849249127b3b1e9a052636bf007bd631826',
    "must_change_password" = TRUE,
    "is_active" = TRUE,
    "updated_at" = NOW()
  WHERE "email" = 'zufarast@gmail.com';

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one owner account, updated %', affected_rows;
  END IF;
END $$;
