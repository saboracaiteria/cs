// Mede o tamanho do LOOT_LIST gerado pelo servidor (mesma lógica de br.js)
import { rollLoot } from './server/weapons.js';
import { makeRng, rngRange } from './server/util.js';

const rng = makeRng(20260725);
const itens = [];
for (let i = 0; i < 180; i++) {
  const item = rollLoot(rng);
  itens.push({
    id: i + 1,
    x: Math.round(rngRange(rng, -210, 210) * 100) / 100,
    y: 5,
    z: Math.round(rngRange(rng, -210, 210) * 100) / 100,
    tipo: item.tipo,
    arma: item.arma,
    qtd: item.qtd,
    hp: item.hp,
  });
}
const s = JSON.stringify({ t: 'lootList', itens });
console.log('itens gerados: ' + itens.length);
console.log('tamanho do LOOT_LIST: ' + s.length + ' chars (limite do send: 8192)');
console.log(s.length > 8192 ? '=> EXCEDE O LIMITE: mensagem NÃO chega ao cliente' : '=> dentro do limite');
