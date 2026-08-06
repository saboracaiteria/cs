// Teste REAL via WebSocket contra o servidor HTTP (porta 3000):
// entra numa sala BR, NÃO pula (fica no avião), confere que não morre,
// depois pula e confere a queda de paraquedas e o pouso sem morte.
import WebSocket from 'ws';

const URL = 'ws://localhost:3000/ws';
const T = {
  HELLO: 'hello', INPUT: 'input', READY: 'ready',
  WELCOME: 'welcome', LOBBY: 'lobby', GAME_START: 'gameStart', SNAPSHOT: 'snap',
  DEATH: 'death', KILL: 'kill', WINNER: 'winner', SPAWN: 'spawn', ERROR: 'error',
};

let falhas = 0;
let acertos = 0;
function check(nome, cond, extra = '') {
  if (cond) { acertos++; console.log(`  ✔ ${nome}`); }
  else { falhas++; console.log(`  ✘ ${nome} ${extra}`); }
}

const ws = new WebSocket(URL);
let meuId = null; // preenchido no welcome
const snapshots = [];
const eventos = [];
let partidaComecou = false;
let pulou = false;
let pousou = false;
let minY = 9999;

function enviar(obj) { ws.send(JSON.stringify(obj)); }

function lerEu(snap) {
  return (snap.players || []).find((p) => p.id === meuId);
}

function aguardar(ms) { return new Promise((r) => setTimeout(r, ms)); }

ws.on('message', (data) => {
  let msg;
  try { msg = JSON.parse(data.toString()); } catch { return; }
  if (msg.t === T.WELCOME) meuId = msg.id;
  if (msg.t === T.ERROR) eventos.push('erro: ' + msg.msg);
  if (msg.t === T.DEATH && msg.id === meuId) eventos.push('MORRI por ' + (msg.por ?? 'zona'));
  if (msg.t === T.WINNER) eventos.push('WINNER: ' + (msg.nick || msg.id));
  if (msg.t === T.SPAWN && msg.aviao) eventos.push('avião spawn: ' + msg.x + ',' + msg.z + ' y=' + msg.y);
  if (msg.t === T.SNAPSHOT) {
    snapshots.push(msg);
    if (!partidaComecou && msg.players && msg.players.length) partidaComecou = true;
    const eu = lerEu(msg);
    if (eu) {
      if (eu.y < minY) minY = eu.y;
      if (!pulou && eu.y < 40) { pulou = true; eventos.push('caiu para y<40 (pulou?)'); }
      if (pulou && !pousou && eu.y < 5) { pousou = true; eventos.push('pousou em y=' + eu.y); }
    }
  }
});

ws.on('open', () => {
  console.log('conectado, enviando hello br...');
  enviar({ t: T.HELLO, v: 1, nick: 'BRReal', modo: 'br' });
});

// espera welcome
await new Promise((r) => { ws.once('message', (d) => { r(); }); });
await aguardar(400);
console.log('marcando pronto (inicia a partida)...');
enviar({ t: T.READY });

// aguarda GAME_START (countdown 5s) + primeiros snapshots
let iniciou = false;
for (let i = 0; i < 80 && !iniciou; i++) {
  await aguardar(100);
  iniciou = snapshots.some((s) => s.players && s.players.length > 1);
}
check('partida iniciou (snapshots com jogadores)', iniciou);

// FASE 1: 20s NO AVIÃO SEM PULAR — hp deve ficar 100 o tempo todo
console.log('FASE 1: 20s no avião sem pular...');
let hpMin = 999;
for (let t = 0; t < 20; t += 0.5) {
  enviar({ t: T.INPUT, seq: t * 10, yaw: 0, pitch: 0, moveX: 0, moveZ: 0, run: false, jump: false, fire: false, ads: false });
  await aguardar(500);
  const snap = snapshots[snapshots.length - 1];
  const eu = snap && lerEu(snap);
  if (eu && eu.hp < hpMin) hpMin = eu.hp;
}
const snapF1 = snapshots[snapshots.length - 1];
const euF1 = snapF1 && lerEu(snapF1);
check('20s no avião sem morrer (hp=' + (euF1 ? euF1.hp : '?') + ')', euF1 && euF1.hp >= 99, 'hp=' + (euF1 ? euF1.hp : '?'));
check('hp mínimo no avião = 100', hpMin >= 99, 'hpMin=' + hpMin);
check('ainda no ar (y>60): ' + (euF1 ? euF1.y : '?'), euF1 && euF1.y > 60);
check('avião veio no snapshot: ' + (snapF1 && snapF1.plane ? JSON.stringify(snapF1.plane) : 'sem plane'), snapF1 && !!snapF1.plane);
const ruins = eventos.filter((e) => e.startsWith('MORRI') || e.startsWith('WINNER') || e.startsWith('erro'));
check('sem morte/winner/erro até aqui', ruins.length === 0, ruins.join('; '));

// FASE 2: pula e cai de paraquedas
console.log('FASE 2: pulando do avião...');
enviar({ t: T.INPUT, seq: 9999, yaw: 0, pitch: 0, moveX: 0, moveZ: 0, run: false, jump: true, fire: false, ads: false });
await aguardar(200);
enviar({ t: T.INPUT, seq: 10000, yaw: 0, pitch: 0, moveX: 0, moveZ: 0, run: false, jump: false, fire: false, ads: false });

// observa a queda até pousar (ou 30s)
let yIni = euF1 ? euF1.y : 70;
let caiu = false;
for (let t = 0; t < 60 && !caiu; t += 0.5) {
  await aguardar(500);
  const snap = snapshots[snapshots.length - 1];
  const eu = snap && lerEu(snap);
  if (eu && eu.y < yIni - 2) caiu = true;
}
check('corpo começou a cair após o pulo', caiu);

// aguarda o pouso (ou 30s) e confere vida
await aguardar(15000);
const snapF2 = snapshots[snapshots.length - 1];
const euF2 = snapF2 && lerEu(snapF2);
check('pousou vivo (hp=' + (euF2 ? euF2.hp : '?') + ', y=' + (euF2 ? euF2.y : '?') + ')', euF2 && euF2.hp > 0);
check('sem morte na queda', !eventos.some((e) => e.startsWith('MORRI')), eventos.join('; '));

console.log('');
console.log('EVENTOS: ' + (eventos.length ? eventos.join(' | ') : 'nenhum'));
console.log('RESULTADO: ' + (falhas === 0 ? 'TODOS OS CHECKS DO BR REAL PASSARAM ✔ (' + acertos + ' checks)' : falhas + ' FALHA(S)'));
ws.close();
process.exit(falhas === 0 ? 0 : 1);
