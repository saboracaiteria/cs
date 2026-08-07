/**
 * Orquestrador do modo multijogador.
 * Fluxo: modeSelect -> ClientNet (hello) -> lobby -> ready/start -> Match.
 */
import { ClientNet } from '../net/client.js';
import { Match } from '../net/match.js';
import { criarLobby } from '../ui/lobby.js';
import { NET_VERSION, T } from '../net/protocol.js';
import { NET } from '../config.js';

/** URL do servidor: sobrescreva com window.__MP_SERVER__ no index.html. */
export function serverUrl() {
  if (window.__MP_SERVER__) return window.__MP_SERVER__;
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'ws://localhost:3000/ws';
  if (NET.wsUrl && !NET.wsUrl.includes('SEU-SERVIDOR')) return NET.wsUrl;
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'; // mesma origem (Render ou outro host)
}

let net = null;
let match = null;
let lobby = null;
let gameRef = null;

export function iniciarMultiplayer(game, modo, nick) {
  gameRef = game;
  if (!lobby) lobby = criarLobby();

  lobby.setNick(nick);
  lobby.mostrar(modo === 'br' ? 'BATTLE ROYALE' : 'MULTIPLAYER');
  lobby.onReady(() => net && net.enviar({ t: T.READY }));
  lobby.onStart(() => net && net.enviar({ t: T.READY }));
  lobby.onLeave(() => sairMultiplayer());

  net = new ClientNet(serverUrl());
  net._onMsg = onMsg;
  net._onStatus = (estado) => {
    if (estado === 'erro') lobby.mostrar('⚠ Sem conexão com o servidor');
  };
  net._onReplay = () => net.enviar({ t: T.HELLO, v: NET_VERSION, nick, modo });
  net.conectar();
  net._onReplay();
}

function onMsg(msg) {
  switch (msg.t) {
    case T.WELCOME:
      net.id = msg.id;
      net.salaId = msg.salaId;
      net.modo = msg.modo;
      net.cfg = msg.cfg;
      break;
    case T.LOBBY:
      lobby.atualizar(msg);
      break;
    case T.GAME_START: {
      lobby.esconder();
      match = new Match(gameRef, net, {
        modo: msg.modo,
        jogadores: msg.jogadores || [],
        meuId: net.id,
        nick: net.nick || 'Jogador',
      });
      match.iniciar();
      break;
    }
    case T.WINNER:
      if (match) match.fimPartida(msg);
      break;
    case T.ERROR:
      lobby.mostrar('⚠ ' + (msg.msg || 'erro'));
      break;
    default:
      if (match && match.tratar) match.tratar(msg);
  }
}

export function sairMultiplayer() {
  if (match) { match.sair(); match = null; }
  if (net) { net.sair(); net = null; }
  if (lobby) lobby.esconder();
}
