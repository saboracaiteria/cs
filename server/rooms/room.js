/**
 * Sala base — lobby, tick de física, broadcast de snapshot.
 * DM e BR herdam daqui e só acrescentam as regras do modo.
 */

import { NET, MODES } from '../config.js';
import { T, send, lobbyPlayer } from '../protocol.js';
import { stepBody } from '../physics.js';
import { makeRng, findFreeSpot } from '../util.js';

let uid = 1000;

export class Room {
  constructor(salaId, manager, modo) {
    this.salaId = salaId;
    this.manager = manager;
    this.modo = modo;
    this.cfg = MODES[modo];

    this.players = new Map();   // id -> { client, nick, pronto, host, body, hp, ... }
    this.bots = new Map();      // id -> bot
    this.seq = 0;
    this.state = 'lobby';       // lobby | countdown | playing | ended
    this.countdownT = 0;
    this.elapsed = 0;
    this.world = null;          // preenchido no startGame
    this._lastTick = Date.now();

    this._inputLog = new Map(); // anti-flood: id -> {count, t0}
  }

  canJoin() {
    return this.state === 'lobby' && this.players.size + this.bots.size < this.cfg.maxPlayers;
  }

  get totalSlots() { return this.players.size + this.bots.size; }

  /** Jogador humano entra (vindo do WebSocket). */
  addClient(client, nick) {
    const id = uid++;
    const p = lobbyPlayer(id, nick, { host: this.players.size === 0 && this.bots.size === 0 });
    p.client = client;
    p.body = null;
    p.hp = 100;
    p.kills = 0;
    p.deaths = 0;
    p.invuln = 0;
    p.arma = 'pistola';
    p.ping = 0;
    client._room = this;
    client._playerId = id;
    this.players.set(id, p);
    this._sendTo(p, T.WELCOME, { id, salaId: this.salaId, modo: this.modo, cfg: this.publicCfg() });
    this._bcastLobby();
    this._log('entrou: ' + nick + ' (id ' + id + ')');
    return p;
  }

  /** Bot entra (id negativo para não colidir com humanos). */
  addBot(bot) {
    const id = -(uid++);
    bot.id = id;
    bot.pronto = true;
    bot.host = false;
    bot.hp = 100;
    bot.kills = 0;
    bot.deaths = 0;
    bot.invuln = 0;
    bot.arma = 'pistola';
    this.bots.set(id, bot);
    this._bcastLobby();
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (p) {
      if (p.client) { p.client._room = null; p.client._playerId = null; }
      this.players.delete(id);
    } else {
      this.bots.delete(id);
    }
    this._bcast(T.PLAYER_LEFT, { id });
    this._log('saiu: id ' + id);
    if (this.players.size === 0 && this.bots.size === 0) {
      this.manager.remove(this.salaId);
      this.stop();
    } else if (this.state === 'lobby') {
      // transfere host para o primeiro humano restante
      const first = this.players.values().next().value;
      if (first && !first.host) {
        first.host = true;
        this._bcastLobby();
      }
    }
  }

  ready(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.pronto = !p.pronto;
    if (p.host && p.pronto) {
      const humans = [...this.players.values()];
      if (humans.length > 0 && humans.every((h) => h.pronto)) {
        this.start(id);
        return;
      }
    }
    this._bcastLobby();
  }

  /** Host inicia (só quando todos os humanos estão prontos). */
  start(id) {
    if (this.state !== 'lobby') return;
    const p = this.players.get(id);
    if (!p || !p.host) return;
    const humans = [...this.players.values()];
    if (humans.length === 0) return;
    // aguarda os humanos marcarem pronto? simplificação: host pode iniciar com 1
    if (humans.some((h) => !h.pronto)) {
      send(p.client, { t: T.ERROR, msg: 'Aguardando todos marcarem PRONTO' });
      return;
    }
    this.state = 'countdown';
    this.countdownT = 5;
    this._bcastLobby();
    this._log('contagem para iniciar...');
  }

  tick() {
    const now = Date.now();
    if (this._lastTick == null) this._lastTick = now;
    const dt = Math.min(0.1, (now - this._lastTick) / 1000);
    this._lastTick = now;

    if (this.state === 'countdown') {
      this.countdownT -= dt;
      if (this.countdownT <= 0) this._beginGame();
      return;
    }
    if (this.state !== 'playing') return;

    this.elapsed += dt;
    this._step(dt);
    this._broadcastSnapshot();
  }

  _beginGame() {
    this.state = 'playing';
    this.seq = 0;
    this.elapsed = 0;
    this._setupWorld();
    this._spawnAll();
    this._bcast(T.GAME_START, {
      modo: this.modo,
      seed: 20260725,
      jogadores: this._all().map((p) => ({ id: p.id, nick: p.nick, bot: !!this.bots.get(p.id) })),
    });
    this._log('partida iniciada!');
  }

  // ------------------------------ hooks que DM/BR sobrescrevem
  _setupWorld() {}
  _step(dt) {}
  _spawnPoint(p) { return findFreeSpot(this.world.col, 0, 0); }
  _onEnd() {}

  // ------------------------------ utilitários
  _all() {
    return [...this.players.values(), ...this.bots.values()];
  }

  _alive() {
    return this._all().filter((p) => p.hp > 0);
  }

  _spawnAll() {
    for (const p of this._all()) this._spawn(p);
  }

  _spawn(p) {
    const pt = this._spawnPoint(p);
    p.body = {
      pos: { x: pt.x, y: pt.y, z: pt.z },
      vel: { x: 0, y: 0, z: 0 },
      yaw: Math.atan2(-pt.x, -pt.z),
      pitch: 0,
      onGround: true,
    };
    p.hp = 100;
    p.invuln = 3;
    p.arma = 'pistola';
    this._sendTo(p, T.SPAWN, { id: p.id, x: pt.x, y: pt.y, z: pt.z, yaw: p.body.yaw });
    if (p.id > 0) {
      this._bcast(T.RESPAWN, { id: p.id, x: pt.x, y: pt.y, z: pt.z, yaw: p.body.yaw, invuln: 3 });
    }
  }

  _applyInput(p, msg) {
    if (!p.body) return;
    const r = stepBody(this.world, p.body, {
      moveX: clampNum(msg.moveX, -1, 1),
      moveZ: clampNum(msg.moveZ, -1, 1),
      yaw: msg.yaw ?? p.body.yaw,
      pitch: msg.pitch ?? p.body.pitch,
      run: !!msg.run,
      jump: !!msg.jump,
    }, 1 / NET.tickRate);
    p.body.moveX = clampNum(msg.moveX, -1, 1);
    p.body.moveZ = clampNum(msg.moveZ, -1, 1);
    if (r.fallDamage > 0) this._damage(p, null, r.fallDamage, 'queda');
  }

  _damage(alvo, por, dmg, arma = 'arma') {
    if (!alvo || alvo.hp <= 0) return;
    if (alvo.invuln > 0 && por) return;   // spawn protegido
    alvo.hp = Math.max(0, alvo.hp - dmg);
    this._bcast(T.DAMAGE, {
      alvo: alvo.id, por: por ? por.id : null, dmg, hp: alvo.hp,
      direcao: alvo.body ? { x: alvo.body.pos.x, z: alvo.body.pos.z } : { x: 0, z: 0 },
    });
    if (alvo.hp <= 0) this._kill(alvo, por, arma);
  }

  _kill(morto, por, arma) {
    if (morto.deaths != null) morto.deaths++;
    if (por && por.kills != null && por !== morto) por.kills++;
    this._bcast(T.DEATH, { id: morto.id, por: por ? por.id : null, arma });
    if (por && por !== morto) this._bcast(T.KILL, { id: morto.id, por: por.id, arma });
    this._onKill(morto, por);
  }

  _onKill(morto, por) {}

  _bcastLobby() {
    const humans = [...this.players.values()];
    const bots = [...this.bots.values()];
    const todos = [
      ...humans.map((p) => ({ id: p.id, nick: p.nick, pronto: p.pronto, host: p.host, bot: false, ping: p.ping })),
      ...bots.map((b) => ({ id: b.id, nick: b.nick, pronto: true, host: false, bot: true, ping: 0 })),
    ];
    const hostId = humans.find((p) => p.host)?.id ?? null;
    const podeIniciar = humans.length > 0 && humans.every((p) => p.pronto) && this.state === 'lobby';
    this._bcast(T.LOBBY, { jogadores: todos, hostId, podeIniciar, state: this.state, countdown: Math.ceil(this.countdownT) });
  }

  _sendTo(p, t, data) {
    if (p.client && p.client.readyState === 1) send(p.client, { t, ...data });
  }

  _bcast(t, data) {
    const msg = { t, ...data };
    for (const p of this.players.values()) {
      if (p.client) send(p.client, msg);
    }
  }

  _log(...args) {
    console.log(`[sala ${this.salaId} ${this.modo}]`, ...args);
  }

  publicCfg() {
    return {
      modo: this.modo,
      maxPlayers: this.cfg.maxPlayers,
      tickRate: NET.tickRate,
    };
  }


  _broadcastSnapshot() {
    this.seq++;
    const players = this._all().map((p) => ({
      id: p.id,
      nick: p.nick,
      bot: !!this.bots.get(p.id),
      x: p.body ? Math.round(p.body.pos.x*100)/100 : 0,
      y: p.body ? Math.round(p.body.pos.y*100)/100 : 0,
      z: p.body ? Math.round(p.body.pos.z*100)/100 : 0,
      yaw: p.body ? p.body.yaw : 0,
      pitch: p.body ? p.body.pitch : 0,
      hp: Math.round(p.hp ?? 0),
      arma: p.arma || 'pistola',
      kills: p.kills || 0,
      deaths: p.deaths || 0,
      moveX: p.body ? (p.body.moveX||0) : 0,
      moveZ: p.body ? (p.body.moveZ||0) : 0,
    }));
    const snap = { t: T.SNAPSHOT, seq: this.seq, players };
    this._snapExtra(snap);
    this._bcast(T.SNAPSHOT, snap);
  }
  _snapExtra(snap) {}

  stop() {
    this.state = 'ended';
  }
}

function clampNum(v, a, b) {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0;
  return Math.max(a, Math.min(b, v));
}
