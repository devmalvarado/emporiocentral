# Emporio Central Prices

MVP para guardar historial de precios y detectar ofertas de productos no perecederos.

## Uso

```bash
npm run init
npm run collect
npm run scrape:amazon
npm run collect:scraped
```

Por default `npm run collect` lee `data/sample-offers.json`. `npm run scrape:amazon` genera `data/scraped-offers.json` y `public/offers.json`; luego `npm run collect:scraped` lo guarda como historial/candidatos.

Un scraper/API nuevo debe escribir el mismo formato y ejecutar:

```bash
OFFERS_FILE=/ruta/ofertas.json npm run collect
```

La base queda en `data/prices.sqlite`.

## Frecuencia

Para buscar 4 veces al dia:

```cron
0 7,12,17,21 * * * cd "/Users/manuel.alvarado/Documents/ChatGPT/Prices" && npm run scrape:amazon && npm run collect:scraped >> logs/collect.log 2>&1
```

## Productos

El catalogo vive en `data/products.json`.

Grupos:

- Limpieza de ropa y hogar
- Alimentos y enlatados
- Papel e higiene del hogar
- Galletas en promocion
- Adicionales: arroz, pasta, leche UHT

## Tiendas y canales

El catalogo vive en `data/stores.json`.

Fuentes activas o por vigilar:

- Amazon
- Mercado Libre
- TikTok Shop
- Google Shopping
- Walmart
- Bodega Aurrera
- Comercial Mexicana / La Comer
- Soriana
- Chedraui
- Sam's Club
- Costco
- Temu
- AliExpress

`Todos los supermercados` y `Mayoristas` son grupos/filtros de UI, no fuentes scrapeables directas.

`Google Shopping` es agregador: sirve para descubrir ofertas, pero puede repetir resultados de Walmart, Soriana, Mercado Libre, etc. Para eso `price_snapshots` tiene `dedupe_key`; si un scraper conoce la URL canonica, debe mandarla como `canonical_url` o `dedupe_key`.

## Regla MVP de oferta

Se guarda todo snapshot. Se crea candidato si:

- el descuento supera el umbral del producto, o
- el precio unitario cae al menos 8% contra su historial.

## Comprar

El boton **Comprar** debe abrir `active_offer_candidates.buy_url`. Ese campo sale del `source_url` capturado en cada snapshot.

## Inventario y caducidad

Cuando se recibe una compra, se registra como lote en `inventory_lots`:

- `expiration_date` si el producto trae caducidad.
- `initial_qty` y `remaining_qty`.
- `location`, por ejemplo `despensa` o `bodega`.

Las salidas viven en `inventory_movements`. Para remates/regalos se usa:

- `movement_type`: `remate`, `regalo`, `donacion` o `merma`.
- `destination`: cliente, persona, causa o lugar.
- `amount_mxn`: recuperacion, si aplica.

La vista `inventory_attention` lista lo que se esta agotando o caduca en 30 dias.

## Demanda

Las promociones viven en `promotions` y la demanda observada en `demand_events`.

Si una promocion genera mas demanda de la que se puede atender:

- `requested_qty`: cuanto pidieron.
- `fulfilled_qty`: cuanto se pudo surtir.
- `lost_qty`: demanda no atendida.

## Tarjeta de credito

Las tarjetas viven en `credit_cards`. Cada `purchase_orders` guarda:

- `card_charge_date`
- `card_statement_date`
- `card_payment_due_date`

Para calcular corte y pago:

```bash
node scripts/card-dates.js --self-test
```

La vista `card_payment_queue` ordena compras por fecha de pago.

Skipped: contabilidad completa, conciliacion bancaria y facturas formales. Add cuando haya compras reales semanales.
