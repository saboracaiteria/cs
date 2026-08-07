/**
 * Gerenciador de salas — cria salas DM e BR, emparelha jogadores.
 * Um servidor só, dois tipos de sala (como pedido: "servidor separando
 * multiplayer e BR" = salas separadas no mesmo processo).
 */

import { MODES } from '../config.js';
import { T, send } from '../protocol.js';

let idCounter = 1;

export class RoomManager {
  constructor() {
    this.rooms = new Map();   // salaId -> Room
  }

  create(modo) {
    const cfg = MODES[modo];
    if (!cfg) throw new Error('modo inválido: ' + modo);
    const salaId = makeCode();
    const Room = modo === 'br' ? this._brRoom : this._dmRoom;
    const room = new Room(salaId, this);
    this.rooms.set(salaId, room);
    return room;
  }

  /** Define as classes de sala (injetadas pelo index.js para evitar ciclos). */
  setRoomClasses({ dm, br }) {
    this._dmRoom = dm;
    this._brRoom = br;
  }

  find(modo) {
    for (const r of this.rooms.values()) {
      if (r.modo === modo && r.canJoin()) return r;
    }
    return null;
  }

  get(salaId) { return this.rooms.get(salaId); }

  remove(salaId) {
    this.rooms.delete(salaId);
  }

  /**
   * Registra um jogador em uma sala (cria se preciso).
   * `codigo` opcional: entra na sala ESPECÍFICA do amigo (matchmaking por
   * código — sem isto cada humano caía numa sala nova e ninguém se achava).
   */
  join(client, nick, modo, codigo = null) {
    let room = codigo ? this.get(String(codigo).trim().toUpperCase()) : null;
    if (!room || !room.canJoin()) room = this.find(modo);
    if (!room) room = this.create(modo);
    room.addClient(client, nick);
    return room;
  }

  /** Resumo das salas para debug/admin. */
  summary() {
    const out = [];
    for (const r of this.rooms.values()) {
      out.push({ sala: r.salaId, modo: r.modo, jogadores: r.players.size, bot: r.bots.size });
    }
    return out;
  }
}

/** Código curto de sala (ex: "AB12"). */
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}
