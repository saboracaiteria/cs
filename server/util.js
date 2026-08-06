/** Utilidades puras do servidor (sem THREE). */
import { CELL, HALF } from './config.js';

export const TAU = Math.PI * 2;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/** Menor diferença angular entre dois ângulos (-PI..PI). */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** PRNG determinístico (mulberry32) — mesma seed, mesma cidade do cliente. */
export function makeRng(seed = 1337) {
  let t = seed >>> 0;
  return function rng() {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngRange = (rng, a, b) => a + rng() * (b - a);
export const rngInt = (rng, a, b) => Math.floor(a + rng() * (b - a + 1));
export const rngPick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

/** Coordenada mundial da linha de cruzamento de índice i. */
export const nodeCoord = (i) => i * CELL - HALF;

/** Ponto livre perto de uma coordenada (tentativas até achar). */
export function findFreeSpot(col, x, z, r = 0.5, tries = 12) {
  const rng = makeRng((Math.abs(x) * 131 + Math.abs(z) * 17 + 7) >>> 0);
  for (let i = 0; i < tries; i++) {
    const px = x + rngRange(rng, -3, 3);
    const pz = z + rngRange(rng, -3, 3);
    if (!col.isBlocked(px, pz, r)) {
      const y = col.groundHeightAt(px, pz);
      return { x: px, y, z: pz };
    }
  }
  // último recurso: usa o ponto original mesmo que bloqueado (fica fora do chão)
  return { x, y: col.groundHeightAt(x, z) + 2, z };
}
