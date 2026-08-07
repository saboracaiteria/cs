// Teste do novo fluxo do lobby: 2 jogadores, cada um na SUA sala, um CHAMA o
// outro, o outro ACEITA, os dois marcam pronto, o host INICIA e a partida
// começa com contagem regressiva (GAME_START nos dois).
// Rode com cwd=server:  node _teste_convite.mjs
import WebSocket from 'ws';

const URL = 'ws://localhost:3000/ws';
const T = { HELLO: 'hello', WELCOME: 'welcome', LOBBY: 'lobby', READY: 'ready', START: 'start',
  INVITE: 'invite', ACEITAR: 'aceitar', RECUSAR: 'recusar', INVITE_FIM: 'inviteFim', GAME_START: 'gameStart' };

let erros = 0;
const ok = (m) => console.log('  ✅', m);
const falha = (m) => { erros++; console.log('  ❌', m); };
const log = (quem, m) => console.log(`[${quem}]`, m);

function cliente(nick, fases) {
  const ws = new WebSocket(URL);
  const C = { nick, ws, id: null, salaId: null, fases, passo: 0, timers: [], logs: [] };
  C.enviar = (obj) => ws.send(JSON.stringify(obj));
  C.esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  C.msg = (m) => C.logs.push(m);
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data.toString()); } catch { return; }
    C.msg(m);
    if (fases[C.passo] && fases[C.passo].t === m.t) fases[C.passo].fn(C, m);
  });
  ws.on('error', (e) => falha(`${nick}: WS erro ${e.message}`));
  return C;
}

function esperarCond(cond, ms, oQue) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (cond()) { clearInterval(iv); resolve(true); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); resolve(false); }
    }, 50);
  });
}

function achou(C, t, pred) {
  return C.logs.some((m) => m.t === t && (!pred || pred(m)));
}

// ---------------------------------------------------------------- fluxo
const A = cliente('Ana', []);
const B = cliente('Beto', []);

A.ws.on('open', () => A.enviar({ t: T.HELLO, nick: 'Ana', modo: 'dm', v: 1 }));
B.ws.on('open', () => B.enviar({ t: T.HELLO, nick: 'Beto', modo: 'dm', v: 1 }));

const okWelcomeA = await esperarCond(() => achou(A, T.WELCOME), 5000, 'welcome A');
const okWelcomeB = await esperarCond(() => achou(B, T.WELCOME), 5000, 'welcome B');
if (!okWelcomeA || !okWelcomeB) { falha('alguém não recebeu WELCOME'); process.exit(1); }

A.id = A.logs.find((m) => m.t === T.WELCOME).id;
A.salaId = A.logs.find((m) => m.t === T.WELCOME).salaId;
B.id = B.logs.find((m) => m.t === T.WELCOME).id;
B.salaId = B.logs.find((m) => m.t === T.WELCOME).salaId;
log('A', `id=${A.id} sala=${A.salaId}`);
log('B', `id=${B.id} sala=${B.salaId}`);
if (A.salaId === B.salaId) falha('cada um devia estar na SUA sala (salas iguais!)');
else ok('cada jogador entrou na própria sala');

// B vê A online (e vice-versa)
const lobbyB = await esperarCond(() => achou(B, T.LOBBY, (m) => (m.online || []).some((j) => j.id === A.id)), 5000);
if (!lobbyB) falha('B não vê A na lista ONLINE');
else ok('B vê A na lista ONLINE');

// A chama B
A.enviar({ t: T.INVITE, alvoId: B.id });
const inviteB = await esperarCond(() => achou(B, T.INVITE, (m) => m.de && m.de.id === A.id), 5000);
if (!inviteB) falha('B não recebeu o convite');
else ok(`B recebeu convite de ${B.logs.find((m) => m.t === T.INVITE).de.nick}`);

// B aceita
B.enviar({ t: T.ACEITAR, deId: A.id });
const okWelcome2 = await esperarCond(() => {
  const w = B.logs.filter((m) => m.t === T.WELCOME);
  return w.length >= 2 && w[w.length - 1].salaId === A.salaId;
}, 5000);
if (!okWelcome2) falha('B não foi movido para a sala de A');
else ok(`B movido para a sala de A (${A.salaId})`);
B.salaId = A.salaId;

const fimA = await esperarCond(() => achou(A, T.INVITE_FIM, (m) => m.aceitou && m.nick === 'Beto'), 5000);
if (!fimA) falha('A não recebeu INVITE_FIM aceito');
else ok('A recebeu "Beto aceitou o convite"');

// os dois na MESMA sala, no lobby de A (B ganhou id NOVO ao entrar na sala)
const juntos = await esperarCond(() => {
  const l = A.logs.filter((m) => m.t === T.LOBBY).pop();
  return l && l.jogadores.some((j) => j.nick === 'Beto') && l.jogadores.some((j) => j.nick === 'Ana');
}, 5000);
if (!juntos) falha('A não vê B na própria sala');
else ok('A e B estão juntos na mesma sala');

// B marca pronto, A marca pronto
B.enviar({ t: T.READY });
A.enviar({ t: T.READY });
const prontos = await esperarCond(() => {
  const l = A.logs.filter((m) => m.t === T.LOBBY).pop();
  return l && l.podeIniciar === true;
}, 5000);
if (!prontos) falha('podeIniciar não ficou true com todos prontos');
else ok('todos prontos -> podeIniciar = true');

// A (host) clica INICIAR PARTIDA -> countdown
A.enviar({ t: T.START });
const cd = await esperarCond(() => {
  const l = A.logs.filter((m) => m.t === T.LOBBY).pop();
  return l && l.state === 'countdown' && l.countdown >= 8;
}, 3000);
if (!cd) falha('START não iniciou o countdown');
else ok(`contagem regressiva começou (${A.logs.filter((m) => m.t === T.LOBBY).pop().countdown}s)`);

// ~10s depois: GAME_START nos DOIS
const gsA = await esperarCond(() => achou(A, T.GAME_START), 15000);
const gsB = await esperarCond(() => achou(B, T.GAME_START), 15000);
if (!gsA || !gsB) falha('GAME_START não chegou nos dois');
else ok('GAME_START chegou nos DOIS jogadores');

// ---------------------------------------------------------------- sozinho com bots
const C = cliente('Carol', []);
C.ws.on('open', () => C.enviar({ t: T.HELLO, nick: 'Carol', modo: 'dm', v: 1 }));
const okWelcomeC = await esperarCond(() => achou(C, T.WELCOME), 5000);
if (!okWelcomeC) { falha('Carol não recebeu WELCOME'); process.exit(1); }
C.enviar({ t: T.READY });
C.enviar({ t: T.START });
const cdC = await esperarCond(() => {
  const l = C.logs.filter((m) => m.t === T.LOBBY).pop();
  return l && l.state === 'countdown';
}, 3000);
if (!cdC) falha('sozinho com bots: START não iniciou countdown');
else ok('sozinha com bots: countdown iniciou');
const gsC = await esperarCond(() => achou(C, T.GAME_START), 15000);
if (!gsC) falha('sozinha com bots: sem GAME_START');
else ok('sozinha com bots: GAME_START chegou');

console.log(erros === 0 ? '\nRESULTADO: FLUXO DE CONVITE OK ✅' : `\nRESULTADO: ${erros} ERRO(S) ❌`);
A.ws.close(); B.ws.close(); C.ws.close();
process.exit(erros === 0 ? 0 : 1);
