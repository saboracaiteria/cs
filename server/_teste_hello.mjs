// Teste do HELLO duplicado: o cliente real manda HELLO no onopen E no replay
// (2x na mesma conexão). O servidor precisa deduplicar — senão o mesmo jogador
// vira 2 players em 2 salas (o "fantasma" da lista ONLINE).
// Rode com cwd=server:  node _teste_hello.mjs
import WebSocket from 'ws';

const URL = 'ws://localhost:3000/ws';
const T = { HELLO: 'hello', WELCOME: 'welcome', LOBBY: 'lobby' };

let erros = 0;
const ok = (m) => console.log('  ✅', m);
const falha = (m) => { erros++; console.log('  ❌', m); };

function esperar(cond, ms) {
  return new Promise((res) => {
    const t0 = Date.now();
    const iv = setInterval(() => { if (cond()) { clearInterval(iv); res(true); } else if (Date.now() - t0 > ms) { clearInterval(iv); res(false); } }, 50);
  });
}

const ws = new WebSocket(URL);
const logs = [];
ws.on('message', (d) => { try { logs.push(JSON.parse(d.toString())); } catch {} });

// simula o ClientNet: HELLO no open e MAIS um logo depois (fila do onopen)
ws.on('open', () => {
  ws.send(JSON.stringify({ t: T.HELLO, nick: 'Eva', modo: 'dm', v: 1 }));
  setTimeout(() => ws.send(JSON.stringify({ t: T.HELLO, nick: 'Eva', modo: 'dm', v: 1 })), 100);
});

const okWelcome = await esperar(() => logs.some((m) => m.t === T.WELCOME), 5000);
if (!okWelcome) { falha('sem WELCOME'); process.exit(1); }

// espera um pouco: se o 2º HELLO não for deduplicado, chega outro WELCOME
await new Promise((r) => setTimeout(r, 800));
const welcomes = logs.filter((m) => m.t === T.WELCOME);
if (welcomes.length !== 1) falha(`recebeu ${welcomes.length} WELCOME (devia ser 1) — fantasma criado`);
else ok('um único WELCOME (HELLO duplicado deduplicado)');

// a lista ONLINE (do próprio LOBBY) não pode conter o próprio jogador 2x
const lobby = logs.filter((m) => m.t === T.LOBBY).pop();
if (!lobby) { falha('sem LOBBY'); process.exit(1); }
const meus = (lobby.online || []).filter((j) => j.nick === 'Eva');
if (meus.length > 1) falha(`Eva aparece ${meus.length}x na lista ONLINE (fantasma)`);
else ok('Eva aparece 1x na lista ONLINE');

// salaId veio no LOBBY (filtro da própria sala no cliente)
if (!lobby.salaId) falha('LOBBY sem salaId (filtro da própria sala quebra)');
else ok(`LOBBY com salaId ${lobby.salaId}`);

console.log(erros === 0 ? '\nRESULTADO: HELLO OK ✅' : `\nRESULTADO: ${erros} ERRO(S) ❌`);
ws.close();
process.exit(erros === 0 ? 0 : 1);
