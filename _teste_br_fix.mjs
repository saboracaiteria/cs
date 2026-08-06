// Teste do fix do BR: jogador no avião não toma dano de zona, bots pulam,
// partida não termina sozinha, paraquedas deixa a queda suave.
import WebSocket from 'ws';

const URL = 'ws://localhost:3000/ws';
let falhas = 0;

function log(msg) { console.log('[teste-br]', msg); }
function check(cond, nome) { log((cond ? 'PASSOU' : 'FALHOU') + ': ' + nome); if (!cond) falhas++; }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ws = new WebSocket(URL);
const msgs = [];
let erros = 0;
ws.on('message', (d) => { try { msgs.push(JSON.parse(d.toString())); } catch { erros++; } });
ws.on('error', () => { erros++; });

await new Promise((r) => ws.on('open', r));
log('conectado');

ws.send(JSON.stringify({ t: 'hello', nick: 'BRFix', modo: 'br', v: 1 }));
await sleep(1500);
check(msgs.some(m => m.t === 'welcome'), 'WELCOME no BR');

ws.send(JSON.stringify({ t: 'ready' }));
await sleep(8000);   // countdown 5s + margem
check(msgs.some(m => m.t === 'gameStart'), 'partida BR iniciou');

const meu = () => {
  const snaps = msgs.filter(m => m.t === 'snap');
  const s = snaps[snaps.length - 1];
  return s && s.players.find(p => p.id > 0);
};
const ultimoSnap = () => {
  const snaps = msgs.filter(m => m.t === 'snap');
  return snaps[snaps.length - 1];
};

// ---- 1. Fica no avião: NÃO pode tomar dano de zona nem receber WINNER
await sleep(15000);
{
  const eu = meu();
  log('  aviao: y=' + (eu ? eu.y : '?') + ' hp=' + (eu ? eu.hp : '?'));
  check(!msgs.some(m => m.t === 'winner'), 'sem WINNER prematuro (15s no avião)');
  check(eu && eu.hp >= 100, 'no avião não toma dano de zona (hp=' + (eu ? eu.hp : '?') + ')');
  check(eu && eu.y > 60, 'continua no avião sem pular (y=' + (eu ? eu.y : '?') + ')');
}

// ---- 2. Espera o avião cruzar a cidade: bots pulam e pousam vivos
{
  let botsNoChao = 0, espera = 0;
  while (espera < 40000) {
    await sleep(5000);
    espera += 5000;
    const s = ultimoSnap();
    if (!s) continue;
    const bots = s.players.filter(p => p.id < 0);
    botsNoChao = bots.filter(b => b.y < 40 && b.hp > 0).length;
    if (botsNoChao >= 3) break;
  }
  const eu = meu();
  log('  aviao após ' + Math.round(espera / 1000) + 's: x/z=' + (eu ? Math.round(eu.x) + ',' + Math.round(eu.z) : '?') + ' hp=' + (eu ? eu.hp : '?'));
  log('  bots no chão vivos: ' + botsNoChao);
  check(!msgs.some(m => m.t === 'winner'), 'partida segue viva (sem WINNER)');
  check(eu && eu.hp >= 100, 'continua sem dano no avião (hp=' + (eu ? eu.hp : '?') + ')');
  check(botsNoChao >= 3, 'bots pularam do avião e pousaram vivos (>=3)');
}

// ---- 3. Pula do avião (já sobre a cidade): queda suave, sem dano
{
  const antes = meu();
  ws.send(JSON.stringify({ t: 'input', seq: 1, yaw: 0.8, pitch: 0.1, moveX: 0, moveZ: 1, run: false, jump: true, fire: false, ads: false }));
  const iv = setInterval(() => {
    ws.send(JSON.stringify({ t: 'input', seq: 2, yaw: 0.8, pitch: 0.1, moveX: 0, moveZ: 1, run: false, jump: false, fire: false, ads: false }));
  }, 150);
  await sleep(4000);   // caindo de paraquedas
  clearInterval(iv);

  const eu = meu();
  log('  queda: y=' + (eu ? eu.y : '?') + ' hp=' + (eu ? eu.hp : '?') + ' (pulou de ' + (antes ? antes.y : '?') + ')');
  check(eu && eu.y < 60, 'pulou e está caindo (y=' + (eu ? eu.y : '?') + ')');
  check(eu && eu.hp >= 95, 'queda de paraquedas sem dano (hp=' + (eu ? eu.hp : '?') + ')');
}

// ---- 4. Pousa: vivo, sem morte de queda, partida segue
{
  await sleep(14000);
  const eu = meu();
  const mortes = msgs.filter(m => m.t === 'death' && m.id > 0);
  log('  pouso: y=' + (eu ? eu.y : '?') + ' hp=' + (eu ? eu.hp : '?') + ' mortesDoJogador=' + mortes.length);
  check(eu && eu.hp > 0, 'pousou VIVO (hp=' + (eu ? eu.hp : '?') + ')');
  check(mortes.length === 0, 'nenhuma morte de queda/aviao do jogador');
  check(!msgs.some(m => m.t === 'winner'), 'partida continua (sem WINNER)');
}

ws.close();
log(erros === 0 && falhas === 0 ? 'RESULTADO: TODOS OS CHECKS DO BR PASSARAM' : 'RESULTADO: ' + falhas + ' FALHA(S), ' + erros + ' msg(s) inválida(s)');
process.exit(falhas === 0 && erros === 0 ? 0 : 1);
