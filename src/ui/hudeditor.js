/**
 * hudeditor — editor de HUD estilo CODM (padrão DINO4).
 *
 * O modo edição:
 *  - congela o touch.js (via classe body.hud-edit) para ele NÃO re-esconder os
 *    botões a cada frame (o .hidden tem display:none !important e venceria o
 *    display:block inline);
 *  - mostra o touch, o pad e TODOS os botões (removendo a classe hidden);
 *  - arrasto por POLEGADA (posições em % da viewport, como no DINO4) — nunca
 *    usa getBoundingClientRect para "congelar" posição inicial, então não há
 *    como o botão sumir fora da tela;
 *  - clique num botão SELECIONA (destaque âmbar); ➕➖ muda o tamanho do
 *    selecionado (dataset.scale, 0.5x–2.5x);
 *  - 💾 SALVAR grava {left,top,right,bottom,scale} em % no localStorage;
 *  - ↺ PADRÃO limpa tudo e volta ao layout do CSS.
 */
const CHAVE = 'cs-hud-layout-v1';

const MAPA = {
  fogo: '.tc-fogo',
  pular: '.tc-pular',
  acao: '.tc-acao',
  descer: '.tc-descer',
  visao: '.tc-visao',
  missil: '.tc-missil',
  'girar-esq': '.tc-girar-esq',
  'girar-dir': '.tc-girar-dir',
  stick: '#tc-stick-zone',
};

const $ = (id) => document.getElementById(id);

export function criarHudEditor() {
  const overlay = $('hud-editor');
  const avisoEl = $('hud-editor-aviso');
  const btnSalvar = $('hud-editor-salvar');
  const btnPadrao = $('hud-editor-padrao');
  const btnFechar = $('hud-editor-fechar');
  const btnMenos = $('hud-editor-menos');
  const btnMais = $('hud-editor-mais');
  const touch = $('touch');

  let aberto = false;
  let onAbrir = null;
  let onFechar = null;
  let alvo = null;           // elemento em arrasto
  let selecionado = null;    // elemento selecionado (escala)
  let posIni = { x: 0, y: 0, left: 0, top: 0 };
  let prevToque = false;
  let prevTouchHidden = true;

  function editaveis() {
    return touch ? Array.from(touch.querySelectorAll('.tc-btn, #tc-stick-zone')) : [];
  }

  /** Mostra o touch e todos os botões (remove a classe hidden !important). */
  function mostrarTodos() {
    document.body.classList.add('toque', 'hud-edit');
    if (!touch) return;
    touch.classList.remove('hidden');
    touch.style.display = 'block';
    touch.style.zIndex = '950';
    // CRÍTICO: o #touch é fullscreen (inset:0). Com pointer-events ativo ele
    // bloqueia TODOS os cliques na barra do editor (SALVAR/FECHAR/PADRÃO/➕➖)
    // — desligamos o raycast do container (padrão Unity) e só os botões
    // (pointer-events:auto) capturam o dedo.
    touch.style.pointerEvents = 'none';
    const pad = touch.querySelector('#tc-pad');
    if (pad) {
      pad.classList.remove('hidden');
      pad.style.display = 'block';
      pad.style.pointerEvents = 'none'; // só os botões capturam o dedo
    }
    for (const b of editaveis()) {
      b.classList.remove('hidden');
      b.style.display = 'block';
      b.style.pointerEvents = 'auto';
      // CRÍTICO: sem isso os botões ficam PRESOS na caixa do #tc-pad
      // (264x200px) porque left/top em % é relativo ao container absolute.
      // Com position:fixed o % vira relativo à VIEWPORT e o botão voa livre
      // pela tela inteira, igual ao analógico.
      b.style.position = 'fixed';
      b.style.zIndex = b.id === 'tc-stick-zone' ? '901' : '960';
      b.classList.add('customizing');
      b.classList.remove('custom-selected');
    }
  }

  /** Restaura o estado do touch após o editor. */
  function esconderTudo() {
    document.body.classList.remove('hud-edit');
    if (!prevToque) document.body.classList.remove('toque');
    if (!touch) return;
    if (prevTouchHidden) touch.classList.add('hidden');
    touch.style.display = '';
    touch.style.zIndex = '';
    touch.style.pointerEvents = '';
    const pad = touch.querySelector('#tc-pad');
    if (pad) {
      pad.style.display = '';
      pad.style.pointerEvents = '';
    }
    for (const b of editaveis()) {
      b.classList.remove('customizing', 'custom-selected', 'hud-arrastando');
      b.style.display = '';
      b.style.pointerEvents = '';
      b.style.position = '';
      b.style.zIndex = '';
    }
  }

  function abrir() {
    if (aberto) return;
    aberto = true;
    if (onAbrir) onAbrir(); // fecha a tela de CONTROLES (se estiver aberta)
    prevToque = document.body.classList.contains('toque');
    prevTouchHidden = !!(touch && touch.classList.contains('hidden'));
    mostrarTodos();
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.style.display = 'block';
    }
    if (avisoEl) {
      avisoEl.textContent = 'toque num botão para selecionar · ➕➖ muda o tamanho · 💾 SALVAR guarda';
    }
    try {
      console.log('[hud-editor] aberto touchHidden=' + (touch ? touch.classList.contains('hidden') : '?') +
        ' botoes=' + editaveis().length + ' body=' + document.body.className);
    } catch (e) { /* sem console */ }
  }

  function fechar() {
    if (!aberto) return;
    aberto = false;
    // salva automaticamente se houver personalização (padrão DINO4)
    try {
      const personalizado = editaveis().some(b =>
        b.style.left !== '' || b.style.top !== '' ||
        b.style.right !== '' || b.style.bottom !== '' ||
        (parseFloat(b.dataset.scale) || 1) !== 1
      );
      if (personalizado) salvar();
    } catch (e) { /* sem console */ }
    esconderTudo();
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.style.display = '';
    }
    alvo = null;
    selecionado = null;
    try { console.log('[hud-editor] fechado'); } catch (e2) {}
    if (onFechar) onFechar();
  }

  /** Posição atual do elemento em % da viewport (left/top). */
  function pegarPos(el) {
    const l = parseFloat(el.style.left);
    const t = parseFloat(el.style.top);
    if (isFinite(l) && isFinite(t)) return { left: l, top: t };
    const r = el.getBoundingClientRect(); // válido: o touch está visível agora
    return {
      left: (r.left / window.innerWidth) * 100,
      top: (r.top / window.innerHeight) * 100,
    };
  }

  function selecionar(el) {
    for (const b of editaveis()) b.classList.remove('custom-selected');
    selecionado = el;
    if (el) el.classList.add('custom-selected');
    if (avisoEl && el) {
      avisoEl.textContent = 'selecionado: ' + (el.dataset.hud || el.id || '?') +
        ' · ➕➖ muda o tamanho';
    }
  }

  // ---------- arrasto (pointer events, fase de captura) ----------
  document.addEventListener('pointerdown', (e) => {
    if (!aberto) return;
    if (e.target.closest && e.target.closest('#hud-editor-bar, #hud-editor-aviso')) return;
    const b = e.target.closest ? e.target.closest('.tc-btn, #tc-stick-zone') : null;
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    selecionar(b);
    alvo = b;
    const pos = pegarPos(b);
    posIni = { x: e.clientX, y: e.clientY, left: pos.left, top: pos.top };
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* alguns navegadores */ }
    b.classList.add('hud-arrastando');
  }, true);

  document.addEventListener('pointermove', (e) => {
    if (!aberto || !alvo) return;
    const dxPct = ((e.clientX - posIni.x) / window.innerWidth) * 100;
    const dyPct = ((e.clientY - posIni.y) / window.innerHeight) * 100;
    // livre até a borda (padrão DINO4): limite = 100% - tamanho do elemento
    const r = alvo.getBoundingClientRect();
    const largPct = Math.max(8, (r.width / window.innerWidth) * 100);
    const altPct = Math.max(8, (r.height / window.innerHeight) * 100);
    const novoLeft = Math.max(0, Math.min(100 - largPct, posIni.left + dxPct));
    const novoTop = Math.max(0, Math.min(100 - altPct, posIni.top + dyPct));
    alvo.style.right = 'auto';
    alvo.style.bottom = 'auto';
    alvo.style.left = novoLeft.toFixed(2) + '%';
    alvo.style.top = novoTop.toFixed(2) + '%';
  });

  const soltar = () => {
    if (alvo) {
      alvo.classList.remove('hud-arrastando');
      alvo = null;
    }
  };
  document.addEventListener('pointerup', soltar);
  document.addEventListener('pointercancel', soltar);

  // ---------- escala (por elemento selecionado) ----------
  function mudarEscala(delta) {
    const el = selecionado;
    if (!el) {
      if (avisoEl) avisoEl.textContent = 'toque num botão para selecioná-lo e depois use ➕➖';
      return;
    }
    const atual = parseFloat(el.dataset.scale) || 1;
    const nova = Math.min(2.5, Math.max(0.5, Math.round((atual + delta) * 100) / 100));
    el.dataset.scale = nova;
    el.style.transform = nova === 1 ? '' : 'scale(' + nova + ')';
    if (avisoEl) avisoEl.textContent = (el.dataset.hud || '?') + ' ' + Math.round(nova * 100) + '%';
  }

  // ---------- salvar / carregar / reset ----------
  function coletar() {
    const layout = {};
    for (const b of editaveis()) {
      const chave = b.dataset.hud;
      if (!chave) continue;
      const pos = pegarPos(b);
      layout[chave] = {
        left: pos.left.toFixed(2) + '%',
        top: pos.top.toFixed(2) + '%',
        right: 'auto',
        bottom: 'auto',
        scale: parseFloat(b.dataset.scale) || 1,
      };
    }
    return layout;
  }

  function salvar() {
    const layout = coletar();
    try { localStorage.setItem(CHAVE, JSON.stringify({ botoes: layout })); } catch (e) { /* bloqueado */ }
    try { console.log('[hud-editor] salvo ' + Object.keys(layout).length + ' botoes'); } catch (e2) {}
    return Object.keys(layout).length;
  }

  function padrao() {
    try { localStorage.removeItem(CHAVE); } catch (e) { /* ignore */ }
    try { console.log('[hud-editor] padrao restaurado'); } catch (e2) {}
    for (const sel of Object.values(MAPA)) {
      for (const el of document.querySelectorAll(sel)) {
        el.style.position = '';
        el.style.left = '';
        el.style.top = '';
        el.style.right = '';
        el.style.bottom = '';
        el.style.transform = '';
        el.style.zIndex = '';
        delete el.dataset.scale;
      }
    }
    selecionar(null);
    if (avisoEl) avisoEl.textContent = '↺ layout padrão restaurado (recarregue para ver)';
  }

  function carregarLayout() {
    let dados = null;
    try { dados = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { dados = null; }
    if (!dados) return;
    const layout = dados.botoes || dados; // compatível com formato antigo
    for (const [chave, pos] of Object.entries(layout)) {
      const sel = MAPA[chave];
      if (!sel || !pos) continue;
      for (const el of document.querySelectorAll(sel)) {
        el.style.position = 'fixed';
        el.style.left = pos.left || '0%';
        el.style.top = pos.top || '0%';
        el.style.right = pos.right || 'auto';
        el.style.bottom = pos.bottom || 'auto';
        const s = parseFloat(pos.scale) || 1;
        el.dataset.scale = s;
        el.style.transform = s === 1 ? '' : 'scale(' + s + ')';
      }
    }
  }

  // ---------- barra do editor ----------
  if (btnSalvar) btnSalvar.addEventListener('click', () => {
    const n = salvar();
    if (avisoEl) {
      avisoEl.textContent = '✅ layout salvo (' + n + ' botões) — vale para solo e multiplayer';
      clearTimeout(btnSalvar._t);
      btnSalvar._t = setTimeout(() => { avisoEl.textContent = ''; }, 2500);
    }
  });
  if (btnPadrao) btnPadrao.addEventListener('click', padrao);
  if (btnFechar) btnFechar.addEventListener('click', fechar);
  if (btnMenos) btnMenos.addEventListener('click', () => mudarEscala(-0.1));
  if (btnMais) btnMais.addEventListener('click', () => mudarEscala(0.1));

  // ---------- botão na tela CONTROLES ----------
  const botaoEditar = $('keys-editar-hud');
  if (botaoEditar) {
    botaoEditar.addEventListener('click', (e) => {
      e.preventDefault();
      abrir();
    });
  }

  return {
    abrir,
    fechar,
    salvar,
    padrao,
    carregarLayout,
    mais() { mudarEscala(0.1); },
    menos() { mudarEscala(-0.1); },
    onAbrir(fn) { onAbrir = fn; },
    onFechar(fn) { onFechar = fn; },
  };
}
