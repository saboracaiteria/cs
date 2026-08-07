/**
 * Bots — IA que roda no servidor (online) e no cliente (modo treinamento).
 * Comportamento: patrulhar pontos, mirar no inimigo mais próximo, atirar,
 * fugir da zona no BR, pegar loot.
 */

import { dist2D, angleDelta } from '../util.js';

/** Nomes brasileiros para bots (tema BR, como pedido no documento). */
export const NOMES = [
  'Zé da Manga', 'Dona Flor', 'Seu Lunga', 'Batoré', 'Dedé', 'Bira',
  'Tininha', 'Careca', 'Coxinha', 'Pastel', 'Farofa', 'Ximbica',
  'Rabetão', 'Birobiro', 'Jabá', 'Pamonha', 'Pipoca', 'Gordão',
  'Formiga', 'Taturana', 'Mandioquinha', 'Canjica', 'Baião', 'Cuscuz',
];

export function makeBot(nick, dificuldade = 'media') {
  const DIF = {
    facil: { precisao: 0.25, reacao: 0.6, danoMult: 1.0, visao: 40 },
    media: { precisao: 0.45, reacao: 0.4, danoMult: 1.5, visao: 55 },
    dificil: { precisao: 0.7, reacao: 0.22, danoMult: 1.8, visao: 70 },
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
    think(dt, room) {
      if (!this.body || this.hp <= 0) return;
      const modo = room.modo;

      // BR: prioridade é ficar dentro da zona
      let inZone = true;
      if (modo === 'br') {
        const d = dist2D(this.body.pos.x, this.body.pos.z, room.zone.x, room.zone.z);
        inZone = d <= room.zone.r;
      }

      // acha o inimigo mais próximo visível
      let best = null, bestD = this.visao;
      for (const o of room._all()) {
        if (o === this || o.hp <= 0 || !o.body) continue;
        const dd = dist2D(this.body.pos.x, this.body.pos.z, o.body.pos.x, o.body.pos.z);
        if (dd < bestD) { bestD = dd; best = o; }
      }

      const inp = { moveX: 0, moveZ: 0, yaw: this.body.yaw, pitch: 0, run: false, jump: false };

      if (modo === 'br' && !inZone && this.wanderT > 0) {
        // foge para o centro da zona
        const toZ = Math.atan2(room.zone.x - this.body.pos.x, room.zone.z - this.body.pos.z);
        inp.yaw = toZ;
        inp.moveZ = 1;
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
        inp.moveZ = dist > 14 ? 1 : dist < 6 ? -1 : 0;
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
        inp.moveZ = 1;
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
          inp.moveZ = 1;
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
