import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.join(root, "data", "prices.sqlite");
const schemaPath = path.join(root, "db", "schema.sql");
const productsPath = path.join(root, "data", "products.json");
const storesPath = path.join(root, "data", "stores.json");
const offersPath = process.env.OFFERS_FILE || path.join(root, "data", "sample-offers.json");

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function slug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function slot(date = new Date()) {
  const hour = date.getHours();
  if (hour < 10) return "manana";
  if (hour < 15) return "medio_dia";
  if (hour < 20) return "tarde";
  return "noche";
}

function baseQuantity(size, unit) {
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = String(unit || "").toLowerCase();
  if (u === "g") return n / 1000;
  if (u === "ml") return n / 1000;
  return n;
}

function discountPct(price, reference) {
  if (!price || !reference || reference <= price) return null;
  return Math.round((1 - price / reference) * 1000) / 10;
}

function unitPrice(total, size, unit) {
  const qty = baseQuantity(size, unit);
  if (!qty) return null;
  return Math.round((Number(total) / qty) * 100) / 100;
}

async function openDb() {
  await mkdir(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(await readFile(schemaPath, "utf8"));
  ensureStoreColumns(db);
  ensureSnapshotColumns(db);
  return db;
}

function ensureStoreColumns(db) {
  const columns = new Set(db.prepare("PRAGMA table_info(stores)").all().map((row) => row.name));
  if (!columns.has("kind")) db.exec("ALTER TABLE stores ADD COLUMN kind TEXT NOT NULL DEFAULT 'retailer'");
  if (!columns.has("status")) db.exec("ALTER TABLE stores ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  if (!columns.has("notes")) db.exec("ALTER TABLE stores ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
}

function ensureSnapshotColumns(db) {
  const columns = new Set(db.prepare("PRAGMA table_info(price_snapshots)").all().map((row) => row.name));
  if (!columns.has("dedupe_key")) db.exec("ALTER TABLE price_snapshots ADD COLUMN dedupe_key TEXT NOT NULL DEFAULT ''");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshots_run_dedupe
    ON price_snapshots(run_id, dedupe_key)
    WHERE dedupe_key <> ''
  `);
}

function dedupeKey(offer) {
  if (offer.dedupe_key) return slug(offer.dedupe_key);
  const canonicalUrl = offer.canonical_url || offer.product_url || offer.source_url || "";
  if (canonicalUrl) return slug(canonicalUrl.replace(/[?#].*$/, ""));
  return slug(`${offer.store}:${offer.product_slug}:${offer.title}:${offer.price_mxn}`);
}

function seedCatalog(db, products, stores) {
  const upsertProduct = db.prepare(`
    INSERT INTO products (slug, name, category, stage, compare_unit, min_discount_pct, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      stage = excluded.stage,
      compare_unit = excluded.compare_unit,
      min_discount_pct = excluded.min_discount_pct,
      notes = excluded.notes
  `);
  const insertQuery = db.prepare(`
    INSERT OR IGNORE INTO product_queries (product_slug, query)
    VALUES (?, ?)
  `);
  const upsertStore = db.prepare(`
    INSERT INTO stores (slug, name, kind, status, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      kind = excluded.kind,
      status = excluded.status,
      notes = excluded.notes
  `);

  db.exec("BEGIN");
  try {
    for (const store of stores) {
      upsertStore.run(store.slug, store.name, store.kind || "retailer", store.status || "active", store.notes || "");
    }
    for (const p of products) {
      upsertProduct.run(p.slug, p.name, p.category, p.stage, p.compare_unit, p.min_discount_pct, p.notes || "");
      for (const q of p.queries || []) insertQuery.run(p.slug, q);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function historicalAverage(db, productSlug, capturedAt) {
  const row = db.prepare(`
    SELECT AVG(unit_price_mxn) avg_price
    FROM price_snapshots
    WHERE product_slug = ?
      AND captured_at < ?
      AND unit_price_mxn IS NOT NULL
  `).get(productSlug, capturedAt);
  return row?.avg_price || null;
}

function collect(db, products, offers) {
  const productsBySlug = new Map(products.map((p) => [p.slug, p]));
  const capturedAt = new Date().toISOString();
  const run = db.prepare(`
    INSERT INTO collection_runs (started_at, slot, source)
    VALUES (?, ?, ?)
    RETURNING id
  `).get(capturedAt, slot(), path.basename(offersPath));

  const insertStore = db.prepare(`
    INSERT OR IGNORE INTO stores (slug, name, kind, status)
    VALUES (?, ?, 'retailer', 'active')
  `);
  const insertSnapshot = db.prepare(`
    INSERT INTO price_snapshots (
      run_id, product_slug, store_slug, captured_at, title, source_url, brand,
      presentation, price_mxn, shipping_mxn, total_mxn, unit_price_mxn,
      reference_price_mxn, discount_pct, availability, seller, dedupe_key, raw_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, dedupe_key) WHERE dedupe_key <> '' DO NOTHING
    RETURNING id
  `);
  const insertCandidate = db.prepare(`
    INSERT INTO offer_candidates (snapshot_id, created_at, score, reason)
    VALUES (?, ?, ?, ?)
  `);

  let snapshots = 0;
  let candidates = 0;

  db.exec("BEGIN");
  try {
    for (const offer of offers) {
      const product = productsBySlug.get(offer.product_slug);
      assert(product, `Unknown product_slug: ${offer.product_slug}`);

      const storeSlug = slug(offer.store);
      insertStore.run(storeSlug, offer.store);

      const price = Number(offer.price_mxn);
      const shipping = Number(offer.shipping_mxn || 0);
      const total = Math.round((price + shipping) * 100) / 100;
      const unit = offer.unit_price_mxn ?? unitPrice(total, offer.unit_size, offer.unit);
      const discount = offer.discount_pct ?? discountPct(price, offer.reference_price_mxn);
      const avg = unit ? historicalAverage(db, product.slug, capturedAt) : null;
      const key = dedupeKey(offer);

      const snapshot = insertSnapshot.get(
        run.id,
        product.slug,
        storeSlug,
        capturedAt,
        offer.title || "",
        offer.source_url || "",
        offer.brand || "",
        offer.presentation || "",
        price,
        shipping,
        total,
        unit,
        offer.reference_price_mxn ?? null,
        discount,
        offer.availability || "unknown",
        offer.seller || "",
        key,
        JSON.stringify(offer),
      );
      if (!snapshot) continue;
      snapshots += 1;

      const discountHit = discount !== null && discount >= product.min_discount_pct;
      const historyHit = avg && unit <= avg * 0.92;
      if (offer.availability !== "out_of_stock" && (discountHit || historyHit)) {
        const score = Math.round(((discount || 0) + (historyHit ? 8 : 0)) * 10) / 10;
        const reason = discountHit
          ? `Descuento ${discount}% >= umbral ${product.min_discount_pct}%`
          : `Precio unidad ${unit} bajo vs historial ${avg.toFixed(2)}`;
        insertCandidate.run(snapshot.id, capturedAt, score, reason);
        candidates += 1;
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { runId: run.id, snapshots, candidates };
}

function selfTest() {
  assert.equal(slug("Mercado Libre"), "mercado_libre");
  assert.equal(baseQuantity(500, "g"), 0.5);
  assert.equal(baseQuantity(750, "ml"), 0.75);
  assert.equal(unitPrice(100, 0.5, "kg"), 200);
  assert.equal(unitPrice(75, 500, "g"), 150);
  assert.equal(discountPct(80, 100), 20);
  assert.equal(discountPct(100, 80), null);
  assert.equal(dedupeKey({ source_url: "https://tienda.com/p/1?utm=x", store: "X" }), "https_tienda_com_p_1");
  console.log("ok");
}

async function main() {
  if (process.argv.includes("--self-test")) return selfTest();

  const db = await openDb();
  const products = await readJson(productsPath);
  const stores = await readJson(storesPath);
  seedCatalog(db, products, stores);

  if (process.argv.includes("--init-only")) {
    console.log(`DB lista: ${dbPath}`);
    console.log(`Productos: ${products.length}`);
    console.log(`Tiendas/canales: ${stores.length}`);
    return;
  }

  const offers = await readJson(offersPath);
  const result = collect(db, products, offers);
  console.log(`Run #${result.runId}: ${result.snapshots} snapshots, ${result.candidates} candidatos`);
  console.log(`DB: ${dbPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
