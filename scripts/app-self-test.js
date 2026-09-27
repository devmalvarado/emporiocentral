import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile("public/app.js", "utf8");
const manifest = JSON.parse(await readFile("public/manifest.webmanifest", "utf8"));

for (const tab of ["radar", "lista", "aprobar", "inventario", "historial"]) {
  assert(app.includes(`["${tab}"`), `missing tab ${tab}`);
}

assert.equal(manifest.display, "standalone");
assert.equal(manifest.short_name, "Emporio");
assert(app.includes("data-buy"), "Comprar button missing");
assert(app.includes("data-move"), "inventory final-destination actions missing");
console.log("ok");
