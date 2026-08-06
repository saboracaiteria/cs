// Teste do servidor WebSocket — conecta, entra em sala DM, envia INPUT/READY/CHAT e observa erros
import WebSocket from 'ws';

const URL = 'ws://localhost:3000/ws';
const T = { HELLO: 'hello', WELCOME: 'welcome', LOBBY: 'lobby', GAME_START: 'gameStart', READY: 'ready', INPUT: 'input', SNAP: 'snap', SPAWN: 'spawn', CHAT: 'chat', ERROR: 'error', PING: 'ping', PONG: 'pong', DEATH: 'death', KILL: 'kill', DAMAGE: 'damage', ZONE: 'zone' };

const ws = new WebSocket(URL);
let erros = 0;
let received = 0;
const tiposRecebidos = new Map();

function log(msg) { console.log('[teste]', msg); }

ws.on('open', () => {
  log('conectado, enviando HELLO (nick=Testador, modo=dm, v=1)');
  ws.send(JSON.stringify({ t: T.HELLO, nick: 'Testador', modo: 'dm', v: 1 }));
});

ws.on('message', (data) => {
  let m;
  try { m = JSON.parse(data.toString()); } catch { log('MENSAGEM NÃO-JSON: ' + data.toString().slice(0, 120)); erros++; return; }
  received++;
  tiposRecebidos.set(m.t, (tiposRecebidos.get(m.t) || 0) + 1);

  if (m.t === T.WELCOME) {
    log('WELCOME: id=' + m.id + ' nick=' + m.nick + ' modo=' + m.modo + ' cfg=' + JSON.stringify(m.cfg || {}).slice(0, 200));
    // envia READY depois de 1s
    setTimeout(() => { log('enviando READY'); ws.send(JSON.stringify({ t: T.READY })); }, 1000);
  }
  if (m.t === T.LOBBY) { log('LOBBY: jogadores=' + JSON.stringify((m.jogadores || []).map(j => j.nick + (j.bot ? '(bot)' : '') + (j.pronto ? '*' : '')))); }
  if (m.t === T.GAME_START) { log('GAME_START: seed=' + m.seed + ' jogadores=' + (m.jogadores || []).length); }
  if (m.t === T.ERROR) { log('ERRO DO SERVIDOR: ' + JSON.stringify(m)); erros++; }
  if (m.t === T.SNAP) {
    // envia INPUT contínuo por 3s
    if (!sentInput) {
      sentInput = true;
      log('recebendo SNAP (simulação rodando)');
      const iv = setInterval(() => {
        ws.send(JSON.stringify({ t: T.INPUT, seq: 1, yaw: 1.2, pitch: 0.1, moveX: 0, moveZ: 1, run: false, jump: false, fire: false, ads: false }));
      }, 100);
      setTimeout(() => {
        clearInterval(iv);
        ws.send(JSON.stringify({ t: T.CHAT, msg: 'olá do teste' }));
        setTimeout(() => { log('fim do teste — fechando'); ws.close(); }, 500);
      }, 3000);
    }
  }
});

let sentInput = false;

ws.on('close', (code, reason) => {
  log('fechado code=' + code + ' reason=' + reason.toString());
  log('total msgs recebidas=' + received + ', por tipo=' + JSON.stringify([...tiposRecebidos.entries()]));
  log(erros === 0 ? 'RESULTADO: SEM ERROS NO FLUXO TESTADO' : 'RESULTADO: ' + erros + ' ERRO(S) ENCONTRADO(S)');
  process.exit(erros === 0 ? 0 : 1);
});

ws.on('error', (e) => { log('ERRO WS: ' + e.message); erros++; });

setTimeout(() => { log('TIMEOUT GLOBAL 15s — encerrando'); try { ws.close(); } catch {} }, 15000);
