PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  stage TEXT NOT NULL,
  compare_unit TEXT NOT NULL,
  min_discount_pct REAL NOT NULL DEFAULT 8,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS product_queries (
  product_slug TEXT NOT NULL REFERENCES products(slug),
  query TEXT NOT NULL,
  PRIMARY KEY (product_slug, query)
);

CREATE TABLE IF NOT EXISTS stores (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'retailer',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS collection_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  slot TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok'
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES collection_runs(id),
  product_slug TEXT NOT NULL REFERENCES products(slug),
  store_slug TEXT NOT NULL REFERENCES stores(slug),
  captured_at TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT '',
  presentation TEXT NOT NULL DEFAULT '',
  price_mxn REAL NOT NULL,
  shipping_mxn REAL NOT NULL DEFAULT 0,
  total_mxn REAL NOT NULL,
  unit_price_mxn REAL,
  reference_price_mxn REAL,
  discount_pct REAL,
  availability TEXT NOT NULL DEFAULT 'unknown',
  seller TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_snapshots_product_time
ON price_snapshots(product_slug, captured_at);

CREATE INDEX IF NOT EXISTS idx_snapshots_store_time
ON price_snapshots(store_slug, captured_at);

CREATE TABLE IF NOT EXISTS offer_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL REFERENCES price_snapshots(id),
  created_at TEXT NOT NULL,
  score REAL NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
);

CREATE VIEW IF NOT EXISTS latest_prices AS
SELECT ps.*
FROM price_snapshots ps
JOIN (
  SELECT product_slug, store_slug, MAX(captured_at) captured_at
  FROM price_snapshots
  GROUP BY product_slug, store_slug
) latest
ON latest.product_slug = ps.product_slug
AND latest.store_slug = ps.store_slug
AND latest.captured_at = ps.captured_at;

CREATE VIEW IF NOT EXISTS active_offer_candidates AS
SELECT
  oc.id,
  oc.created_at,
  oc.score,
  oc.reason,
  oc.status,
  p.slug product_slug,
  p.name product_name,
  s.name store_name,
  ps.title,
  ps.total_mxn,
  ps.unit_price_mxn,
  ps.discount_pct,
  ps.source_url buy_url
FROM offer_candidates oc
JOIN price_snapshots ps ON ps.id = oc.snapshot_id
JOIN products p ON p.slug = ps.product_slug
JOIN stores s ON s.slug = ps.store_slug
WHERE oc.status IN ('new', 'reviewing');

CREATE TABLE IF NOT EXISTS credit_cards (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  statement_day INTEGER NOT NULL CHECK (statement_day BETWEEN 1 AND 31),
  payment_due_day INTEGER NOT NULL CHECK (payment_due_day BETWEEN 1 AND 31),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  ordered_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  store_slug TEXT NOT NULL REFERENCES stores(slug),
  offer_candidate_id INTEGER REFERENCES offer_candidates(id),
  source_url TEXT NOT NULL DEFAULT '',
  buyer TEXT NOT NULL DEFAULT '',
  credit_card_slug TEXT REFERENCES credit_cards(slug),
  card_charge_date TEXT,
  card_statement_date TEXT,
  card_payment_due_date TEXT,
  subtotal_mxn REAL NOT NULL DEFAULT 0,
  shipping_mxn REAL NOT NULL DEFAULT 0,
  total_mxn REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_card_due
ON purchase_orders(credit_card_slug, card_payment_due_date, status);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
  product_slug TEXT NOT NULL REFERENCES products(slug),
  snapshot_id INTEGER REFERENCES price_snapshots(id),
  title TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  unit_cost_mxn REAL NOT NULL DEFAULT 0,
  subtotal_mxn REAL NOT NULL DEFAULT 0,
  expiration_date TEXT,
  lot_code TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS inventory_lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_item_id INTEGER REFERENCES purchase_order_items(id),
  product_slug TEXT NOT NULL REFERENCES products(slug),
  received_at TEXT NOT NULL,
  expiration_date TEXT,
  initial_qty REAL NOT NULL,
  remaining_qty REAL NOT NULL,
  unit TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'despensa',
  status TEXT NOT NULL DEFAULT 'available',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_inventory_lots_expiration
ON inventory_lots(expiration_date, status);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_id INTEGER NOT NULL REFERENCES inventory_lots(id),
  moved_at TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN ('venta', 'consumo', 'ajuste', 'remate', 'regalo', 'donacion', 'merma')
  ),
  quantity REAL NOT NULL,
  destination TEXT NOT NULL DEFAULT '',
  amount_mxn REAL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_slug TEXT REFERENCES products(slug),
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  offered_qty REAL NOT NULL DEFAULT 0,
  sold_qty REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS demand_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promotion_id INTEGER REFERENCES promotions(id),
  product_slug TEXT NOT NULL REFERENCES products(slug),
  captured_at TEXT NOT NULL,
  requested_qty REAL NOT NULL,
  fulfilled_qty REAL NOT NULL DEFAULT 0,
  lost_qty REAL NOT NULL DEFAULT 0,
  price_mxn REAL,
  channel TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE VIEW IF NOT EXISTS inventory_on_hand AS
SELECT
  p.slug product_slug,
  p.name product_name,
  il.unit,
  SUM(il.remaining_qty) quantity,
  MIN(il.expiration_date) next_expiration_date
FROM inventory_lots il
JOIN products p ON p.slug = il.product_slug
WHERE il.status = 'available'
GROUP BY p.slug, p.name, il.unit;

CREATE VIEW IF NOT EXISTS inventory_attention AS
SELECT
  il.*,
  p.name product_name,
  CASE
    WHEN il.expiration_date IS NOT NULL AND il.expiration_date <= date('now', '+30 days') THEN 'caduca_pronto'
    WHEN il.remaining_qty <= 0 THEN 'agotado'
    ELSE 'ok'
  END attention
FROM inventory_lots il
JOIN products p ON p.slug = il.product_slug
WHERE il.status = 'available'
  AND (
    il.remaining_qty <= 0
    OR (il.expiration_date IS NOT NULL AND il.expiration_date <= date('now', '+30 days'))
  );

CREATE VIEW IF NOT EXISTS card_payment_queue AS
SELECT
  po.id order_id,
  po.status,
  cc.name card_name,
  po.card_charge_date,
  po.card_statement_date,
  po.card_payment_due_date,
  po.total_mxn,
  po.source_url
FROM purchase_orders po
LEFT JOIN credit_cards cc ON cc.slug = po.credit_card_slug
WHERE po.card_payment_due_date IS NOT NULL
ORDER BY po.card_payment_due_date, po.card_statement_date, po.id;
