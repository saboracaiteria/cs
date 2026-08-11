/**
 * hudeditor — editor de HUD estilo CODM.
 *
 * Abre um modo onde cada botão do touch (solo E multiplayer, pelas mesmas
 * classes) pode ser arrastado para qualquer lugar da tela e ter o tamanho
 * ajustado (➕/➖). O layout é salvo no localStorage e reaplicado no boot
 * em todos os modos (solo, DM, BR).
 *
 * Robustez: no modo de edição TODOS os botões são forçados a ficar
 * visíveis via estilo inline (display/position/z-index), sem depender de
 * classe CSS ou do estado do jogo — assim o editor funciona tanto do menu
 * principal quanto de dentro de uma partida pausada.
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
  let alvo = null;
  let desloc = { x: 0, y: 0 };
  let prevToque = false;
  let prevTouchHidden = true;
  let escala = 1; // tamanho global dos botões (0.7 a 1.8)

  function editaveis() {
    return touch ? Array.from(touch.querySelectorAll('.tc-btn, #tc-stick-zone')) : [];
  }

  function aplicarEscala(el) {
    if (escala === 1) { el.style.transform = ''; return; }
    el.style.transform = 'scale(' + escala + ')';
  }


  // congela a posição do botão em px da tela, garantindo que ele NUNCA
  // fique fora da viewport (rect inválido vira fallback pelo CSS ou centro)
  function congelarPosicao(b) {
    const vw = window.innerWidth || 800;
    const vh = window.innerHeight || 600;
    const r = b.getBoundingClientRect();
    const estilo = getComputedStyle(b);
    const w = r.width > 0 ? r.width : (parseFloat(estilo.width) || 66);
    const h = r.height > 0 ? r.height : (parseFloat(estilo.height) || 66);
    let x = r.left;
    let y = r.top;
    // rect zero (layout ainda não calculado / display:none): usa a regra do CSS
    if (!(r.width > 0) || !(r.height > 0)) {
      const right = parseFloat(estilo.right);
      const bottom = parseFloat(estilo.bottom);
      if (isFinite(right)) x = vw - right - w;
      if (isFinite(bottom)) y = vh - bottom - h;
    }
    // garante que fique DENTRO da tela — nunca some
    if (!(x >= 0 && x + w <= vw)) x = Math.max(8, Math.round((vw - w) / 2));
    if (!(y >= 0 && y + h <= vh)) y = Math.max(8, Math.round((vh - h) / 2));
    b.style.position = 'fixed';
    b.style.left = Math.round(x) + 'px';
    b.style.top = Math.round(y) + 'px';
    b.style.right = 'auto';
    b.style.bottom = 'auto';
  }


  function abrir() {
    if (aberto) return;
    aberto = true;
    if (onAbrir) onAbrir(); // fecha a tela de CONTROLES (se estiver aberta)

    prevToque = document.body.classList.contains('toque');
    prevTouchHidden = !!(touch && touch.classList.contains('hidden'));

    document.body.classList.add('toque', 'hud-edit');

    if (touch) {
      touch.classList.remove('hidden');
      touch.style.display = 'block';
      touch.style.zIndex = '950';
      const pad = touch.querySelector('#tc-pad');
      if (pad) {
        pad.classList.remove('hidden');
        pad.style.display = 'block';
        pad.style.pointerEvents = 'none'; // só os botões capturam o dedo
      }
      // mostra TODOS os botões de uma vez e congela a posição atual em px
      for (const b of editaveis()) {
        b.classList.remove('hidden');
        b.style.display = 'block';
        b.style.pointerEvents = 'auto';
        b.style.zIndex = b.id === 'tc-stick-zone' ? '955' : '960';
        congelarPosicao(b);
        aplicarEscala(b);
      }
    }

    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.style.display = 'block';
    }
    if (avisoEl) avisoEl.textContent = 'arraste cada botão · ➕➖ muda o tamanho · 💾 SALVAR guarda';
  }

  function fechar() {
    if (!aberto) return;
    aberto = false;
    document.body.classList.remove('hud-edit');
    if (!prevToque) document.body.classList.remove('toque');
    if (touch) {
      if (prevTouchHidden) touch.classList.add('hidden');
      touch.style.display = '';
      touch.style.zIndex = '';
      for (const b of editaveis()) {
        b.style.zIndex = '';
        b.style.display = '';
        b.style.pointerEvents = '';
        b.style.transform = '';
        if (!b.dataset.hudSalvo) {
          b.style.position = '';
          b.style.left = '';
          b.style.top = '';
          b.style.right = '';
          b.style.bottom = '';
        }
      }
    }
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.style.display = '';
    }
    if (onFechar) onFechar();
  }

  function salvar() {
    const layout = {};
    for (const b of editaveis()) {
      const chave = b.dataset.hud;
      if (!chave || b.style.left === '' || b.style.top === '') continue;
      layout[chave] = {
        left: Math.round(parseFloat(b.style.left)),
        top: Math.round(parseFloat(b.style.top)),
      };
    }
    const dados = { escala, botoes: layout };
    try { localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch (e) { /* armazenamento bloqueado */ }
    for (const b of editaveis()) b.dataset.hudSalvo = '';
    return Object.keys(layout).length;
  }

  function padrao() {
    try { localStorage.removeItem(CHAVE); } catch (e) { /* ignore */ }
    escala = 1;
    for (const sel of Object.values(MAPA)) {
      for (const el of document.querySelectorAll(sel)) {
        el.style.position = '';
        el.style.left = '';
        el.style.top = '';
        el.style.right = '';
        el.style.bottom = '';
        el.style.transform = '';
        el.style.zIndex = '';
        delete el.dataset.hudSalvo;
      }
    }
    // recongela a posição do layout padrão para continuar editando
    if (aberto && touch) {
      for (const b of editaveis()) {
        const r = b.getBoundingClientRect();
        if (r.width > 0 || r.height > 0) {
          b.style.position = 'fixed';
          b.style.left = r.left + 'px';
          b.style.top = r.top + 'px';
          b.style.right = 'auto';
          b.style.bottom = 'auto';
        }
      }
    }
  }

  function carregarLayout() {
    let dados = null;
    try { dados = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { dados = null; }
    if (!dados) return;
    escala = typeof dados.escala === 'number' ? dados.escala : 1;
    const layout = dados.botoes || dados; // compatível com formato antigo
    for (const [chave, pos] of Object.entries(layout)) {
      const sel = MAPA[chave];
      if (!sel || !pos) continue;
      for (const el of document.querySelectorAll(sel)) {
        el.style.position = 'fixed';
        el.style.left = (pos.left ?? 0) + 'px';
        el.style.top = (pos.top ?? 0) + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        aplicarEscala(el);
      }
    }
  }

  function mudarEscala(delta) {
    escala = Math.min(1.8, Math.max(0.7, Math.round((escala + delta) * 10) / 10));
    for (const b of editaveis()) aplicarEscala(b);
    if (avisoEl) {
      avisoEl.textContent = 'tamanho: ' + Math.round(escala * 100) + '%';
      clearTimeout(mudarEscala._t);
      mudarEscala._t = setTimeout(() => { avisoEl.textContent = ''; }, 1500);
    }
  }

  // arrasto — listeners globais só agem com o editor aberto
  document.addEventListener('pointerdown', (e) => {
    if (!aberto) return;
    if (e.target.closest && e.target.closest('#hud-editor-bar, #hud-editor-aviso')) return;
    const b = e.target.closest ? e.target.closest('.tc-btn, #tc-stick-zone') : null;
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    alvo = b;
    const r = b.getBoundingClientRect();
    desloc = { x: e.clientX - r.left, y: e.clientY - r.top };
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    b.classList.add('hud-arrastando');
  }, true);

  document.addEventListener('pointermove', (e) => {
    if (!aberto || !alvo) return;
    alvo.style.left = (e.clientX - desloc.x) + 'px';
    alvo.style.top = (e.clientY - desloc.y) + 'px';
  });

  const soltar = () => {
    if (alvo) {
      alvo.classList.remove('hud-arrastando');
      alvo = null;
    }
  };
  document.addEventListener('pointerup', soltar);
  document.addEventListener('pointercancel', soltar);

  // barra do editor
  if (btnSalvar) btnSalvar.addEventListener('click', () => {
    const n = salvar();
    if (avisoEl) {
      avisoEl.textContent = '✅ layout salvo (' + n + ' botões) — vale para solo e multiplayer';
      clearTimeout(btnSalvar._t);
      btnSalvar._t = setTimeout(() => { avisoEl.textContent = ''; }, 2500);
    }
  });
  if (btnPadrao) btnPadrao.addEventListener('click', () => {
    padrao();
    if (avisoEl) {
      avisoEl.textContent = '↺ layout padrão restaurado';
      clearTimeout(btnPadrao._t);
      btnPadrao._t = setTimeout(() => { avisoEl.textContent = ''; }, 2000);
    }
  });
  if (btnFechar) btnFechar.addEventListener('click', fechar);
  if (btnMenos) btnMenos.addEventListener('click', () => mudarEscala(-0.1));
  if (btnMais) btnMais.addEventListener('click', () => mudarEscala(0.1));

  // botão na tela de CONTROLES — ligado aqui mesmo (independe do game.js)
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
