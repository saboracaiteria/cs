// ============================================================================
// TESTE DE CALIBRACAO DA MIRA (3a pessoa -> ADS)
// Roda headless com node: mede o desvio do crosshair ao alternar o modo.
// Uso: node deploy/teste-mira.mjs
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { GameCamera } from '../src/camera.js';
import { CampoTiro } from '../src/range.js';

// --- mocks de DOM (necessarios para o overlay do campo de tiro) -------------
globalThis.window = { innerWidth: 800, innerHeight: 600 };
const fakeDiv = () => {
  const el = { style: {}, id: '', _t: '', appendChild() {} };
  Object.defineProperty(el, 'textContent', { set(v) { el._t = v; }, get() { return el._t; } });
  return el;
};
globalThis.document = {
  createElement: () => fakeDiv(),
  body: { appendChild() {} },
};

// --- cena / camera / collider mock ------------------------------------------
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(62, 800 / 600, 0.15, 2600);
const col = { raycast: () => null, groundHeightAt: () => 0 };

const gc = new GameCamera(cam, col);
gc.setMode('foot');

const campo = new CampoTiro(scene);

// --- utilitarios ------------------------------------------------------------
const FOCUS = new THREE.Vector3(0, 1.48, 0);   // peito do Bob
const DIST_ALVO = 25;                          // alvo a 25 m
const N = 90;                                  // frames para estabilizar o damp

function pontoMira(out = new THREE.Vector3()) {
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  gc.aimRay(o, d, 0, 0);                       // raio do CENTRO da tela (crosshair)
  return out.copy(o).addScaledVector(d, DIST_ALVO);
}

function rodarFrames(n) {
  for (let i = 0; i < n; i++) gc.update(1 / 60, FOCUS);
}

function medidas(rotulo, yaw, pitch) {
  gc.yaw = yaw; gc.pitch = pitch;
  rodarFrames(30);                             // estabiliza yaw/pitch e distancia
  const p = pontoMira();
  // overlay do campo de tiro: desvio em px da mira (verde) vs alvo
  campo.update(cam, col, rotulo);
  const overlay = campo.overlay._t || '';
  const m = overlay.match(/MIRA \(verde\) vs ALVO: dx (-?\d+)px  dy (-?\d+)px/);
  return { p, dx: m ? +m[1] : NaN, dy: m ? +m[2] : NaN };
}

// ============================================================================
console.log('==============================================================');
console.log('TESTE DE CALIBRACAO DA MIRA — 3a pessoa -> ADS');
console.log(`Alvo do campo de tiro a ${DIST_ALVO} m, foco do Bob em y+1.48`);
console.log('==============================================================');

// posiciona o alvo do campo de tiro na frente do Bob (yaw=0 -> -Z)
campo.posicionar(0, 0, 0);

const cenas = [
  { rotulo: 'FRENTE  (yaw 0.00, pitch -0.05)', yaw: 0.00, pitch: -0.05 },
  { rotulo: 'DIREITA (yaw 0.60, pitch -0.05)', yaw: 0.60, pitch: -0.05 },
  { rotulo: 'ACIMA   (yaw 0.00, pitch +0.25)', yaw: 0.00, pitch: 0.25 },
];

const linhas = [];
for (const c of cenas) {
  // --- SEM ADS (terceira pessoa) ---
  gc.setAds(false);
  rodarFrames(N);
  const antes = medidas(c.rotulo + ' | SEM ADS', c.yaw, c.pitch);

  // --- COM ADS (mirando) ---
  gc.setAds(true, 46);
  rodarFrames(N);
  const depois = medidas(c.rotulo + ' | COM ADS', c.yaw, c.pitch);

  const pulo = antes.p.distanceTo(depois.p);   // deslocamento do crosshair no alvo (m)
  const lin = [
    `\n--- ${c.rotulo} ---`,
    `SEM ADS : mira(verde) vs alvo dx ${antes.dx}px dy ${antes.dy}px | ponto ${antes.p.x.toFixed(2)}, ${antes.p.y.toFixed(2)}, ${antes.p.z.toFixed(2)}`,
    `COM ADS : mira(verde) vs alvo dx ${depois.dx}px dy ${depois.dy}px | ponto ${depois.p.x.toFixed(2)}, ${depois.p.y.toFixed(2)}, ${depois.p.z.toFixed(2)}`,
    `PULO do crosshair ao mirar: ${pulo.toFixed(3)} m  (${(pulo * 100).toFixed(1)} cm)  ${pulo < 0.05 ? 'OK <= 5cm' : 'FALHOU > 5cm'}`,
  ];
  linhas.push(lin.join('\n'));
  console.log(lin.join('\n'));
}

console.log('\n==============================================================');
const ok = linhas.every((l) => /OK <= 5cm/.test(l));
console.log(ok ? 'RESULTADO: MIRA ESTAVEL AO ALTERNAR 3a PESSOA <-> ADS' : 'RESULTADO: MIRA DESLOCA AO ALTERNAR (precisa calibrar)');
console.log('==============================================================');

// --- TESTE FINAL: jogador APONTANDO para o centro do alvo ------------------
// alvo em (0, 2.4, -25), bob em (0, 1.48, 0) -> pitch necessario ~ +0.037
const c2 = { rotulo: 'ALVO   (apontando p/ centro do alvo)', yaw: 0.0, pitch: 0.0368 };
gc.setAds(false); rodarFrames(N);
const a1 = medidas(c2.rotulo + ' | SEM ADS', c2.yaw, c2.pitch);
gc.setAds(true, 46); rodarFrames(N);
const a2 = medidas(c2.rotulo + ' | COM ADS', c2.yaw, c2.pitch);
const pulo2 = a1.p.distanceTo(a2.p);
console.log(`\n--- ${c2.rotulo} ---`);
console.log(`SEM ADS : dx ${a1.dx}px dy ${a1.dy}px`);
console.log(`COM ADS : dx ${a2.dx}px dy ${a2.dy}px`);
console.log(`PULO: ${pulo2.toFixed(3)} m  ${pulo2 < 0.05 ? 'OK' : 'FALHOU'}`);
console.log(`${Math.abs(a1.dx) <= 4 && Math.abs(a1.dy) <= 4 ? 'SEM ADS: crosshair NO CENTRO do alvo (dx/dy <= 4px)' : 'SEM ADS: crosshair FORA do alvo'}`);
console.log(`${Math.abs(a2.dx) <= 4 && Math.abs(a2.dy) <= 4 ? 'COM ADS: crosshair NO CENTRO do alvo (dx/dy <= 4px)' : 'COM ADS: crosshair FORA do alvo'}`);

// --- TESTE FINAL: jogador APONTANDO para o centro do alvo ------------------
// alvo em (0, 2.4, -25), bob em (0, 1.48, 0) -> pitch necessario ~ +0.037
const c2 = { rotulo: 'ALVO   (apontando p/ centro do alvo)', yaw: 0.0, pitch: 0.0368 };
gc.setAds(false); rodarFrames(N);
const a1 = medidas(c2.rotulo + ' | SEM ADS', c2.yaw, c2.pitch);
gc.setAds(true, 46); rodarFrames(N);
const a2 = medidas(c2.rotulo + ' | COM ADS', c2.yaw, c2.pitch);
const pulo2 = a1.p.distanceTo(a2.p);
console.log(`\n--- ${c2.rotulo} ---`);
console.log(`SEM ADS : dx ${a1.dx}px dy ${a1.dy}px`);
console.log(`COM ADS : dx ${a2.dx}px dy ${a2.dy}px`);
console.log(`PULO: ${pulo2.toFixed(3)} m  ${pulo2 < 0.05 ? 'OK' : 'FALHOU'}`);
console.log(`${Math.abs(a1.dx) <= 4 && Math.abs(a1.dy) <= 4 ? 'SEM ADS: crosshair NO CENTRO do alvo (dx/dy <= 4px)' : 'SEM ADS: crosshair FORA do alvo'}`);
console.log(`${Math.abs(a2.dx) <= 4 && Math.abs(a2.dy) <= 4 ? 'COM ADS: crosshair NO CENTRO do alvo (dx/dy <= 4px)' : 'COM ADS: crosshair FORA do alvo'}`);
