const fs = require('fs');

function edita(path, fn, alvo = 1) {
  const antes = fs.readFileSync(path, 'utf8');
  const dep = fn(antes);
  if (dep.count !== alvo) { console.error(`FALHOU ${path}: count=${dep.count} (esperado ${alvo})`); process.exit(1); }
  fs.writeFileSync(path, dep.out);
  console.log(`OK ${path} (${dep.count})`);
}

// 1) server/helis.js — paleta de cores + cor em cada heli
edita('server/helis.js', (s) => {
  let count = 0;
  let out = s.replace('export const HELI_SPOTS = [', 'export const HELI_COLORS = [0x1f4f8f, 0xb3302f, 0x2e7d32, 0xe8b800, 0x7a5cc7];\n\n// Cor de identificacao — cada heli do mapa tem uma cor distinta.\nexport const HELI_SPOTS = [');
  count += (out !== s) ? 1 : 0; s = out;
  out = s.replace('    helis.push({\n      id: heliUid++,', '    helis.push({\n      id: heliUid++,\n      cor: HELI_COLORS[i % HELI_COLORS.length],');
  count += (out !== s) ? 1 : 0;
  return { out, count };
}, 2);

// 2) server/rooms/room.js — snapshot do heli inclui cor
edita('server/rooms/room.js', (s) => {
  let count = 0;
  let out = s.replace('      fuel: Math.round(h.fuel ?? 100),\n    }));', '      fuel: Math.round(h.fuel ?? 100),\n      cor: h.cor,\n    }));');
  count += (out !== s) ? 1 : 0;
  return { out, count };
});

// 3) src/ent/helicopter.js — construtor aceita cor
edita('src/ent/helicopter.js', (s) => {
  let count = 0;
  let out = s.replace('  constructor(scene, collision, cor = 0x1f4f8f) {\n    this.cor = cor;', '  constructor(scene, collision, cor = 0x1f4f8f) {\n    this.cor = cor;');
  if (out !== s) { count++; } else {
    // ainda não foi aplicado: aplica a partir da versão sem parâmetro
    out = s.replace('  constructor(scene, collision) {', '  constructor(scene, collision, cor = 0x1f4f8f) {\n    this.cor = cor;');
    count += (out !== s) ? 1 : 0;
  }
  s = out;
  out = s.replace('      color: 0x1f4f8f, roughness: 0.34, metalness: 0.55,', '      color: this.cor, roughness: 0.34, metalness: 0.55,');
  count += (out !== s) ? 1 : 0;
  return { out, count };
}, 2);

// 4) src/net/match.js — mesh remoto usa a cor do servidor
edita('src/net/match.js', (s) => {
  let count = 0;
  let out = s.replace('const mesh = new Helicopter(this.game.gfx.scene, this.game.col);', 'const mesh = new Helicopter(this.game.gfx.scene, this.game.col, h.cor || 0x1f4f8f);');
  count += (out !== s) ? 1 : 0;
  return { out, count };
});

// 5) server/rooms/dm.js — spawn na BORDA + spawn nunca repetido
edita('server/rooms/dm.js', (s) => {
  let count = 0;
  let out = s.replace("import { buildWorld } from '../world/world.js';", "import { buildWorld } from '../world/world.js';\nimport { WORLD_EDGE } from '../config.js';");
  count += (out !== s) ? 1 : 0; s = out;

  out = s.replace(/_makeSpawns\(\) \{\n\s*const pts = \[[\s\S]*?\n    \];/, `  _makeSpawns() {
    // [borda] TODOS os spawns ficam no PERIMETRO da cidade (borda do mapa),
    // nunca perto do centro: 12 pontos espalhados pelas 4 arestas.
    const pts = [];
    const L = WORLD_EDGE - 12;                 // 244: rua externa da borda
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const x = Math.cos(ang), z = Math.sin(ang);
      const m = Math.max(Math.abs(x), Math.abs(z));
      pts.push([Math.round((x / m) * L), Math.round((z / m) * L)]);
    }`);
  count += (out !== s) ? 1 : 0; s = out;

  out = s.replace(/_spawnPoint\(p\) \{[\s\S]*?\n  \}/, `  _spawnPoint(p) {
    // [spawn] NUNCA renasce no mesmo local: sorteia entre os pontos LIVRES
    // (longe de qualquer player vivo); se todos ocupados, usa qualquer um.
    const ocupado = (s) => {
      for (const q of this._all()) {
        if (q === p || !q.body || q.hp <= 0) continue;
        if (dist2D(q.body.x, q.body.z, s.x, s.z) < 40) return true;
      }
      return false;
    };
    const livres = this.spawns.filter((s) => !ocupado(s));
    const pool = livres.length ? livres : this.spawns;
    return pool[Math.floor(Math.random() * pool.length)];
  }`);
  count += (out !== s) ? 1 : 0;

  return { out, count };
}, 3);

console.log('TODAS AS MUDANCAS APLICADAS');
