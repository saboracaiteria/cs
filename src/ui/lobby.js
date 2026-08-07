/**
 * Lobby — lista de jogadores, pronto/iniciar, contagem regressiva.
 */
export function criarLobby() {
  const tela = document.getElementById('lobby-screen');
  const lista = document.getElementById('lobby-list');
  const modoEl = document.getElementById('lobby-modo');
  const cd = document.getElementById('lobby-countdown');
  const nick = document.getElementById('mp-nick');
  const btnPronto = document.getElementById('mp-pronto');
  const btnIniciar = document.getElementById('mp-iniciar');
  const btnSair = document.getElementById('mp-sair');
  const codigoEl = document.getElementById('lobby-codigo');
  const salaEl = document.getElementById('mp-sala');

  if (!tela) return { mostrar() {}, esconder() {}, atualizar() {}, onReady() {}, onStart() {}, onLeave() {}, nick() { return ''; } };

  let estado = 'lobby';
  let pronto = false;

  function mostrar(modoLabel) {
    tela.classList.remove('hidden');
    modoEl.textContent = modoLabel || '';
    cd.style.display = 'none';
    pronto = false;
  }

  function esconder() { tela.classList.add('hidden'); }

  /** Mostra o código da sala atual (compartilhe com os amigos). */
  function setSala(codigo) {
    if (codigoEl) codigoEl.textContent = codigo || '—';
  }

  /** Código digitado para entrar na sala do amigo (ou vazio). */
  function codigoSala() {
    return salaEl ? salaEl.value.trim().toUpperCase() : '';
  }

  function atualizar(data) {
    estado = data.state || 'lobby';
    lista.innerHTML = '';
    for (const j of data.jogadores || []) {
      const li = document.createElement('li');
      if (j.bot) li.className = 'lb-bot';
      const status = j.bot ? '<span class="lb-bot">🤖 bot</span>'
        : j.pronto ? '<span class="lb-pronto">✔ pronto</span>'
        : '<span class="lb-pronto" style="color:#8aa0b5">—</span>';
      const host = j.host ? '<span class="lb-host">👑 host</span>' : '';
      li.innerHTML = `<span>${esc(j.nick || '?')}</span>${status}${host}`;
      lista.appendChild(li);
    }
    if (estado === 'countdown') {
      cd.style.display = 'block';
      cd.textContent = `Partida em ${data.countdown || 0}s…`;
    } else {
      cd.style.display = 'none';
    }
    // botões
    const eu = data.jogadores || [];
    btnPronto.disabled = estado !== 'lobby';
    btnPronto.textContent = pronto ? 'PRONTO ✔' : 'MARCAR PRONTO';
    btnPronto.classList.toggle('verde', pronto);
    btnIniciar.style.display = (data.hostId != null && eu.some((j) => j.host)) ? '' : 'none';
    btnIniciar.disabled = !data.podeIniciar;
  }

  btnPronto.addEventListener('click', () => { pronto = !pronto; onReadyCb && onReadyCb(); });
  btnIniciar.addEventListener('click', () => onStartCb && onStartCb());
  btnSair.addEventListener('click', () => onLeaveCb && onLeaveCb());

  let onReadyCb = null, onStartCb = null, onLeaveCb = null;

  return {
    mostrar, esconder, atualizar, setSala, codigoSala,
    nick: () => nick ? nick.value.trim() || 'Jogador' : 'Jogador',
    setNick: (v) => { if (nick) nick.value = v; },
    onReady: (fn) => { onReadyCb = fn; },
    onStart: (fn) => { onStartCb = fn; },
    onLeave: (fn) => { onLeaveCb = fn; },
  };
}

function esc(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
