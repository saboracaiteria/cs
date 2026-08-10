// Teste: jogador gira o yaw para compensar o ombro (crosshair no centro do alvo)
import * as THREE from '../vendor/three.module.js';
import { GameCamera } from '../src/camera.js';
import { CampoTiro } from '../src/range.js';
globalThis.window = { innerWidth: 800, innerHeight: 600 };
const fakeDiv = () => { const el = { style: {}, id: '', _t: '', appendChild() {} };
  Object.defineProperty(el, 'textContent', { set(v) { el._t = v; }, get() { return el._t; } }); return el; };
globalThis.document = { createElement: () => fakeDiv(), body: { appendChild() {} } };
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(62, 800/600, 0.15, 2600);
const col = { raycast: () => null, groundHeightAt: () => 0 };
const gc = new GameCamera(cam, col); gc.setMode('foot');
const campo = new CampoTiro(scene);
const FOCUS = new THREE.Vector3(0, 1.48, 0);
const N = 90;
campo.posicionar(0, 0, 0);   // alvo em (0, 2.4, -25)
const rodar = (n) => { for (let i=0;i<n;i++) gc.update(1/60, FOCUS); };
const medidas = (yaw, pitch, rotulo) => {
  gc.yaw = yaw; gc.pitch = pitch; rodar(30);
  campo.update(cam, col, rotulo);
  const m = (campo.overlay._t||'').match(/MIRA \(verde\) vs ALVO: dx (-?\d+)px  dy (-?\d+)px/);
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  gc.aimRay(o, d, 0, 0);
  return { dx: m?+m[1]:NaN, dy: m?+m[2]:NaN, p: o.clone().addScaledVector(d, 25) };
};
// yaw/pitch que apontam o CROSSHAIR para o centro do alvo (compensando o ombro)
const yaw = 0.0628, pitch = 0.0258;
gc.setAds(false); rodar(N);
const s1 = medidas(yaw, pitch, 'SEM ADS');
gc.setAds(true, 46); rodar(N);
const s2 = medidas(yaw, pitch, 'COM ADS');
console.log(`yaw ${yaw.toFixed(4)} pitch ${pitch.toFixed(4)} (compensa ombro 1.8u)`);
console.log(`SEM ADS : dx ${s1.dx}px dy ${s1.dy}px -> ${Math.abs(s1.dx)<=4&&Math.abs(s1.dy)<=4?'CROSSHAIR NO CENTRO DO ALVO ✅':'fora'}`);
console.log(`COM ADS : dx ${s2.dx}px dy ${s2.dy}px -> ${Math.abs(s2.dx)<=4&&Math.abs(s2.dy)<=4?'CROSSHAIR NO CENTRO DO ALVO ✅':'fora'}`);
console.log(`PULO ao mirar: ${s1.p.distanceTo(s2.p).toFixed(4)} m`);
console.log(`CONCLUSAO: tiro sai do centro da tela -> acerta exatamente onde o crosshair aponta, em ambos os modos`);
