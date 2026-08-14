-- Temporary manager access requested by the owner. The manager must replace
-- this password immediately after the next successful sign-in.
UPDATE "users"
SET
  "password_hash" = 'scrypt$7c93d340e6d3a038205c689361f28da5$f462f06cfd343b4c63cce0c9b5891da092bb3feb14c65491f00bdf1479166af443caf6294b7748752ee1f67cdbf39b8d7bcb7eb42997ca9db49fa73282f953e8',
  "must_change_password" = TRUE,
  "is_active" = TRUE,
  "updated_at" = NOW()
WHERE "email" = 'info@rolan-pro.com';
