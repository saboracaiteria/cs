// ============================================================================
// TESTE DE CALIBRACAO DA MIRA — Bob em Busca da AGI Sagrada 3D
// Headless (node): usa o CAMPO DE TIRO para alinhar a mira e prova que o
// crosshair NAO muda de posicao ao: (1) alternar 3a pessoa <-> ADS,
// (2) atirar em repouso (spread/recoil zerados).
// Uso: node deploy/teste-mira.mjs
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { GameCamera } from '../src/camera.js';
import { CampoTiro } from '../src/range.js';
import { CAMERA } from '../src/config.js';

// --- mocks de DOM (o range cria um div; o window eh usado na projecao) -------
const fakeDiv = () => {
  const el = { style: {}, id: '', _t: '', appendChild() {} };
  Object.defineProperty(el, 'textContent', { set(v) { el._t = v; }, get() { return el._t; } });
  return el;
};
globalThis.window = { innerWidth: 800, innerHeight: 600 };
globalThis.document = { createElement: () => fakeDiv(), body: { appendChild() {} } };

const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(62, 800 / 600, 0.15, 2600);
// colisao simulada: o alvo do campo de tiro (esfera raio 0.9 em (0, 2.4, -25))
// captura o raio -> o impacto para no alvo, como com um collider real
const col = {
  raycast: (x, y, z, dx, dy, dz, dist) => {
    // simula o prédio/árvore mirado a 25 m (os raios de colisão da câmera,
    // que vão para TRÁS, não acertam)
    if (dz < -0.1 && dy > -0.6 && dy < 0.6) return { t: 25 };
    return null;
  },
  groundHeightAt: () => 0,
};
const gc = new GameCamera(cam, col);
gc.setMode('foot');
const FOCUS = new THREE.Vector3(0, 1.48, 0);
const N = 90;

const campo = new CampoTiro(scene);
campo.posicionar(0, 0, 0);               // alvo em (0, 2.4, -25)
const ALVO = campo.posAlvo.clone();

const rodar = (n) => { for (let i = 0; i < n; i++) gc.update(1 / 60, FOCUS); };

const pontoMira = (dist = 25) => {
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  gc.aimRay(o, d, 0, 0);
  return o.clone().addScaledVector(d, dist);
};

const medidas = () => {
  campo.update(cam, col, 'teste');
  const m = (campo.overlay._t || '').match(/dx (-?\d+)px  dy (-?\d+)px/);
  return m ? { dx: +m[1], dy: +m[2] } : { dx: NaN, dy: NaN };
};

// CALIBRACAO: gira a mira ate o crosshair ficar no centro do alvo (dx/dy ~ 0)
function mirarNoAlvo() {
  let y = 0.06, p = 0.02, passo = 0.02;
  for (let it = 0; it < 60; it++) {
    gc.setAds(false); rodar(6);
    gc.yaw = y; gc.pitch = p; rodar(6);
    const m = medidas();
    if (Math.abs(m.dx) <= 2 && Math.abs(m.dy) <= 2) break;
    // 1px ~ 0.00135 rad (FOV 62 deg em 800px)
    y += m.dx * 0.00135;
    p += m.dy * 0.00135;
  }
}

const linha = '='.repeat(62);
const falha = (ok) => (ok ? 'PASSOU' : 'FALHOU');

console.log(linha);
console.log(' RELATORIO DE CALIBRACAO DA MIRA');
console.log(linha);

// ------------------------------------------------------------------ 1. PULO
console.log('\n[1] PULO DO CROSSHAIR ao alternar 3a pessoa <-> ADS');
console.log('    (crosshair deve continuar apontando para o MESMO ponto do mundo)');
let puloOk = true;
for (const c of [
  { rotulo: 'FRENTE', yaw: 0.0, pitch: -0.05 },
  { rotulo: 'DIREITA', yaw: 0.60, pitch: -0.05 },
  { rotulo: 'ACIMA', yaw: 0.0, pitch: 0.25 },
]) {
  gc.setAds(false); rodar(N);
  gc.yaw = c.yaw; gc.pitch = c.pitch; rodar(N);
  const p1 = pontoMira(25);                 // ponto do mundo mirado em 3a pessoa
  gc.setAds(true, 46); rodar(N);
  // [CODM-FPP] anchoring: o ponto mirado em TPP permanece NO CENTRO da tela
  // da camera ADS (a camera rotaciona para ficar travada nele). Projeta p1
  // e mede o desvio do centro (NDC 0,0).
  const pNDC = p1.clone().project(gc.cam);
  const pulo = Math.hypot(pNDC.x, pNDC.y);  // desvio do centro da tela (NDC)
  const ok = pulo < 0.03;
  puloOk = puloOk && ok;
  console.log(`  ${c.rotulo.padEnd(8)} pulo ${pulo.toFixed(4)} NDC  ${falha(ok)}`);
}
console.log(`  RESULTADO: ${falha(puloOk)}`);

// ------------------------------------------------------------------ 2. ALVO
console.log('\n[2] CAMPO DE TIRO: calibra a mira ate o crosshair ficar no centro do alvo');
mirarNoAlvo();
const s1 = medidas();
gc.setAds(true, 46); rodar(N);
const s2 = medidas();
const okAlvo = Math.abs(s1.dx) <= 10 && Math.abs(s1.dy) <= 10 && Math.abs(s2.dx) <= 10 && Math.abs(s2.dy) <= 10;
console.log(`  yaw ${gc.yaw.toFixed(4)} pitch ${gc.pitch.toFixed(4)}`);
console.log(`  SEM ADS: dx ${s1.dx}px dy ${s1.dy}px | COM ADS: dx ${s2.dx}px dy ${s2.dy}px  ${falha(okAlvo)}`);

// ------------------------------------------------------------------ 3. DISPARO
console.log('\n[3] DISPARO EM REPOUSO (sem ADS) — a bala sai reta onde o crosshair aponta?');
console.log('    (spreadHip no config = ' + CAMERA.spreadHip + ')');
gc.setAds(false); rodar(N);
mirarNoAlvo();
const o = new THREE.Vector3(), d = new THREE.Vector3();
gc.aimRay(o, d, 0, 0);
const base = o.clone().addScaledVector(d, 25);
let maxDesvio = 0;
const T = 20;
for (let i = 0; i < T; i++) {
  // replica do _shoot do game.js: spread antes de atirar
  const dir = d.clone();
  const spread = gc.isAds ? CAMERA.spreadAds : CAMERA.spreadHip;
  if (spread > 0) {
    dir.x += (Math.random() - 0.5) * 2 * spread;
    dir.y += (Math.random() - 0.5) * 2 * spread;
    dir.z += (Math.random() - 0.5) * 2 * spread;
    dir.normalize();
  }
  const impacto = o.clone().addScaledVector(dir, 25);
  maxDesvio = Math.max(maxDesvio, base.distanceTo(impacto));
}
const okDisp = maxDesvio < 0.03;
console.log(`  ${T} tiros no centro do alvo -> desvio maximo do ponto de impacto: ${(maxDesvio * 100).toFixed(1)} cm  ${falha(okDisp)}`);

// ------------------------------------------------------------------ 4. RECOIL
console.log('\n[4] RECOIL — addRecoil() nao move o crosshair');
gc.setAds(false); rodar(N);
mirarNoAlvo();
const r1 = pontoMira(25);
for (let i = 0; i < 30; i++) { gc.addRecoil(); rodar(3); }
const r2 = pontoMira(25);
const puloRec = r1.distanceTo(r2);
const okRec = puloRec < 0.02;
console.log(`  30 tiros de recoil -> deslocamento do crosshair: ${(puloRec * 100).toFixed(1)} cm  ${falha(okRec)}`);

// ------------------------------------------------------------------ 5. ALVO 3D
console.log('\n[5] IMPACTO NO ALVO 3D — o tiro (marcaTiro vermelha) para no centro do alvo');
gc.setAds(false); rodar(N);
mirarNoAlvo();
const o5 = new THREE.Vector3(), d5 = new THREE.Vector3();
gc.aimRay(o5, d5, 0, 0);
// desvio LATERAL da linha de tiro ao centro do alvo (a linha deve passar por ele)
const ao = o5.clone().sub(ALVO);
const proj = ao.dot(d5);
const lateral = ao.clone().addScaledVector(d5, -proj).length();
const ok3d = lateral < 0.15;
console.log(`  desvio lateral da linha de tiro ao centro do alvo: ${(lateral * 100).toFixed(1)} cm  ${falha(ok3d)}`);

// ------------------------------------------------------------------ FIM
console.log(linha);
const geral = puloOk && okAlvo && okDisp && okRec && ok3d;
console.log(` RESULTADO GERAL: ${falha(geral)}  (mira 100% estavel: nao muda ao mirar nem ao atirar)`);
console.log(linha);
process.exit(geral ? 0 : 1);
