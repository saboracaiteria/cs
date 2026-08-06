/**
 * Sala base — lobby, tick de física, broadcast de snapshot.
 * DM e BR herdam daqui e só acrescentam as regras do modo.
 */

import { NET, MODES, CAR, NUM_CARS } from '../config.js';
import { T, send, lobbyPlayer } from '../protocol.js';
import { stepBody } from '../physics.js';
import { createCars, updateCars } from '../cars.js';
import { makeRng, findFreeSpot, dist2D } from '../util.js';

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
    this.cars = [];             // veiculos do MP (server/cars.js)
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
    this._stepCars(dt);
    this._broadcastSnapshot();
  }

  _beginGame() {
    this.state = 'playing';
    this.seq = 0;
    this.elapsed = 0;
    this._setupWorld();
    this.cars = createCars(this.world, NUM_CARS);
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
    if (msg.car != null) this._veiculo(p, msg.car);
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

  /** Entra/sai do carro: msg.car = id do carro (entrar) ou 0 (sair). */
  _veiculo(p, alvo) {
    if (!this.cars || this.cars.length === 0) return;
    if (this.flying && this.flying.has(p.id)) return;   // no aviao nao da
    if (!p.body) return;
    if (p.inCar == null) {
      const c = this.cars.find((cc) => cc.id === alvo && cc.playerId == null);
      if (!c) return;
      const d = dist2D(p.body.pos.x, p.body.pos.z, c.x, c.z);
      if (d > CAR.enterRange) return;
      p.inCar = c.id;
      c.playerId = p.id;
      c.inp = { moveX: 0, moveZ: 0 };
      this._bcast(T.CAR_JOIN, { id: p.id, carId: c.id });
    } else {
      this._sairCarro(p);
    }
  }

  _sairCarro(p) {
    const c = this.cars.find((cc) => cc.id === p.inCar);
    if (c) {
      c.playerId = null;
      c.inp = null;
      const pt = findFreeSpot(this.world.col, c.x + 3, c.z + 3, 0.6);
      if (p.body) {
        p.body.pos.x = pt.x;
        p.body.pos.y = pt.y;
        p.body.pos.z = pt.z;
        p.body.vel = { x: 0, y: 0, z: 0 };
      }
    }
    p.inCar = null;
    this._bcast(T.CAR_LEAVE, { id: p.id });
  }

  /** Move os carros dirigidos e faz o motorista acompanhar o carro. */
  _stepCars(dt) {
    if (!this.cars || this.cars.length === 0) return;
    for (const c of this.cars) {
      if (c.playerId == null) { c.inp = null; continue; }
      const p = this._all().find((pp) => pp.id === c.playerId);
      c.inp = p && p.body
        ? { moveX: p.body.moveX || 0, moveZ: p.body.moveZ || 0 }
        : { moveX: 0, moveZ: 0 };
    }
    updateCars(this.world, this.cars, dt);
    for (const p of this._all()) {
      if (p.inCar != null && p.body) {
        const c = this.cars.find((cc) => cc.id === p.inCar);
        if (c) {
          p.body.pos.x = c.x;
          p.body.pos.y = c.y;
          p.body.pos.z = c.z;
          p.body.yaw = c.yaw;
          p.body.pitch = 0;
          p.body.onGround = true;
          p.body.vel = { x: 0, y: 0, z: 0 };
        }
      }
    }
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
    if (morto.inCar != null) this._sairCarro(morto);
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
      inCar: p.inCar ?? null,
    }));
    const snap = { t: T.SNAPSHOT, seq: this.seq, players };
    this._snapExtra(snap);
    snap.cars = this.cars.map((c) => ({
      id: c.id,
      x: Math.round(c.x * 100) / 100,
      y: Math.round(c.y * 100) / 100,
      z: Math.round(c.z * 100) / 100,
      yaw: Math.round(c.yaw * 1000) / 1000,
      speed: Math.round(c.speed * 10) / 10,
      playerId: c.playerId,
      cor: c.cor,
    }));
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
