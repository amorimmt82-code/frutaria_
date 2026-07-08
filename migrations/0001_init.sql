-- Frutaria em Casa — schema inicial Cloudflare D1
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL,
  image TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  customer_postal_code TEXT NOT NULL,
  items_json TEXT NOT NULL,
  subtotal REAL NOT NULL,
  total REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  order_status TEXT NOT NULL,
  payment_reference TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  method TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  external_reference TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- Singleton (apenas 1 linha permitida).
CREATE TABLE IF NOT EXISTS payment_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  stripe_enabled INTEGER NOT NULL DEFAULT 0,
  mbway_enabled INTEGER NOT NULL DEFAULT 1,
  transfer_enabled INTEGER NOT NULL DEFAULT 1,
  cash_enabled INTEGER NOT NULL DEFAULT 1,
  mbway_number TEXT NOT NULL DEFAULT '',
  transfer_recipient TEXT NOT NULL DEFAULT '',
  transfer_iban TEXT NOT NULL DEFAULT '',
  transfer_bank TEXT NOT NULL DEFAULT '',
  transfer_instructions TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

-- Valores por defeito (idempotente).
INSERT OR IGNORE INTO payment_settings (
  id, stripe_enabled, mbway_enabled, transfer_enabled, cash_enabled,
  mbway_number, transfer_recipient, transfer_iban, transfer_bank,
  transfer_instructions, updated_at
) VALUES (
  1, 1, 1, 1, 1,
  '+351 919 881 410',
  'Frutaria em Casa',
  'PT50 0033 0000 4578 6278 628 05',
  'Banco Local',
  'Envie o comprovativo por WhatsApp ou confirme connosco após a transferência.',
  CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_order_sequence INTEGER NOT NULL DEFAULT 1000
);

INSERT OR IGNORE INTO stats (id, last_order_sequence) VALUES (1, 1000);
