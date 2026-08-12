// Patch cliente: cor da roupa + tag de nick + dia/noite do host
const fs = require('fs');

function patch(path, edits) {
  const F = path;
  let s = fs.readFileSync(F, 'utf8');
  for (const e of edits) {
    if (!s.includes(e.from)) {
      console.error('ERRO [' + path + '] NAO ACHOU: ' + e.from.slice(0, 80).replace(/\n/g, '\\n'));
      process.exit(1);
    }
    s = s.replace(e.from, e.to);
    console.log('OK  ' + path + ' :: ' + e.tag);
  }
  fs.writeFileSync(F, s);
}

// ---------------------------------------------------------------- src/net/protocol.js
patch('src/net/protocol.js', [
  {
    tag: 'T.CYCLE',
    from: `  RESPAWN_NOW: 'respawnNow', // { t } morto pediu para renascer na hora (DM)`,
    to: `  RESPAWN_NOW: 'respawnNow', // { t } morto pediu para renascer na hora (DM)
  CYCLE: 'cycle',          // { t } host alterna o ciclo dia/noite da partida`,
  },
]);

// ---------------------------------------------------------------- src/net/multiplayer.js
patch('src/net/multiplayer.js', [
  {
    tag: 'cor no HELLO/replay',
    from: `  net._onReplay = () => net.enviar({ t: T.HELLO, v: NET_VERSION, nick, modo });`,
    to: `  net._onReplay = () => net.enviar({ t: T.HELLO, v: NET_VERSION, nick, modo, cor: net.cor });`,
  },
  {
    tag: 'net.cor antes de conectar',
    from: `  net = new ClientNet(url);`,
    to: `  // [ROUPA] cor da camisa escolhida no seletor do lobby (enviada no HELLO)
  net.cor = lerCorRoupa();
  net = new ClientNet(url);`,
  },
  {
    tag: 'net.host no WELCOME',
    from: `      net.cfg = msg.cfg;
      lobby.setMeuId(msg.id);`,
    to: `      net.cfg = msg.cfg;
      net.host = !!msg.host;   // [DIA-NOITE] quem controla o tempo da partida
      lobby.setMeuId(msg.id);`,
  },
  {
    tag: 'lerCorRoupa + listeners',
    from: `window.addEventListener('mp-sair', () => sairMultiplayer());`,
    to: `window.addEventListener('mp-sair', () => sairMultiplayer());

// [ROUPA] lê a cor ativa do seletor (#mp-roupa) — 0xe8453c se não houver
function lerCorRoupa() {
  const ativa = document.querySelector('#mp-roupa .mp-cor.ativa');
  const v = ativa ? ativa.getAttribute('data-cor') : '0xe8453c';
  return parseInt(v, 16) || 0xe8453c;
}
// [ROUPA] clique nas bolinhas do seletor (uma ativa por vez)
document.querySelectorAll('#mp-roupa .mp-cor').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#mp-roupa .mp-cor').forEach((x) => x.classList.remove('ativa'));
    b.classList.add('ativa');
  });
});`,
  },
]);

// ---------------------------------------------------------------- src/net/match.js
patch('src/net/match.js', [
  {
    tag: 'nicks com cor + snapHour',
    from: `  _snap(msg) {
    this.snapBuf.push(msg);
    // registra nicks e garante avatares
    for (const p of msg.players || []) {
      if (p.nick) this.nicks.set(p.id, { nick: p.nick, bot: p.bot });
      this._garantirAvatar(p.id);
    }`,
    to: `  _snap(msg) {
    this.snapBuf.push(msg);
    this._snapHour = msg.hour;         // [DIA-NOITE] hora controlada pelo host
    this._snapCycle = msg.cycleMode;
    // registra nicks e garante avatares (cor da roupa sincronizada)
    for (const p of msg.players || []) {
      if (p.nick) this.nicks.set(p.id, { nick: p.nick, bot: p.bot, cor: p.cor });
      this._garantirAvatar(p.id);
    }`,
  },
  {
    tag: 'sky sync host',
    from: `    if (this.game && this.game.sky) {
      this.game.sky.setPaused(false);
      this.game.sky.update(dt, foc);`,
    to: `    if (this.game && this.game.sky) {
      // [DIA-NOITE] céu controlado pelo HOST (servidor): a hora vem no snap
      const sky = this.game.sky;
      if (this._snapHour != null) {
        sky.setPaused(true);   // relógio local parado — segue o host
        if (this._snapCycle && sky.cycleMode !== this._snapCycle) {
          sky.cycleMode = this._snapCycle;
          if (this._snapCycle === 'dia') sky.setHour(12);
          else if (this._snapCycle === 'noite') sky.setHour(22);
        }
        let d = this._snapHour - sky.hour;
        while (d > 12) d -= 24;
        while (d < -12) d += 24;
        if (Math.abs(d) > 0.05) sky.setHour(sky.hour + d * Math.min(1, 3 * dt));
      } else {
        sky.setPaused(false);
      }
      sky.update(dt, foc);`,
  },
  {
    tag: 'tecla N host',
    from: `      if (k === 'n' && this.game) this.game.cycleDayNight();`,
    to: `      if (k === 'n') this._pedirCycle();   // [DIA-NOITE] só o host controla`,
  },
  {
    tag: 'metodo _pedirCycle',
    from: `  _snap(msg) {`,
    to: `  /** [DIA-NOITE] tecla N: só o HOST controla o tempo da partida */
  _pedirCycle() {
    if (this.net && this.net.host) {
      this.net.enviar({ t: T.CYCLE });
      if (this.game && this.game.hud) this.game.hud.toast('🌗 HOST — alternando dia/noite', 'time');
    } else if (this.game && this.game.hud) {
      this.game.hud.toast('⏰ Só o host controla o dia/noite', 'aviso');
    }
  }

  _snap(msg) {`,
  },
]);

// ---------------------------------------------------------------- index.html (seletor de roupa)
patch('index.html', [
  {
    tag: 'seletor roupa',
    from: `    <label class="mp-field"><span>SEU NOME</span><input id="mp-nick" type="text" maxlength="14" placeholder="Jogador" value="Jogador"></label>`,
    to: `    <label class="mp-field"><span>SEU NOME</span><input id="mp-nick" type="text" maxlength="14" placeholder="Jogador" value="Jogador"></label>
    <label class="mp-field"><span>SUA ROUPA</span>
      <div class="mp-roupa" id="mp-roupa">
        <button type="button" class="mp-cor ativa" data-cor="0xe8453c" style="background:#e8453c" title="Vermelha"></button>
        <button type="button" class="mp-cor" data-cor="0x2f9e5f" style="background:#2f9e5f" title="Verde"></button>
        <button type="button" class="mp-cor" data-cor="0x3a6fd8" style="background:#3a6fd8" title="Azul"></button>
        <button type="button" class="mp-cor" data-cor="0xe0a323" style="background:#e0a323" title="Amarela"></button>
        <button type="button" class="mp-cor" data-cor="0x9c4fd8" style="background:#9c4fd8" title="Roxa"></button>
        <button type="button" class="mp-cor" data-cor="0xd84f8f" style="background:#d84f8f" title="Rosa"></button>
        <button type="button" class="mp-cor" data-cor="0x23b0c9" style="background:#23b0c9" title="Ciano"></button>
        <button type="button" class="mp-cor" data-cor="0x8a6f4f" style="background:#8a6f4f" title="Marrom"></button>
        <button type="button" class="mp-cor" data-cor="0x5a6b8a" style="background:#5a6b8a" title="Cinza"></button>
        <button type="button" class="mp-cor" data-cor="0xc9c23a" style="background:#c9c23a" title="Mostarda"></button>
      </div>
    </label>`,
  },
  {
    tag: 'CSS do seletor',
    from: `  <div id="mode-select" class="hidden">`,
    to: `  <style>
    .mp-roupa { display:flex; flex-wrap:wrap; gap:6px; }
    .mp-cor { width:26px; height:26px; border-radius:50%; border:2px solid rgba(255,255,255,.25); cursor:pointer; padding:0; }
    .mp-cor.ativa { border-color:#fff; transform:scale(1.18); box-shadow:0 0 8px rgba(255,255,255,.5); }
  </style>
  <div id="mode-select" class="hidden">`,
  },
]);

console.log('\nTODOS OS PATCHES DO CLIENTE APLICADOS');
