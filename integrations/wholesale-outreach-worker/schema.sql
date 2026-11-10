-- D1 schema for rolanpro-wholesale. Apply with:
--   npx wrangler d1 execute rolanpro_wholesale --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS contacts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token         TEXT UNIQUE NOT NULL,           -- opaque id used in links (price-list, unsubscribe)
  company       TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  first_name    TEXT,
  phone         TEXT,
  city          TEXT,
  segment       TEXT,                           -- Auto / Flat / Auto+Flat
  website       TEXT,
  status        TEXT NOT NULL DEFAULT 'new',    -- new | sequence | requested | replied | customer | unsubscribed | bounced | paused
  step          INTEGER NOT NULL DEFAULT 0,     -- 0 none sent, 1..3 = last campaign email sent
  next_send_at  TEXT,                           -- ISO; when the next sequence email is due
  last_event_at TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS contacts_due ON contacts(status, next_send_at);

CREATE TABLE IF NOT EXISTS messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id    INTEGER NOT NULL REFERENCES contacts(id),
  direction     TEXT NOT NULL,                  -- out | in
  kind          TEXT NOT NULL,                  -- campaign1 | campaign2 | campaign3 | pricelist | reply | bot | owner_note
  subject       TEXT,
  body          TEXT,                           -- plain text
  message_id    TEXT,                           -- RFC Message-ID (for threading)
  provider_id   TEXT,                           -- Resend id
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS messages_contact ON messages(contact_id, created_at);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id    INTEGER NOT NULL REFERENCES contacts(id),
  items_json    TEXT NOT NULL,                  -- [{sku, qty, unit_price}]
  rolls         INTEGER NOT NULL,
  tier          TEXT NOT NULL,                  -- retail | wholesale | dealer
  subtotal      REAL NOT NULL,
  fulfillment   TEXT,                           -- pickup | delivery
  stripe_url    TEXT,
  stripe_session TEXT,
  status        TEXT NOT NULL DEFAULT 'quoted', -- quoted | link_sent | paid | cancelled
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS send_log (
  day           TEXT PRIMARY KEY,               -- YYYY-MM-DD (UTC)
  sent          INTEGER NOT NULL DEFAULT 0
);
