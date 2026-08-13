// Teste E2E da reconexão com token: sobe o servidor real, conecta 2x com o
// MESMO token (simulando queda de rede) e verifica que o botão INICIAR
// continua aparecendo (hostId === meuId) — sem criar player fantasma.
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const PORT = 3457;
const srv = spawn('node', ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let srvErr = '';
srv.stderr.on('data', (d) => { srvErr += d.toString(); });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// espera o /health responder
async function esperaSrv() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/health`);
      if (r.ok) return true;
    } catch {}
    await sleep(300);
  }
  return false;
}

function conecta(token, nick) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const out = { welcome: null, lobby: null, msgs: [] };
    const t = setTimeout(() => { try { ws.terminate(); } catch {} reject(new Error('timeout esperando welcome')); }, 6000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'hello', v: 1, nick, modo: 'dm', cor: 0, cycle: 'ciclo', token }));
    });
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      out.msgs.push(m);
      if (m.t === 'welcome') { out.welcome = m; ws.send(JSON.stringify({ t: 'ready' })); }
      if (m.t === 'lobby' && out.welcome) {
        out.lobby = m;
        clearTimeout(t);
        resolve({ ws, out });
      }
    });
    ws.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

let passou = true;
function check(nome, cond) {
  console.log((cond ? '✅' : '❌') + ' ' + nome);
  if (!cond) passou = false;
}

try {
  if (!await esperaSrv()) throw new Error('servidor não subiu: ' + srvErr);
  console.log('--- 1a conexão (host) ---');
  const c1 = await conecta('TOKEN-AAA', 'Joao');
  check('welcome recebido', !!c1.out.welcome);
  check('é host', c1.out.welcome.host === true);

  console.log('--- queda de rede + reconexão com MESMO token ---');
  const wsVelho = c1.ws;
  const c2 = await conecta('TOKEN-AAA', 'Joao');
  check('welcome2 com MESMO id', c2.out.welcome.id === c1.out.welcome.id);
  check('host2 ainda é true', c2.out.welcome.host === true);
  check('hostId === meuId (botão INICIAR aparece)', c2.out.lobby.hostId === c2.out.welcome.id);
  check('podeIniciar = true (todos prontos)', c2.out.lobby.podeIniciar === true);

  console.log('--- fechamento do ws VELHO (onclose protegido) ---');
  wsVelho.terminate();
  await sleep(800);
  const c3 = await conecta('TOKEN-AAA', 'Joao');
  check('após close do ws velho, id continua o mesmo', c3.out.welcome.id === c1.out.welcome.id);
  check('hostId === meuId após ws velho fechar', c3.out.lobby.hostId === c3.out.welcome.id);

  c4cleanup:
  {
    const c4 = await conecta('TOKEN-CCC', 'Zeca');
    check('Zeca entra na MESMA sala do Joao (sala compartilhada)', c4.out.welcome.salaId === c3.out.welcome.salaId);
    check('Zeca NAO e host (Joao mantem host)', c4.out.welcome.host === false);
    c4.ws.terminate();
  }
  c2.ws.terminate();
  c3.ws.terminate();

  console.log(passou ? '\n🎉 TODOS OS TESTES PASSARAM' : '\n💥 HOUVE FALHAS');
} catch (e) {
  console.error('ERRO no teste:', e.message);
  if (srvErr) console.error('stderr do servidor:', srvErr.slice(0, 500));
  passou = false;
} finally {
  srv.kill('SIGTERM');
  setTimeout(() => process.exit(passou ? 0 : 1), 200);
}
