UPDATE "users"
SET
  "password_hash" = 'scrypt$4795e6a52ad2cec3a472709fd419e2c2$0a1d3215b774e9bcae546412439ca2c129263a5f24ddbd473d02ae2408a83b3d0a342d55117efe1708c7e64eb91060c22b8e71f643f8c35f5356a6eea3282f80',
  "must_change_password" = FALSE,
  "is_active" = TRUE,
  "updated_at" = NOW()
WHERE "email" = 'zufarast@gmail.com';
