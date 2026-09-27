const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const tabs = [
  ["radar", "Radar", "M3 12a9 9 0 1 1 18 0 9 9 0 0 1-18 0Zm9 0 4-4m-4 4 3 6"],
  ["lista", "Lista", "M5 7h14M5 12h14M5 17h14"],
  ["aprobar", "Aprobar", "M20 6 9 17l-5-5"],
  ["inventario", "Inventario", "M21 16V8l-9-5-9 5v8l9 5 9-5Z"],
  ["historial", "Historial", "M12 8v5l3 2M3 12a9 9 0 1 0 3-6.7"],
];

const seed = {
  offers: [
    offer("detergente", "Detergente liquido", "Limpieza profunda 3 L", "Chedraui", 78, 26, 18, "in stock", "https://www.chedraui.com.mx", "D"),
    offer("atun", "Atun en agua", "Lata 140 g", "Walmart", 20.5, 146.43, 7, "in stock", "https://www.walmart.com.mx", "A"),
    offer("papel", "Papel higienico", "12 rollos", "Soriana", 89, 7.42, 11, "in stock", "https://www.soriana.com", "P"),
    offer("arroz", "Arroz", "1 kg", "Walmart", 22.9, 22.9, 12, "in stock", "https://www.walmart.com.mx", "R"),
    offer("cafe", "Cafe soluble", "100 g", "Amazon", 88, 880, 12, "in stock", "https://www.amazon.com.mx", "C"),
  ],
  list: [
    item("arroz", 5, "kg", "Precio bajo"),
    item("atun", 6, "pzas", "Precio bajo"),
    item("detergente", 2, "pzas", "Oferta vence hoy"),
  ],
  approvals: [
    { id: "compra-semanal", title: "Compra semanal no perecederos", total: 1245.3, saving: 180.5, products: 12, stores: 4, manuel: "Pendiente", socio: "Pendiente", risk: "Media" },
    { id: "reposicion", title: "Reposicion arroz/frijol", total: 892.4, saving: 210.3, products: 8, stores: 3, manuel: "Aprobado", socio: "Pendiente", risk: "Alta" },
  ],
  inventory: [
    inv("atun", "Atun", "140 g", 4, 8, "12 dias", "2026-11-30", "Caduca pronto", "A"),
    inv("cafe", "Cafe soluble", "100 g", 3, 6, "15 dias", "2025-12-18", "Suficiente", "C"),
    inv("arroz", "Arroz", "1 kg", 12, 10, "36 dias", "2026-01-12", "Suficiente", "R"),
    inv("galletas", "Galletas Marias", "170 g", 8, 12, "21 dias", "2025-05-05", "Caduca pronto", "G"),
  ],
  movements: [
    ["Entrada", "Arroz", "+10", "Compra #1842"],
    ["Remate", "Cafe soluble", "-3", "Recuperacion"],
    ["Regalo", "Galletas Marias", "-5", "Donacion"],
  ],
  history: [
    { title: "Compra semanal no perecederos", date: "14 abr 2025", total: 286.4, saving: 72.3, status: "Recibida", due: "5 nov", products: ["Arroz 1 kg", "Frijol 1 kg", "Aceite 900 ml", "Cafe soluble 100 g"] },
    { title: "Oferta cafe y leche", date: "10 abr 2025", total: 522, saving: 156.8, status: "Conciliada", due: "5 nov", products: ["Cafe soluble", "Leche UHT"] },
  ],
};

function offer(id, name, presentation, store, price, unit, discount, stock, url, icon) {
  return { id, name, presentation, store, price, unit, discount, stock, url, icon };
}

function item(id, qty, unit, reason) {
  return { id, qty, unit, reason, checked: true };
}

function inv(id, name, presentation, qty, min, coverage, expires, status, icon) {
  return { id, name, presentation, qty, min, coverage, expires, status, icon };
}

const state = load();

function load() {
  const saved = localStorage.getItem("emporio-state");
  return saved ? JSON.parse(saved) : structuredClone(seed);
}

function save() {
  localStorage.setItem("emporio-state", JSON.stringify(state));
}

function currentTab() {
  return location.hash.replace("#", "") || "radar";
}

function setTab(tab) {
  location.hash = tab;
}

function icon(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
}

function logo() {
  return `<svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="none"/><path d="M9 43h9c0-19 15-34 34-34V0C28 0 9 19 9 43Z" fill="#ff6a1a"/><path d="M9 30h9c0-12 10-22 22-22V0C23 0 9 13 9 30Z" fill="#ff6a1a"/><rect x="42" y="42" width="12" height="12" rx="2" fill="#ff6a1a"/></svg>`;
}

function shell(title, subtitle, body) {
  return `
    <section class="top">
      <div class="top-row">
        <div class="brand">${logo()}<span>Emporio<br>Central</span></div>
        <div class="avatar">MA</div>
      </div>
      <h1 class="title">${title}</h1>
      <p class="subtitle">${subtitle}</p>
    </section>
    <section class="content">${body}</section>
    ${nav()}
  `;
}

function nav() {
  const active = currentTab();
  return `<nav class="bottom-nav" aria-label="Principal">${tabs.map(([id, label, path]) => `
    <button class="nav-btn ${active === id ? "active" : ""}" data-tab="${id}">
      ${icon(path)}<span>${label}</span>
    </button>`).join("")}</nav>`;
}

function metrics(rows) {
  return `<div class="grid">${rows.map(([label, value, hint]) => `
    <article class="card metric"><span>${label}</span><b>${value}</b><span>${hint || ""}</span></article>
  `).join("")}</div>`;
}

function radar() {
  return shell("Radar", "Encuentra oportunidades para tu negocio.", `
    <label class="search">${icon("M21 21l-4.3-4.3M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z")}<input id="search" placeholder="Buscar productos, marcas o categorias"></label>
    <div class="chips"><button class="chip active">Solo descuento</button><button class="chip">Amazon</button><button class="chip">Walmart</button><button class="chip">Google Shopping</button></div>
    ${metrics([["Ahorro estimado", money.format(1842.5), "vs. precio promedio"], ["Oportunidades", "7", "con descuento >= 5%"]])}
    <div class="section-title"><h2>Ofertas</h2><span class="muted">Hace 25 min</span></div>
    ${state.offers.map(offerCard).join("")}
  `);
}

function offerCard(o, i) {
  const expanded = i === 0;
  return `<article class="card offer">
    <div class="thumb">${o.icon}</div>
    <div>
      <div class="item-head"><h3>${o.name}</h3><span class="badge">-${o.discount}%</span></div>
      <div class="muted">${o.presentation} · Mejor precio: ${o.store}</div>
      <div class="price">${money.format(o.price)}</div>
      <div class="muted">${money.format(o.unit)} / unidad · ${o.stock}</div>
      ${expanded ? `<svg class="spark" viewBox="0 0 260 54"><polyline fill="none" stroke="#0b8f55" stroke-width="4" points="0,8 40,18 82,25 124,34 166,30 210,40 260,35"/><path d="M0 8 40 18 82 25 124 34 166 30 210 40 260 35v18H0Z" fill="#dff5e8"/></svg>` : ""}
      <div class="actions"><button class="btn primary" data-buy="${o.url}">Comprar</button><button class="btn" data-add="${o.id}">Agregar</button></div>
    </div>
  </article>`;
}

function lista() {
  const rows = state.list.map((line) => {
    const o = state.offers.find((x) => x.id === line.id);
    return { ...line, offer: o };
  }).filter((line) => line.offer);
  const total = rows.reduce((sum, r) => sum + r.qty * r.offer.price, 0);
  return shell("Lista sugerida", "Compra recomendada sin sobreinventario.", `
    ${metrics([["Total", money.format(total), "estimado"], ["Productos", String(rows.length), "en tu lista"]])}
    <button class="btn orange" style="width:100%;margin:8px 0 16px" data-send-approval>Enviar a aprobacion</button>
    <div class="section-title"><h2>Productos sugeridos</h2><span class="muted">Mejor ahorro</span></div>
    ${rows.map((r) => listCard(r.offer, r)).join("") || `<div class="card empty">Agrega ofertas desde Radar.</div>`}
    <article class="card"><h3>Riesgos antes de comprar</h3><div class="list-line"><span>Envio alto</span><span class="badge bad">revisar</span></div><div class="list-line"><span>Caducidad no confirmada</span><span class="badge warn">2 productos</span></div></article>
  `);
}

function listCard(o, r) {
  return `<article class="card row-card">
    <div class="thumb">${o.icon}</div>
    <div>
      <div class="item-head"><h3>${o.name}</h3><span class="price">${money.format(o.price)}</span></div>
      <div class="muted">${o.store} · ${o.presentation}</div>
      <div class="item-head" style="margin-top:10px">
        <span class="stepper"><button data-qty="${r.id}" data-delta="-1">-</button><span>${r.qty}</span><button data-qty="${r.id}" data-delta="1">+</button></span>
        <span class="badge">${r.reason}</span>
      </div>
    </div>
  </article>`;
}

function aprobar() {
  return shell("Aprobar", "Pendientes de ambos usuarios.", `
    ${metrics([["Pendientes", "3", "requieren accion"], ["Ahorro", money.format(180.5), "por autorizar"]])}
    ${state.approvals.map((a, i) => approvalCard(a, i === 0)).join("")}
  `);
}

function approvalCard(a, expanded) {
  return `<article class="card approval">
    <div class="item-head"><h3>${a.title}</h3><span class="badge warn">${a.risk}</span></div>
    <div class="grid">
      <div><span class="muted">Total</span><div class="price">${money.format(a.total)}</div></div>
      <div><span class="muted">Ahorro</span><div class="price">${money.format(a.saving)}</div></div>
    </div>
    <div class="list-line"><span>Manuel</span><span class="badge ${a.manuel === "Aprobado" ? "" : "warn"}">${a.manuel}</span></div>
    <div class="list-line"><span>Socio</span><span class="badge ${a.socio === "Aprobado" ? "" : "warn"}">${a.socio}</span></div>
    ${expanded ? `<div class="list-line"><span>Arroz · Frijol · Lenteja · Pasta · Aceite</span><span>${a.products} prod.</span></div><label class="search" style="margin-top:10px"><input placeholder="Agregar comentario..."></label><div class="actions"><button class="btn primary" data-approve="${a.id}">Aprobar</button><button class="btn danger" data-reject="${a.id}">Rechazar</button></div><div class="timeline"><span><i class="dot done"></i>Creada</span><span><i class="dot done"></i>Revisada</span><span><i class="dot done"></i>Manuel OK</span><span><i class="dot"></i>Socio</span></div>` : ""}
  </article>`;
}

function inventario() {
  return shell("Inventario", "Existencias, caducidad y destino final.", `
    <label class="search">${icon("M21 21l-4.3-4.3M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z")}<input placeholder="Buscar productos..."></label>
    ${metrics([["Cobertura", "28 dias", "promedio"], ["Caducan", "2", "proximos 30 dias"]])}
    <div class="chips"><button class="chip active">Todos</button><button class="chip">Bajos</button><button class="chip">Caduca pronto</button><button class="chip">Sobrestock</button></div>
    ${state.inventory.map((x, i) => inventoryCard(x, i === 0)).join("")}
    <article class="card"><h3>Movimientos recientes</h3>${state.movements.map((m) => `<div class="list-line"><span>${m[0]} · ${m[1]}</span><span>${m[2]}</span></div>`).join("")}</article>
  `);
}

function inventoryCard(x, expanded) {
  return `<article class="card row-card">
    <div class="thumb">${x.icon}</div>
    <div>
      <div class="item-head"><h3>${x.name}</h3><span class="badge ${x.status.includes("Caduca") ? "warn" : ""}">${x.status}</span></div>
      <div class="muted">${x.presentation} · ${x.coverage} · cad. ${x.expires}</div>
      <div class="item-head" style="margin-top:10px">
        <span>Existencia: <b>${x.qty}</b> / min. ${x.min}</span>
        <span class="stepper"><button data-inv="${x.id}" data-delta="-1">-</button><span>${x.qty}</span><button data-inv="${x.id}" data-delta="1">+</button></span>
      </div>
      ${expanded ? `<div class="actions"><button class="btn orange" data-move="${x.id}" data-type="remate">Rematar</button><button class="btn" data-move="${x.id}" data-type="regalo">Regalar</button></div>` : ""}
    </div>
  </article>`;
}

function historial() {
  return shell("Historial", "Ahorro real, pagos y demanda.", `
    ${metrics([["Ahorro real", money.format(1842), "acumulado"], ["Prox. pago", money.format(1245), "5 nov"]])}
    ${state.history.map((h, i) => historyCard(h, i === 0)).join("")}
    <article class="card"><h3>Demanda</h3><div class="list-line"><span>Promocion: Papel higienico</span><span>40 pzas</span></div><div class="list-line"><span>Surtido</span><span>22 pzas</span></div><div class="list-line"><span>Demanda perdida</span><span class="badge bad">18 pzas</span></div></article>
  `);
}

function historyCard(h, expanded) {
  return `<article class="card">
    <div class="item-head"><h3>${h.title}</h3><span class="badge">${h.status}</span></div>
    <div class="muted">${h.date} · Pago tarjeta ${h.due}</div>
    <div class="grid"><div><span class="muted">Pagado</span><div class="price">${money.format(h.total)}</div></div><div><span class="muted">Ahorro</span><div class="price">${money.format(h.saving)}</div></div></div>
    ${expanded ? h.products.map((p) => `<div class="list-line"><span>${p}</span><span>Ver</span></div>`).join("") + `<div class="actions"><button class="btn">Ver oferta original</button><button class="btn primary">Duplicar</button></div>` : ""}
  </article>`;
}

function render() {
  const routes = { radar, lista, aprobar, inventario, historial };
  document.querySelector("#app").innerHTML = (routes[currentTab()] || radar)();
}

document.addEventListener("click", (event) => {
  const el = event.target.closest("button");
  if (!el) return;
  if (el.dataset.tab) return setTab(el.dataset.tab);
  if (el.dataset.buy) return window.open(el.dataset.buy, "_blank", "noopener,noreferrer");
  if (el.dataset.add) {
    const existing = state.list.find((x) => x.id === el.dataset.add);
    existing ? existing.qty += 1 : state.list.push(item(el.dataset.add, 1, "pza", "Precio bajo"));
  }
  if (el.dataset.qty) state.list.find((x) => x.id === el.dataset.qty).qty = Math.max(1, state.list.find((x) => x.id === el.dataset.qty).qty + Number(el.dataset.delta));
  if (el.dataset.inv) state.inventory.find((x) => x.id === el.dataset.inv).qty = Math.max(0, state.inventory.find((x) => x.id === el.dataset.inv).qty + Number(el.dataset.delta));
  if (el.dataset.sendApproval !== undefined) setTab("aprobar");
  if (el.dataset.approve) state.approvals.find((x) => x.id === el.dataset.approve).manuel = "Aprobado";
  if (el.dataset.reject) state.approvals.find((x) => x.id === el.dataset.reject).risk = "Rechazada";
  if (el.dataset.move) state.movements.unshift([el.dataset.type === "remate" ? "Remate" : "Regalo", state.inventory.find((x) => x.id === el.dataset.move).name, "-1", "Destino final pendiente"]);
  save();
  render();
});

window.addEventListener("hashchange", render);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
render();
loadRealOffers();

async function loadRealOffers() {
  try {
    const rows = await fetch("/offers.json", { cache: "no-store" }).then((res) => res.ok ? res.json() : []);
    if (!Array.isArray(rows) || rows.length === 0) return;
    state.offers = rows.map((row) => {
      const qty = Number(row.unit_size || 0);
      const unit = qty ? Math.round((Number(row.price_mxn) / qty) * 100) / 100 : Number(row.price_mxn);
      return offer(
        row.dedupe_key || row.canonical_url || row.source_url,
        row.presentation || row.product_slug,
        row.title || "",
        row.store,
        Number(row.price_mxn),
        unit,
        Number(row.discount_pct || 0),
        row.availability || "in stock",
        row.source_url || row.canonical_url,
        (row.presentation || row.product_slug || "?").slice(0, 1),
      );
    });
    save();
    render();
  } catch {
    // Sin ofertas publicadas todavia: se queda el seed local del demo.
  }
}
