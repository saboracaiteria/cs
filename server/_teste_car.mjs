// Teste dos carros do MP — entra num carro, acelera e sai.
// Rode com cwd=server:  node _teste_car.mjs
import WebSocket from 'ws';

const URL = 'ws://localhost:3000/ws';
const T = { HELLO: 'hello', WELCOME: 'welcome', GAME_START: 'gameStart', READY: 'ready', INPUT: 'input', SNAP: 'snap' };

const ws = new WebSocket(URL);
let meuId = null;
let ultimoSnap = null;
let fase = 'andar';      // andar -> entrar -> acelerar -> sair
let alvo = null;
let t0 = Date.now();
let tUltimoLog = 0;
let erros = 0;
let log = (m) => console.log('[car]', m);

function envInput(extra) {
  ws.send(JSON.stringify(Object.assign({ t: T.INPUT, seq: 1, yaw: 1.2, pitch: 0, moveX: 0, moveZ: 0, run: true, jump: false, fire: false, ads: false }, extra)));
}

ws.on('open', () => {
  log('conectado — HELLO dm');
  ws.send(JSON.stringify({ t: T.HELLO, nick: 'CarTest', modo: 'dm', v: 1 }));
});

ws.on('message', (data) => {
  let m;
  try { m = JSON.parse(data.toString()); } catch { return; }

  if (m.t === T.WELCOME) {
    meuId = m.id;
    log('WELCOME id=' + meuId);
    setTimeout(() => ws.send(JSON.stringify({ t: T.READY })), 800);
  }
  if (m.t === T.GAME_START) log('GAME_START seed=' + m.seed);

  if (m.t === T.SNAP) {
    ultimoSnap = m;
    const eu = (m.players || []).find((p) => p.id === meuId);
    if (!eu) return;
    const agora = Date.now();

    if (fase === 'andar') {
      if (!m.cars) { log('ERRO: snap SEM cars!'); erros++; fase = 'fim'; ws.close(); return; }
      let best = null, bestD = 1e9;
      for (const c of m.cars) {
        if (c.playerId != null) continue;
        const d = Math.hypot(c.x - eu.x, c.z - eu.z);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (!best) { log('ERRO: nenhum carro livre'); erros++; fase = 'fim'; ws.close(); return; }
      alvo = best;
      if (agora - tUltimoLog > 1500) { log('pos (' + Math.round(eu.x) + ',' + Math.round(eu.z) + ') -> carro ' + best.id + ' a ' + bestD.toFixed(1) + 'm'); tUltimoLog = agora; }
      if (bestD <= 4.0) {
        log('✅ carro ' + best.id + ' a ' + bestD.toFixed(1) + 'm — ENTRANDO');
        fase = 'entrar';
        t0 = agora;
        envInput({ car: best.id });
      } else if (agora - t0 < 15000) {
        const yaw = Math.atan2(eu.x - best.x, eu.z - best.z);
        envInput({ yaw, moveZ: 1 });
      } else {
        log('ERRO: não cheguei perto do carro'); erros++; fase = 'fim'; ws.close();
      }
    } else if (fase === 'entrar') {
      if (eu.inCar === alvo.id) {
        log('✅ ENTREI no carro ' + eu.inCar + ' pos (' + Math.round(eu.x) + ',' + Math.round(eu.z) + ')');
        fase = 'acelerar';
        t0 = agora;
      } else if (agora - t0 > 5000) {
        log('ERRO: não entrei (inCar=' + eu.inCar + ')'); erros++; fase = 'fim'; ws.close();
      }
    } else if (fase === 'acelerar') {
      envInput({ moveZ: 1 });
      if (agora - t0 > 2500) {
        const c = (m.cars || []).find((cc) => cc.id === alvo.id);
        log('carro ' + alvo.id + ' em (' + Math.round(c.x) + ',' + Math.round(c.z) + ') speed=' + c.speed.toFixed(1) + ' | eu inCar=' + eu.inCar);
        if (c && c.speed > 5 && eu.inCar === alvo.id) log('✅ CARRO ACELERANDO (speed=' + c.speed.toFixed(1) + ')');
        else { log('ERRO: carro não acelerou'); erros++; }
        fase = 'sair';
        t0 = agora;
        envInput({ car: 0 });
      }
    } else if (fase === 'sair') {
      if (eu.inCar == null) {
        log('✅ SAI do carro — pos (' + Math.round(eu.x) + ',' + Math.round(eu.z) + ')');
        fase = 'fim';
        log(erros === 0 ? 'RESULTADO: CARROS OK ✅' : 'RESULTADO: ' + erros + ' ERRO(S)');
        ws.close();
      } else if (agora - t0 > 5000) {
        log('ERRO: não saí do carro'); erros++; fase = 'fim'; ws.close();
      }
    }
  }
});

ws.on('close', () => { if (fase !== 'fim') log('fechado na fase ' + fase); process.exit(erros === 0 && fase === 'fim' ? 0 : 1); });
ws.on('error', (e) => { log('ERRO WS: ' + e.message); erros++; });
setTimeout(() => { log('TIMEOUT 25s'); try { ws.close(); } catch {} }, 25000);
