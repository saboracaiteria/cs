// Teste de cenários: BR completo, versão errada, flood, HELLO inválido, LEAVE
import WebSocket from 'ws';

const URL = 'ws://localhost:3000/ws';
const T = { HELLO: 'hello', INPUT: 'input', READY: 'ready', LEAVE: 'leave', CHAT: 'chat', ERROR: 'error' };
let falhas = 0;

function log(msg) { console.log('[teste]', msg); }
function check(cond, nome) { log((cond ? 'PASSOU' : 'FALHOU') + ': ' + nome); if (!cond) falhas++; }

function conectar(nome) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    const bag = { msgs: [], close: null, erros: 0 };
    ws.on('message', (d) => { try { bag.msgs.push(JSON.parse(d.toString())); } catch { bag.erros++; } });
    ws.on('close', (c, r) => { bag.close = { c, r: r.toString() }; resolve(bag); });
    ws.on('error', () => { bag.erros++; });
    ws.on('open', () => { bag.ws = ws; resolve(bag); });
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- 1. BR completo
log('=== TESTE 1: Battle Royale ===');
{
  const bag = await conectar('br');
  bag.ws.send(JSON.stringify({ t: T.HELLO, nick: 'BRTeste', modo: 'br', v: 1 }));
  await sleep(1500);
  const welcome = bag.msgs.find(m => m.t === 'welcome');
  check(!!welcome, 'recebeu WELCOME no BR');
  if (welcome) log('  cfg BR: max=' + welcome.cfg.maxPlayers + ' tick=' + welcome.cfg.tickRate + ' version=' + welcome.cfg.version);
  const lobbys = bag.msgs.filter(m => m.t === 'lobby');
  const ultimoLobby = lobbys[lobbys.length - 1];
  check(!!ultimoLobby && ultimoLobby.jogadores.length >= 10, 'lobby preenchido com bots (>=10): ' + (ultimoLobby ? ultimoLobby.jogadores.length : 0));
  const host = ultimoLobby && ultimoLobby.jogadores.find(j => j.host);
  check(!!host, 'host definido');
  bag.ws.send(JSON.stringify({ t: T.READY }));
  await sleep(8000);   // countdown = 5s + margem
  const gs = bag.msgs.find(m => m.t === 'gameStart');
  check(!!gs, 'partida BR iniciou (gameStart)');
  // pular do avião (jump), atirar e pegar loot
  const iv = setInterval(() => {
    bag.ws.send(JSON.stringify({ t: T.INPUT, seq: 1, yaw: 1.2, pitch: 0.1, moveX: 0, moveZ: 1, run: false, jump: true, fire: true, ads: false }));
  }, 200);
  await sleep(5000);
  clearInterval(iv);
  bag.ws.send(JSON.stringify({ t: T.INPUT, seq: 2, yaw: 1.2, pitch: 0.1, moveX: 0, moveZ: 1, run: false, jump: false, fire: false, ads: false }));
  await sleep(2000);
  const snaps = bag.msgs.filter(m => m.t === 'snap');
  const zones = bag.msgs.filter(m => m.t === 'zone');
  log('  snaps=' + snaps.length + ' zones=' + zones.length + ' loot=' + bag.msgs.filter(m => m.t === 'lootList').length + ' damages=' + bag.msgs.filter(m => m.t === 'damage').length);
  check(snaps.length > 10, 'recebendo snapshots BR');
  bag.ws.send(JSON.stringify({ t: T.LEAVE }));
  await sleep(300);
  bag.ws.close();
}

// ---------------------------------------------------------------- 2. Versão incompatível
log('=== TESTE 2: versão incompatível ===');
{
  const bag = await conectar('v2');
  bag.ws.send(JSON.stringify({ t: T.HELLO, nick: 'Velho', modo: 'dm', v: 999 }));
  await sleep(800);
  const err = bag.msgs.find(m => m.t === 'error');
  check(!!err, 'recebeu ERROR de versão: ' + (err ? err.msg : 'nenhum'));
  check(bag.close && bag.close.c === 4001, 'fechado com code 4001 (veio: ' + (bag.close ? bag.close.c : '?') + ')');
}

// ---------------------------------------------------------------- 3. HELLO inválido (sem nick / nick malicioso)
log('=== TESTE 3: nick sanitizado ===');
{
  const bag = await conectar('nick');
  bag.ws.send(JSON.stringify({ t: T.HELLO, nick: '<script>alert(1)</script>', modo: 'dm', v: 1 }));
  await sleep(1200);
  const welcome = bag.msgs.find(m => m.t === 'welcome');
  check(!!welcome, 'aceito mesmo com nick malicioso');
  const lobbyMsg = bag.msgs.find(m => m.t === 'lobby');
  const meu = lobbyMsg && lobbyMsg.jogadores.find(j => !j.bot);
  check(meu && !meu.nick.includes('<') && meu.nick !== '<script>alert(1)</script>', 'nick sanitizado (sem <>): ' + (meu ? meu.nick : '?'));
  bag.ws.close();
}

// ---------------------------------------------------------------- 4. Flood
log('=== TESTE 4: anti-flood ===');
{
  const bag = await conectar('flood');
  bag.ws.send(JSON.stringify({ t: T.HELLO, nick: 'Flooder', modo: 'dm', v: 1 }));
  await sleep(500);
  for (let i = 0; i < 500; i++) {
    bag.ws.send(JSON.stringify({ t: T.CHAT, msg: 'spam ' + i }));
  }
  await sleep(1200);
  check(bag.close && bag.close.c === 4008, 'fechado por flood (4008) (veio: ' + (bag.close ? bag.close.c : 'não fechou') + ')');
}

// ---------------------------------------------------------------- 5. JSON inválido não derruba servidor
log('=== TESTE 5: mensagem corrompida ===');
{
  const bag = await conectar('lixo');
  bag.ws.send('{isso não é json!!!');
  await sleep(500);
  bag.ws.send(JSON.stringify({ t: T.HELLO, nick: 'Sobreviveu', modo: 'dm', v: 1 }));
  await sleep(1200);
  const welcome = bag.msgs.find(m => m.t === 'welcome');
  check(!!welcome, 'servidor sobreviveu a JSON inválido e respondeu WELCOME');
  bag.ws.close();
}

log(falhas === 0 ? 'RESULTADO FINAL: TODOS OS CENÁRIOS PASSAram' : 'RESULTADO FINAL: ' + falhas + ' FALHA(S)');
process.exit(falhas === 0 ? 0 : 1);
