/**
 * hudeditor — editor de HUD estilo CODM.
 *
 * Abre um modo onde cada botão do touch (solo E multiplayer, pelas mesmas
 * classes) pode ser arrastado para qualquer lugar da tela. O layout é
 * salvo no localStorage e reaplicado automaticamente no boot e em todos
 * os modos (solo, DM, BR).
 */
const CHAVE = 'cs-hud-layout-v1';

// classe de posicionamento de cada botão (os ids do solo e do MP mudam,
// mas as classes são as mesmas — o layout vale para os dois modos)
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
  const touch = $('touch');

  let aberto = false;
  let onFechar = null;
  let alvo = null;
  let desloc = { x: 0, y: 0 };
  let prevToque = false;
  let prevTouchHidden = true;

  function editaveis() {
    return touch ? touch.querySelectorAll('.tc-btn, #tc-stick-zone') : [];
  }

  function abrir() {
    if (!touch || aberto) return;
    aberto = true;
    prevToque = document.body.classList.contains('toque');
    prevTouchHidden = touch.classList.contains('hidden');

    document.body.classList.add('toque', 'hud-edit');
    touch.classList.remove('hidden');

    // congela a posição atual de cada botão em px da tela (fixed) e mostra
    // até os que ficam escondidos (visão, míssil, direcionais, descer)
    for (const b of editaveis()) {
      b.classList.remove('hidden');
      const r = b.getBoundingClientRect();
      b.style.position = 'fixed';
      b.style.left = r.left + 'px';
      b.style.top = r.top + 'px';
      b.style.right = 'auto';
      b.style.bottom = 'auto';
      b.style.zIndex = '901';
    }
    overlay.classList.remove('hidden');
  }

  function fechar() {
    if (!aberto) return;
    aberto = false;
    document.body.classList.remove('hud-edit');
    if (!prevToque) document.body.classList.remove('toque');
    if (prevTouchHidden) touch.classList.add('hidden');
    for (const b of editaveis()) {
      b.style.zIndex = '';
      if (!b.dataset.hudSalvo) {
        b.style.position = '';
        b.style.left = '';
        b.style.top = '';
        b.style.right = '';
        b.style.bottom = '';
      }
    }
    overlay.classList.add('hidden');
    if (onFechar) onFechar();
  }

  function salvar() {
    const layout = {};
    for (const b of editaveis()) {
      const chave = b.dataset.hud;
      if (!chave || b.style.left === '' || b.style.top === '') continue;
      layout[chave] = { left: Math.round(parseFloat(b.style.left)), top: Math.round(parseFloat(b.style.top)) };
    }
    localStorage.setItem(CHAVE, JSON.stringify(layout));
    for (const b of editaveis()) b.dataset.hudSalvo = '';
    return Object.keys(layout).length;
  }

  function padrao() {
    localStorage.removeItem(CHAVE);
    for (const sel of Object.values(MAPA)) {
      for (const el of document.querySelectorAll(sel)) {
        el.style.position = '';
        el.style.left = '';
        el.style.top = '';
        el.style.right = '';
        el.style.bottom = '';
        delete el.dataset.hudSalvo;
      }
    }
    if (aberto) {
      for (const b of editaveis()) {
        const r = b.getBoundingClientRect();
        b.style.left = r.left + 'px';
        b.style.top = r.top + 'px';
      }
    }
  }

  function carregarLayout() {
    let layout = null;
    try { layout = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { layout = null; }
    if (!layout) return;
    for (const [chave, pos] of Object.entries(layout)) {
      const sel = MAPA[chave];
      if (!sel || typeof pos.left !== 'number') continue;
      for (const el of document.querySelectorAll(sel)) {
        el.style.position = 'fixed';
        el.style.left = pos.left + 'px';
        el.style.top = pos.top + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.dataset.hudSalvo = '';
      }
    }
  }

  // ---- arrasto (capture: impede o touch.js de agir durante a edição) ----
  document.addEventListener('pointerdown', (e) => {
    if (!aberto) return;
    const b = e.target.closest('.tc-btn, #tc-stick-zone');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    alvo = b;
    const r = b.getBoundingClientRect();
    desloc = { x: e.clientX - r.left, y: e.clientY - r.top };
    b.setPointerCapture(e.pointerId);
    b.classList.add('hud-arrastando');
  }, true);

  document.addEventListener('pointermove', (e) => {
    if (!aberto || !alvo) return;
    alvo.style.left = (e.clientX - desloc.x) + 'px';
    alvo.style.top = (e.clientY - desloc.y) + 'px';
  });

  const soltar = () => {
    if (!alvo) return;
    alvo.classList.remove('hud-arrastando');
    alvo = null;
  };
  document.addEventListener('pointerup', soltar);
  document.addEventListener('pointercancel', soltar);

  // ---- barra do editor ----
  if (overlay) {
    $('hud-editor-fechar').addEventListener('click', fechar);
    $('hud-editor-padrao').addEventListener('click', padrao);
    $('hud-editor-salvar').addEventListener('click', () => {
      const n = salvar();
      const aviso = $('hud-editor-aviso');
      aviso.textContent = `✅ layout salvo (${n} botões) — vale para solo e multiplayer`;
      clearTimeout(aviso._t);
      aviso._t = setTimeout(() => { aviso.textContent = ''; }, 2600);
    });
  }

  return {
    abrir, fechar, salvar, padrao, carregarLayout,
    onFechar(fn) { onFechar = fn; },
    get aberto() { return aberto; },
  };
}
