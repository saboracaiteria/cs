// Teste do BR SEM avião (após a mudança):
// - jogadores nascem espalhados pelo mapa, já no chão
// - nenhuma mensagem aviao/plane é enviada
// - a zona encolhe no ritmo normal e a partida não crasha
import { RoomManager } from './server/rooms/manager.js';
import { makeBot } from './server/bots/botIa.js';
import { MODES } from './server/config.js';
import { DMRoom } from './server/rooms/dm.js';
import { BRRoom } from './server/rooms/br.js';

const msgs = [];
const fakeWs = {
  readyState: 1,
  send(d) { try { msgs.push(JSON.parse(d)); } catch {} },
  close() {},
};
const manager = new RoomManager();
manager.setRoomClasses({ dm: DMRoom, br: BRRoom });
const room = manager.join(fakeWs, 'TesteBR', 'br');
const pId = [...room.players.keys()][0];

while (room.totalSlots < MODES.br.maxPlayers) {
  room.addBot(makeBot('Bot' + room.totalSlots));
}
room.ready(pId);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// espera o countdown acabar (tick em tempo real)
let guarda = 0;
while (room.state === 'countdown' && guarda < 400) {
  room.tick();
  await sleep(20);
  guarda++;
}
console.log('state apos countdown:', room.state);

const p = room.players.get(pId);
if (!p || !p.body) { console.log('FALHOU: sem corpo'); process.exit(1); }
const g = room.world.col.groundHeightAt(p.body.pos.x, p.body.pos.z, p.body.pos.y + 0.3);
const noChao = Math.abs(p.body.pos.y - g) < 0.6;
console.log('pos humano:', JSON.stringify({ x: Math.round(p.body.pos.x), y: Math.round(p.body.pos.y), z: Math.round(p.body.pos.z) }), '| no chao?', noChao);

// joga por ~18 segundos reais
const fim = Date.now() + 18000;
while (Date.now() < fim && room.state === 'playing') {
  room.tick();
  await sleep(16);
}

const comAviao = msgs.filter((m) => m.aviao || m.plane).length;
console.log('zone.r final:', room.zone ? Math.round(room.zone.r) : '?');
console.log('msgs com aviao/plane:', comAviao, '| msgs total:', msgs.length, '| state:', room.state);

const ok = noChao && comAviao === 0 && room.state === 'playing' && msgs.length > 10;
console.log(ok ? 'TESTE PASSOU ✅' : 'TESTE FALHOU ❌');
process.exit(ok ? 0 : 1);
