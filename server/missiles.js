/**
 * Mísseis de canhão dos helicópteros do MP — projéteis autoritativos.
 * O piloto dispara (E/clique) e o projétil voa reto da ponta do aparelho
 * até bater no mundo ou em alguém; aí explode em ÁREA (dano com queda pela
 * distância). O visual (foguete voando + explosão) é só do cliente, que
 * recebe MISSIL_FIRE (disparo) e MISSIL (explosão).
 */
import { MISSIL } from './config.js';

export function createMissis() {
  return [];
}

/** Integra os projéteis; chama onExplosao(m) quando um explode/expira. */
export function updateMissis(world, misseis, players, dt, onExplosao) {
  for (let i = misseis.length - 1; i >= 0; i--) {
    const m = misseis[i];
    m.t -= dt;
    // homing: curva em direção ao alvo travado na mira (teleguiado do solo)
    if (m.alvoId != null) {
      const a = players.find((p) => p.id === m.alvoId);
      if (a && a.body && a.hp > 0) {
        const tx = a.body.pos.x - m.x, ty = a.body.pos.y + 1 - m.y, tz = a.body.pos.z - m.z;
        const tl = Math.hypot(tx, ty, tz);
        if (tl > 0.5) {
          const k = Math.min(1, MISSIL.curva * dt);
          m.dx += ((tx / tl) - m.dx) * k;
          m.dy += ((ty / tl) - m.dy) * k;
          m.dz += ((tz / tl) - m.dz) * k;
          const nl = Math.hypot(m.dx, m.dy, m.dz) || 1;
          m.dx /= nl; m.dy /= nl; m.dz /= nl;
        }
      }
    }
    // movimento com sub-passos curtos para não atravessar paredes finas
    const dist = MISSIL.speed * dt;
    const sub = Math.max(1, Math.ceil(dist / 1.5));
    const sdt = dt / sub;
    let explodiu = false;
    for (let s = 0; s < sub && !explodiu; s++) {
      m.x += m.dx * MISSIL.speed * sdt;
      m.y += m.dy * MISSIL.speed * sdt;
      m.z += m.dz * MISSIL.speed * sdt;
      const g = world.col.groundHeightAt(m.x, m.z, m.y + 0.4);
      if (m.y <= g + 0.1) explodiu = true;
      else if (world.col.raycast(m.x - m.dx, m.y - m.dy, m.z - m.dz, m.dx, m.dy, m.dz, dist / sub + 0.6)) explodiu = true;
    }
    // colisão com jogadores (esfera ~1,5 m no peito)
    if (!explodiu) {
      for (const p of players) {
        if (!p.body || p.hp <= 0) continue;
        const dx = m.x - p.body.pos.x;
        const dy = m.y - (p.body.pos.y + 1);
        const dz = m.z - p.body.pos.z;
        if (dx * dx + dy * dy + dz * dz < 2.25) { explodiu = true; break; }
      }
    }
    if (explodiu || m.t <= 0) {
      if (onExplosao) onExplosao(m);
      misseis.splice(i, 1);
    }
  }
}
