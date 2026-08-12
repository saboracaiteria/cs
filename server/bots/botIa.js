/**
 * Bots — IA que roda no servidor (online) e no cliente (modo treinamento).
 * Comportamento: patrulhar pontos, mirar no inimigo mais próximo, atirar,
 * fugir da zona no BR, pegar loot.
 */

import { dist2D, angleDelta } from '../util.js';

/** Máx. de bots atirando no MESMO alvo ao mesmo tempo. Sem este limite todos
 *  os bots focavam o jogador junto e ele morria em segundos. */
const MAX_FOCO = 2;

/** Linha de visão: amostra o segmento olho->peito a cada ~4 m; um sólido na
 *  altura do olhar entre os dois pontos bloqueia (bot não atira em parede). */
function temVisao(col, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const d = Math.hypot(dx, dy, dz);
  if (d < 0.5) return true;
  const n = Math.max(2, Math.ceil(d / 4));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (col.isBlocked(ax + dx * t, az + dz * t, 0.35, ay + dy * t, 0.5)) return false;
  }
  return true;
}

/** Nomes brasileiros para bots (tema BR, como pedido no documento). */
export const NOMES = [
  'Zé da Manga', 'Dona Flor', 'Seu Lunga', 'Batoré', 'Dedé', 'Bira',
  'Tininha', 'Careca', 'Coxinha', 'Pastel', 'Farofa', 'Ximbica',
  'Rabetão', 'Birobiro', 'Jabá', 'Pamonha', 'Pipoca', 'Gordão',
  'Formiga', 'Taturana', 'Mandioquinha', 'Canjica', 'Baião', 'Cuscuz',
];

export function makeBot(nick, dificuldade = 'media') {
  const DIF = {
    facil: { precisao: 0.25, reacao: 0.6, danoMult: 1.0, visao: 30 },
    media: { precisao: 0.45, reacao: 0.4, danoMult: 1.5, visao: 42 },
    dificil: { precisao: 0.7, reacao: 0.22, danoMult: 1.8, visao: 55 },
  };
  const d = DIF[dificuldade] || DIF.media;
  return {
    nick,
    dificuldade,
    precisao: d.precisao,
    reacao: d.reacao,
    danoMult: d.danoMult,
    visao: d.visao,
    target: null,
    wanderT: 0,
    wanderX: 0,
    wanderZ: 0,
    // [BOT-HELI] 30% dos bots embarcam num helicoptero livre e perseguem
    // os players pelo ar disparando MISSELS (BR e DM)
    pilotarHeli: Math.random() < 0.3,
    _heliT: 0,
    _missilT: 0,
    think(dt, room) {
      if (!this.body || this.hp <= 0) return;
      const modo = room.modo;

      // BR: prioridade é ficar dentro da zona
      let inZone = true;
      if (modo === 'br') {
        const d = dist2D(this.body.pos.x, this.body.pos.z, room.zone.x, room.zone.z);
        inZone = d <= room.zone.r;
      }

      // quantos bots já estão mirando cada alvo (o alvo é o PRÓPRIO objeto:
      // bots não têm .id — o id fica na chave do Map da sala; contagem do
      // frame, suficiente para espalhar o fogo)
      const foco = new Map();
      for (const b of room.bots.values()) {
        if (b !== this && b.target) foco.set(b.target, (foco.get(b.target) || 0) + 1);
      }

      // acha o inimigo mais próximo com LINHA DE VISÃO livre (sem paredes no
      // caminho) e que ainda não está saturado de atiradores
      let best = null, bestD = this.visao;
      const col = room.world.col;
      for (const o of room._all()) {
        if (o === this || o.hp <= 0 || !o.body) continue;
        const dd = dist2D(this.body.pos.x, this.body.pos.z, o.body.pos.x, o.body.pos.z);
        if (dd >= bestD || (foco.get(o) || 0) >= MAX_FOCO) continue;
        // olho do bot (1.5) até o peito do alvo (1.2): se bater parede, não vê
        if (!temVisao(col,
          this.body.pos.x, this.body.pos.y + 1.5, this.body.pos.z,
          o.body.pos.x, o.body.pos.y + 1.2, o.body.pos.z)) continue;
        bestD = dd; best = o;
      }
      this.target = best;

      const inp = { moveX: 0, moveZ: 0, yaw: this.body.yaw, pitch: 0, run: false, jump: false, up: false, down: false, heliYaw: 0, heliDesiredYaw: null };

      // ---- [BOT-HELI] piloto de helicoptero: embarca num aparelho livre e
      // persegue os players pelo ar disparando MISSELS (BR e DM) ----
      if (this.pilotarHeli) {
        if (this.inHeli != null) {
          // --- pilotando: sobe, persegue o alvo a ~60 m e atira missile ---
          const gH = room.world.col.groundHeightAt(this.body.pos.x, this.body.pos.z, 999);
          const alvoY = gH + 26;
          inp.up = this.body.pos.y < alvoY - 3;
          inp.down = this.body.pos.y > alvoY + 3;
          if (best) {
            const dxH = best.body.pos.x - this.body.pos.x;
            const dzH = best.body.pos.z - this.body.pos.z;
            const distH = Math.hypot(dxH, dzH);
            const dyH = (best.body.pos.y + 1.2) - this.body.pos.y;
            const yawH = Math.atan2(-dxH, -dzH);
            const pitchH = Math.atan2(dyH, distH);
            inp.moveZ = distH > 70 ? 0.55 : distH < 35 ? -0.45 : 0;
            inp.yaw = yawH;
            inp.heliDesiredYaw = yawH;
            this._missilT -= dt;
            if (this._missilT <= 0 && Math.abs(angleDelta(this.body.yaw, yawH)) < 0.4) {
              this._missilT = 2.5 + Math.random() * 1.5;
              room.onShoot(this, { yaw: yawH, pitch: pitchH });   // missile (inHeli)
            }
          } else if (modo === 'br' && !inZone) {
            const toZ = Math.atan2(room.zone.x - this.body.pos.x, room.zone.z - this.body.pos.z);
            inp.moveZ = 0.6;
            inp.yaw = toZ;
            inp.heliDesiredYaw = toZ;
          } else {
            inp.moveZ = 0;   // sem alvo: fica pairando (anti-idle desce e o bot retoma)
          }
          this._heliT -= dt;
          if (this._heliT <= 0) {
            room._veiculoHeli(this, 0);   // tempo de voo acabou: vira bot de chao
            this.pilotarHeli = false;
          }
          this._lastInput = inp;
          room._applyInput(this, inp);
          return;
        }
        // --- no chao: caminha ate o helicoptero livre mais proximo e embarca ---
        let hNear = null, hD = Infinity;
        for (const h of room.helis || []) {
          if (h.playerId != null) continue;
          const dd = dist2D(this.body.pos.x, this.body.pos.z, h.x, h.z);
          if (dd < hD) { hD = dd; hNear = h; }
        }
        if (hNear) {
          if (hD < 7) {
            room._veiculoHeli(this, hNear.id);
            this._heliT = 55 + Math.random() * 40;   // voa de ~1 a ~1,5 min
            this._missilT = 1 + Math.random() * 2;
          } else {
            const toH = Math.atan2(hNear.x - this.body.pos.x, hNear.z - this.body.pos.z);
            inp.yaw = toH;
            inp.moveZ = 0.6;
            inp.run = true;
            this._lastInput = inp;
            room._applyInput(this, inp);
            return;
          }
        }
      }

      if (modo === 'br' && !inZone && this.wanderT > 0) {
        // foge para o centro da zona
        const toZ = Math.atan2(room.zone.x - this.body.pos.x, room.zone.z - this.body.pos.z);
        inp.yaw = toZ;
        inp.moveZ = 0.5;
        inp.run = true;
        this.wanderT -= dt;
      } else if (best) {
        // mira no alvo
        const dy = (best.body.pos.y + 1.2) - (this.body.pos.y + 1.5);
        const dx = best.body.pos.x - this.body.pos.x;
        const dz = best.body.pos.z - this.body.pos.z;
        const yaw = Math.atan2(-dx, -dz);
        const dist = Math.hypot(dx, dz);
        const pitch = Math.atan2(dy, dist);
        this.body.yaw += angleDelta(this.body.yaw, yaw) * Math.min(1, 8 * dt);
        this.body.pitch = pitch * 0.8;
        // atira com cadência limitada pela precisão
        this._fireT = (this._fireT || 0) - dt;
        if (this._fireT <= 0 && Math.abs(angleDelta(this.body.yaw, yaw)) < 0.3) {
          this._fireT = 0.5 + (1 - this.precisao) * 0.6;
          room.onShoot(this, { yaw: this.body.yaw, pitch: this.body.pitch });
        }
        // aproxima/recua um pouco
        inp.moveZ = dist > 14 ? 0.5 : dist < 6 ? -0.5 : 0;
        inp.yaw = this.body.yaw;
        inp.run = true;
      } else {
        // vadiagem: muda de direção de tempos em tempos
        this.wanderT -= dt;
        if (this.wanderT <= 0) {
          this.wanderT = 2 + Math.random() * 3;
          this.wanderX = this.body.pos.x + (Math.random() - 0.5) * 40;
          this.wanderZ = this.body.pos.z + (Math.random() - 0.5) * 40;
        }
        const toW = Math.atan2(this.wanderX - this.body.pos.x, this.wanderZ - this.body.pos.z);
        inp.yaw = toW;
        inp.moveZ = 0.5;
      }

      // BR: pega loot se estiver vazio (só arma)
      if (modo === 'br' && this.arma === 'pistola' && room.loot.length) {
        let near = null, nd = 12;
        for (const it of room.loot) {
          if (it.tipo !== 'arma') continue;
          const dd = dist2D(this.body.pos.x, this.body.pos.z, it.x, it.z);
          if (dd < nd) { nd = dd; near = it; }
        }
        if (near) {
          const toL = Math.atan2(near.x - this.body.pos.x, near.z - this.body.pos.z);
          inp.yaw = toL;
          inp.moveZ = 0.5;
          room.pickup(this);
        }
      }

      // aplica input
      this._lastInput = inp;
      room._applyInput(this, inp);
    },
  };
}

export function pickBotName(rng) {
  return NOMES[Math.floor(rng() * NOMES.length)];
}
