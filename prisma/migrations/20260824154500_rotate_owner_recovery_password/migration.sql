-- Rotate the one-time owner recovery password before it is handed off.
DO $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE "users"
  SET
    "password_hash" = 'scrypt$fd8f9624888d5fce703ad3e8a36b103e$ff18c336ab2b92e40f1ae1eda5679b4e51a2ba2557122a1583dc981a624e4d4dc0531848a7d62b9bb500a2783f5b57966e1417b0b26f5a20afa99d655221d027',
    "must_change_password" = TRUE,
    "is_active" = TRUE,
    "updated_at" = NOW()
  WHERE "email" = 'zufarast@gmail.com';

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one owner account, updated %', affected_rows;
  END IF;
END $$;
