/**
 * Sala MULTIPLAYER (mata-mata em equipes verde x amarelo).
 * Respawm após 3s, spawn protegido, limite de kills.
 */

import { Room } from './room.js';
import { T, send } from '../protocol.js';
import { buildWorld } from '../world/world.js';
import { WEAPONS } from '../weapons.js';
import { makeRng, rngPick, dist2D, findFreeSpot } from '../util.js';

const TEAM_COLORS = [0x3fbf4f, 0xe8c33a];   // verde, amarelo

export class DMRoom extends Room {
  constructor(salaId, manager) {
    super(salaId, manager, 'dm');
    this.world = buildWorld();
    this.spawns = this._makeSpawns();
    this.respawnQueue = new Map();   // id -> tempo restante
  }

  _makeSpawns() {
    // 8 pontos espalhados pela cidade, sempre em ruas (nunca dentro de prédio)
    const pts = [
      [-160, -160], [160, -160], [-160, 160], [160, 160],
      [-40, -40], [40, 40], [-200, 0], [200, 0],
    ];
    const out = [];
    for (const [x, z] of pts) {
      if (!this.world.col.isBlocked(x, z, 0.6)) {
        out.push({ x, z, y: this.world.col.groundHeightAt(x, z) });
      }
    }
    return out;
  }

  _spawnPoint(p) {
    // time par: índice pelo id para distribuir nos dois lados
    const idx = Math.abs(p.id) % Math.max(1, this.spawns.length);
    const s = this.spawns[idx] || this.spawns[0];
    return s;
  }

  _spawn(p) {
    super._spawn(p);
    p.team = (Math.abs(p.id) % 2) === 0 ? 0 : 1;
    p.arma = 'pistola';
  }

  _step(dt) {
    // respawns pendentes
    for (const [id, t] of [...this.respawnQueue]) {
      const novo = t - dt;
      if (novo <= 0) {
        this.respawnQueue.delete(id);
        const p = this.players.get(id) || this.bots.get(id);
        if (p) this._spawn(p);
      } else {
        this.respawnQueue.set(id, novo);
      }
    }

    // processa jogadores humanos
    for (const p of this.players.values()) {
      if (p.body) {
        if (p.invuln > 0) p.invuln -= dt;
        // inputs chegam via _onInput (websocket); aqui só decai invuln
      }
    }
    for (const b of this.bots.values()) {
      if (b.think) b.think(dt, this);
      if (b.body && b.invuln > 0) b.invuln -= dt;
    }

    // fim de partida por limite de kills
    for (const p of this._all()) {
      if (p.kills >= this.cfg.killLimit) {
        this._endGame(p);
        return;
      }
    }
    if (this.elapsed >= this.cfg.timeLimit) {
      const best = [...this._all()].sort((a, b) => b.kills - a.kills)[0];
      this._endGame(best);
    }
  }

  _onKill(morto, por) {
    // agenda respawn (DM tem respawn)
    if (this.state === 'playing') {
      this.respawnQueue.set(morto.id, this.cfg.respawnTime);
      this._sendTo(morto, T.RESPAWN, { id: morto.id, t: this.cfg.respawnTime });
    }
  }

  _endGame(vencedor) {
    this.state = 'ended';
    this._bcast(T.WINNER, { id: vencedor.id, nick: vencedor.nick, kills: vencedor.kills });
    this._log('fim: ' + vencedor.nick + ' venceu com ' + vencedor.kills + ' kills');
    // fecha a sala após 10s
    setTimeout(() => {
      this.manager.remove(this.salaId);
      this.stop();
    }, 10_000);
  }
}
