// Teste rápido: recusar convite — quem chamou deve ser avisado.
// Rode com cwd=server:  node _teste_recusa.mjs
import WebSocket from 'ws';

const URL = 'ws://localhost:3000/ws';
const T = { HELLO: 'hello', WELCOME: 'welcome', INVITE: 'invite', RECUSAR: 'recusar', INVITE_FIM: 'inviteFim' };

let erros = 0;
const ok = (m) => console.log('  ✅', m);
const falha = (m) => { erros++; console.log('  ❌', m); };

function cliente(nick) {
  const ws = new WebSocket(URL);
  const C = { nick, ws, id: null, logs: [] };
  C.enviar = (o) => ws.send(JSON.stringify(o));
  ws.on('message', (d) => { try { C.logs.push(JSON.parse(d.toString())); } catch {} });
  ws.on('open', () => C.enviar({ t: T.HELLO, nick, modo: 'dm', v: 1 }));
  return C;
}
const esperar = (cond, ms) => new Promise((res) => {
  const t0 = Date.now();
  const iv = setInterval(() => { if (cond()) { clearInterval(iv); res(true); } else if (Date.now() - t0 > ms) { clearInterval(iv); res(false); } }, 50);
});
const achou = (C, t, pred) => C.logs.some((m) => m.t === t && (!pred || pred(m)));

const A = cliente('Duda');
const B = cliente('Edu');
await esperar(() => achou(A, T.WELCOME) && achou(B, T.WELCOME), 5000);
A.id = A.logs.find((m) => m.t === T.WELCOME).id;
B.id = B.logs.find((m) => m.t === T.WELCOME).id;

A.enviar({ t: T.INVITE, alvoId: B.id });
const convite = await esperar(() => achou(B, T.INVITE, (m) => m.de && m.de.id === A.id), 5000);
if (!convite) falha('Edu não recebeu o convite');

B.enviar({ t: T.RECUSAR, deId: A.id });
const fim = await esperar(() => achou(A, T.INVITE_FIM, (m) => m.id === B.id && m.aceitou === false), 5000);
if (!fim) falha('Duda não foi avisada da recusa');
else ok(`Duda avisada: "Edu ${A.logs.find((m) => m.t === T.INVITE_FIM).motivo}"`);

// Edu segue na PRÓPRIA sala (não foi movido)
const ainda = A.logs.length && B.logs.some((m) => m.t === T.WELCOME);
if (!ainda) falha('Edu perdeu o WELCOME');
else ok('Edu continuou na própria sala');

console.log(erros === 0 ? 'RESULTADO: RECUSA OK ✅' : `RESULTADO: ${erros} ERRO(S) ❌`);
A.ws.close(); B.ws.close();
process.exit(erros === 0 ? 0 : 1);
