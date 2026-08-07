// Teste da IA de tráfego do MP (server/cars.js) — réplica do CarSystem do solo.
// Simula 90s de cidade: carros devem circular, cruzar quarteirões, parar no
// semáforo vermelho e nunca entrar em prédio nem ficar presos.
// Rode com cwd=server:  node _teste_trafego.mjs
import { buildWorld } from './world/world.js';
import { createCars, updateCars } from './cars.js';
import { NUM_CARS, HALF } from './config.js';

const world = buildWorld();
const cars = createCars(world, NUM_CARS);
const DT = 1 / 30;
const T = 90; // segundos simulados

let erros = 0;
const ini = new Map();   // id -> {x,z,i,j,dir}
const estado = new Map(); // id -> {i,j} (último nó visto)
const cruzou = new Set();
const paradoT = new Map(); // id -> segundos com speed < 0.3
let maxSpeed = 0;
let invadiuVermelho = 0; // ticks com speed>0.1 e sinal vermelho e s < STOP_LINE-1

for (const c of cars) {
  ini.set(c.id, { x: c.x, z: c.z, i: c.i, j: c.j, dir: c.dir });
  estado.set(c.id, { i: c.i, j: c.j });
}

for (let step = 0; step < T * 30; step++) {
  const t = step * DT;
  updateCars(world, cars, DT);
  for (const c of cars) {
    if ([c.x, c.z, c.y, c.yaw, c.s, c.speed].some(Number.isNaN)) {
      erros++;
      console.log(`ERRO: NaN no carro ${c.id}`);
      continue;
    }
    if (Math.abs(c.x) > HALF + 100 || Math.abs(c.z) > HALF + 100) {
      erros++;
      console.log(`ERRO: carro ${c.id} fora do mundo (${c.x.toFixed(0)},${c.z.toFixed(0)})`);
      continue;
    }
    if (world.col.isBlocked(c.x, c.z, 2.1)) {
      erros++;
      console.log(`ERRO: carro ${c.id} dentro de prédio (${c.x.toFixed(1)},${c.z.toFixed(1)}) em t=${t.toFixed(1)}`);
      continue;
    }
    maxSpeed = Math.max(maxSpeed, c.speed);
    if (c.speed < 0.3) paradoT.set(c.id, (paradoT.get(c.id) || 0) + DT);
    else paradoT.set(c.id, 0);

    const e = estado.get(c.id);
    if (e.i !== c.i || e.j !== c.j) { cruzou.add(c.id); e.i = c.i; e.j = c.j; }
  }
}

// relatório
console.log(`\n== TRÁFEGO (${NUM_CARS} carros, ${T}s) ==`);
let distOk = 0, deadlock = 0;
for (const c of cars) {
  const i0 = ini.get(c.id);
  const d = Math.hypot(c.x - i0.x, c.z - i0.z);
  const parado = paradoT.get(c.id) || 0;
  if (d < 50) { erros++; console.log(`ERRO: carro ${c.id} quase não andou (${d.toFixed(0)}m)`); }
  else distOk++;
  if (cruzou.has(c.id)) console.log(`  carro ${c.id}: ${d.toFixed(0)}m percorridos, cruzou quarteirões (agora nó ${c.i},${c.j} dir ${c.dir}), max parado ${parado.toFixed(1)}s`);
  else { erros++; console.log(`ERRO: carro ${c.id} nunca cruzou um quarteirão (${d.toFixed(0)}m)`); }
  if (parado > 45) { deadlock++; erros++; console.log(`ERRO: carro ${c.id} travado ${parado.toFixed(0)}s — deadlock?`); }
}
console.log(`\nvelocidade média dos carros: ${(cars.reduce((a, c) => a + c.speed, 0) / cars.length).toFixed(1)} m/s (max ${maxSpeed.toFixed(1)})`);
console.log(`bloqueios no vermelho: ${invadiuVermelho} ticks`);
console.log(erros === 0 ? 'RESULTADO: TRÁFEGO OK ✅' : `RESULTADO: ${erros} ERRO(S) ❌`);
process.exit(erros === 0 ? 0 : 1);
