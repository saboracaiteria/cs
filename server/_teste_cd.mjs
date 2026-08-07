// Teste do countdown: com a correção, o servidor reenvia o LOBBY 1x/s com o
// número DECRESCENDO (senão a tela fica presa em "Partida em 10s…").
// Rode com cwd=server:  node _teste_cd.mjs
import WebSocket from 'ws';

const URL = 'ws://localhost:3000/ws';
const T = { HELLO: 'hello', WELCOME: 'welcome', LOBBY: 'lobby', READY: 'ready', START: 'start', GAME_START: 'gameStart' };

let erros = 0;
const ok = (m) => console.log('  ✅', m);
const falha = (m) => { erros++; console.log('  ❌', m); };
const esperar = (cond, ms) => new Promise((res) => {
  const t0 = Date.now();
  const iv = setInterval(() => { if (cond()) { clearInterval(iv); res(true); } else if (Date.now() - t0 > ms) { clearInterval(iv); res(false); } }, 50);
});

const ws = new WebSocket(URL);
const logs = [];
ws.on('message', (d) => { try { logs.push(JSON.parse(d.toString())); } catch {} });
ws.on('open', () => ws.send(JSON.stringify({ t: T.HELLO, nick: 'Ivo', modo: 'dm', v: 1 })));

const okW = await esperar(() => logs.some((m) => m.t === T.WELCOME), 5000);
if (!okW) { falha('sem WELCOME'); process.exit(1); }
ws.send(JSON.stringify({ t: T.READY }));
ws.send(JSON.stringify({ t: T.START }));

// coleta os countdowns por ~5s (deve variar: 10, 9, 8, 7…)
const vistos = new Set();
const t0 = Date.now();
while (Date.now() - t0 < 5000) {
  await new Promise((r) => setTimeout(r, 250));
  for (const m of logs) {
    if (m.t === T.LOBBY && m.state === 'countdown' && m.countdown != null) vistos.add(m.countdown);
  }
}
if (vistos.size < 3) falha(`countdown não variou (vistos: ${[...vistos].sort((a, b) => a - b).join(', ')})`);
else ok(`countdown decrementa na tela: ${[...vistos].sort((a, b) => a - b).join(' → ')}`);

const gs = await esperar(() => logs.some((m) => m.t === T.GAME_START), 12000);
if (!gs) falha('sem GAME_START');
else ok('GAME_START chegou');

console.log(erros === 0 ? '\nRESULTADO: COUNTDOWN OK ✅' : `\nRESULTADO: ${erros} ERRO(S) ❌`);
ws.close();
process.exit(erros === 0 ? 0 : 1);
