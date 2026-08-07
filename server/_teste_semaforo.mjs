// Teste determinístico: carro em s=25 com semáforo VERMELHO (eixo x do nó 1,1)
// deve reduzir e parar antes da linha de parada (STOP_LINE=16.5), SEM atravessar.
// O vermelho do eixo x vale de t=8 até t=14.4 (fase 5) — o carro tem ~6.4s para parar.
// Depois libera o verde (t=25) e confere que ele atravessa o cruzamento.
// Rode com cwd=server:  node _teste_semaforo.mjs
import { buildWorld } from './world/world.js';
import { createCars, updateCars } from './cars.js';
import { STOP_LINE, LANE } from './config.js';

const world = buildWorld();
const cars = createCars(world, 1);
const c = cars[0];
c.i = 1; c.j = 1; c.dir = 0;   // indo +X pelo nó (1,1)
c.s = 25; c.state = 'drive'; c.cruise = 12.5; c.speed = 12.5;
c.x = (1 * 64 - 224) - 25;
c.z = (1 * 64 - 224) + LANE;
cars._trafficTime = 10;        // tt=10 -> eixo x VERMELHO no nó (1,1) até tt=14.4

let erros = 0;
const DT = 1 / 30;
let parou = false;
for (let i = 0; i < 30 * 6; i++) {           // 6s — ainda no vermelho
  updateCars(world, cars, DT);
  if (c.state === 'cross') break;            // atravessou (não deveria)
  if (c.speed < 0.3 && c.s >= STOP_LINE - 0.5) { parou = true; break; }
}
const sFinal = c.s;
console.log(`vermelho -> parou=${parou} s=${sFinal.toFixed(2)} (linha em ${STOP_LINE}) state=${c.state} t=${cars._trafficTime.toFixed(2)}`);
if (c.state !== 'drive') { erros++; console.log('ERRO: atravessou o cruzamento no VERMELHO'); }
if (!parou) { erros++; console.log('ERRO: não parou antes do verde abrir'); }
else if (sFinal < STOP_LINE - 0.5) { erros++; console.log(`ERRO: parou além da linha (${sFinal.toFixed(2)} < ${STOP_LINE})`); }
else if (sFinal > STOP_LINE + 4) { erros++; console.log('ERRO: parou longe demais da linha'); }
else console.log('  parou no vermelho, centro em ' + sFinal.toFixed(2) + ' (capô ~' + (sFinal - 2.3).toFixed(2) + ' — atrás da faixa)');

// agora libera o verde: tt=15 -> x verde (acabou de abrir, 11s de verde); deve atravessar
cars._trafficTime = 15;
let cruzou = false;
for (let i = 0; i < 30 * 10; i++) {
  updateCars(world, cars, DT);
  if (c.state === 'cross') { cruzou = true; break; }
}
console.log(`verde -> ${cruzou ? 'atravessou o cruzamento' : 'não atravessou'}`);
if (!cruzou) { erros++; console.log('ERRO: não atravessou com sinal verde'); }

console.log(erros === 0 ? 'RESULTADO: SEMÁFORO OK ✅' : `RESULTADO: ${erros} ERRO(S) ❌`);
process.exit(erros === 0 ? 0 : 1);
