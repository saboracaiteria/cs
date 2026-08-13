const fs = require('fs');
let s = fs.readFileSync('src/gfx/renderer.js', 'utf8');

// bloom: dimensoes MULTIPLO DE 32 (5 mips de /2 => todos pares)
const a = `      // [MOBILE-FIX] dimensoes PARES: o bloom divide por 2 (5 mips) e dimensao
      // impar em half-float corrompe o framebuffer em alguns Adreno
      const bw = Math.max(64, Math.round((w * bs) / 2) * 2);
      const bh = Math.max(64, Math.round((h * bs) / 2) * 2);`;
const r = `      // [MOBILE-FIX] dimensoes MULTIPLO DE 32: o bloom divide por 2 cinco
      // vezes (nMips=5); dimensao impar em half-float corrompe o framebuffer
      // em alguns Adreno (Samsung) -> tela verde piscando
      const bw = Math.max(64, Math.round((w * bs) / 32) * 32);
      const bh = Math.max(64, Math.round((h * bs) / 32) * 32);`;
if (!s.includes(a)) { console.log('FALHOU'); process.exit(1); }
s = s.split(a).join(r);
fs.writeFileSync('src/gfx/renderer.js', s);
console.log('bloom agora em multiplos de 32');
