import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productsPath = path.join(root, "data", "products.json");
const outputPath = path.join(root, "data", "scraped-offers.json");
const publicOutputPath = path.join(root, "public", "offers.json");
const chromePath = process.env.CHROME_PATH || [
  "/opt/homebrew/bin/chromium",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync);

function fold(text) {
  return String(text || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function parseMoney(text) {
  const value = String(text || "").replace(/[^\d.,]/g, "");
  if (!value) return null;
  const normalized = value.includes(".") && value.includes(",")
    ? value.replace(/,/g, "")
    : value.includes(",") && value.split(",").at(-1).length === 2
      ? value.replace(",", ".")
      : value.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function discountPct(price, reference) {
  if (!price || !reference || reference <= price) return null;
  return Math.round((1 - price / reference) * 1000) / 10;
}

function canonicalAmazonUrl(asin, fallback) {
  return asin ? `https://www.amazon.com.mx/dp/${asin}` : String(fallback || "").replace(/[?#].*$/, "");
}

function unitFromText(text) {
  const match = fold(text).match(/(\d+(?:[.,]\d+)?)\s*(kg|kilo|g|gr|gramos|l|lt|litro|ml|rollos?|piezas?|pzas?|pz)\b/);
  if (!match) return {};
  const unitMap = {
    kilo: "kg",
    gr: "g",
    gramos: "g",
    lt: "l",
    litro: "l",
    rollo: "pieza",
    rollos: "pieza",
    piezas: "pieza",
    pzas: "pieza",
    pz: "pieza",
  };
  return { unit_size: Number(match[1].replace(",", ".")), unit: unitMap[match[2]] || match[2] };
}

function productRule(product) {
  const rules = {
    azucar: { include: ["azucar"], reject: ["endulzante", "splenda", "svetia", "stevia"] },
    leche_uht: { include: ["leche"], reject: ["polvo", "formula"] },
    papel_higienico: { include: ["papel", "higienico"] },
    detergente_ropa: { include: ["detergente"] },
    frijoles_enlatados: { include: ["frijol"] },
    bolsas_basura: { include: ["bolsas", "basura"] },
  };
  return rules[product.slug] || { include: [fold(product.name).split(/\s+/)[0]] };
}

function matchesProduct(item, product) {
  const title = fold(item.title);
  const rule = productRule(product);
  return rule.include.every((term) => title.includes(fold(term)))
    && !(rule.reject || []).some((term) => title.includes(fold(term)));
}

function dealDiscount(text) {
  const match = fold(text).match(/(?:-|ahorra\s*)?(\d{1,2})\s*%/);
  return match ? Number(match[1]) : null;
}

async function scrapeOne(page, product) {
  const query = product.queries?.[0] || product.name;
  const searchUrl = new URL("https://www.amazon.com.mx/s");
  searchUrl.searchParams.set("i", "grocery");
  searchUrl.searchParams.set("k", query);

  await page.goto(searchUrl.toString(), { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(Number(process.env.SCRAPE_WAIT_MS || 1500));

  const blocked = await page.getByText(/captcha|robot check|introduce los caracteres/i).count();
  if (blocked) return { status: "blocked", product, query, source_url: searchUrl.href };

  const cards = await page.$$eval(
    'div[data-component-type="s-search-result"][data-asin]',
    (items) => items.slice(0, 10).map((card) => {
      const text = (selector) => card.querySelector(selector)?.textContent?.trim() || "";
      const texts = (selector) => [...card.querySelectorAll(selector)].map((el) => el.textContent?.trim()).filter(Boolean);
      return {
        asin: card.getAttribute("data-asin") || "",
        title: text("h2 span"),
        priceText: text(".a-price .a-offscreen"),
        listPriceTexts: texts(".a-price.a-text-price .a-offscreen"),
        badge: texts(".a-badge-text, .s-coupon-unclipped, .a-color-price, .a-size-base.a-color-secondary").join(" | "),
        source_url: card.querySelector("h2 a, a.a-link-normal.s-no-outline")?.href || "",
      };
    }),
  );

  const priced = cards
    .filter((item) => matchesProduct(item, product))
    .flatMap((item) => {
      const price = parseMoney(item.priceText);
      if (!price) return [];
      const reference = item.listPriceTexts.map(parseMoney).find((n) => n && n > price) || null;
      const discount = discountPct(price, reference) || dealDiscount(item.badge);
      return [{
        product_slug: product.slug,
        store: "Amazon",
        title: item.title,
        presentation: product.name,
        price_mxn: price,
        shipping_mxn: 0,
        reference_price_mxn: reference,
        discount_pct: discount,
        availability: "in_stock",
        source_url: item.source_url || searchUrl.href,
        canonical_url: canonicalAmazonUrl(item.asin, item.source_url || searchUrl.href),
        dedupe_key: item.asin || item.source_url,
        raw: { asin: item.asin, query, badge: item.badge },
        ...unitFromText(item.title),
      }];
    });

  return priced.sort((a, b) => (b.discount_pct || 0) - (a.discount_pct || 0) || a.price_mxn - b.price_mxn)[0]
    || { status: cards.length ? "no_match" : "no_results", product, query, source_url: searchUrl.href };
}

async function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  if (!chromePath) throw new Error("No encontre Chromium. Define CHROME_PATH=/ruta/al/chrome");

  const products = JSON.parse(await readFile(productsPath, "utf8"))
    .filter((product) => product.stage === "prioridad");
  const limit = Number(process.env.SCRAPE_LIMIT || 0);
  const targets = limit ? products.slice(0, limit) : products;

  await mkdir(path.join(root, ".chromium-home"), { recursive: true });
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: process.env.HEADLESS !== "0",
    env: { ...process.env, HOME: path.join(root, ".chromium-home") },
    args: ["--disable-crash-reporter", "--disable-crashpad"],
  });
  const page = await (await browser.newContext({
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { "accept-language": "es-MX,es;q=0.9" },
  })).newPage();

  const offers = [];
  try {
    for (const product of targets) {
      const result = await scrapeOne(page, product);
      if (result.product_slug) offers.push(result);
      console.log(`${(result.product_slug ? "ok" : result.status).padEnd(10)} ${product.name}: ${result.price_mxn ?? ""}${result.discount_pct ? ` (-${result.discount_pct}%)` : ""}`);
    }
  } finally {
    await browser.close();
  }

  await writeFile(outputPath, `${JSON.stringify(offers, null, 2)}\n`);
  await writeFile(publicOutputPath, `${JSON.stringify(offers, null, 2)}\n`);
  console.log(`Ofertas reales: ${offers.length}`);
  console.log(`Archivo: ${outputPath}`);
}

function selfTest() {
  assert.equal(parseMoney("$1,234.50"), 1234.5);
  assert.equal(parseMoney("$123,45"), 123.45);
  assert.equal(discountPct(80, 100), 20);
  assert.equal(unitFromText("Papel higienico 12 rollos").unit_size, 12);
  assert.equal(matchesProduct({ title: "Azucar Zulka Morena 1 kg" }, { slug: "azucar", name: "Azucar" }), true);
  assert.equal(matchesProduct({ title: "Svetia endulzante 1 kg" }, { slug: "azucar", name: "Azucar" }), false);
  console.log("ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
