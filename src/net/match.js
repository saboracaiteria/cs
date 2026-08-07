/**
 * Match — partida multiplayer no cliente.
 * Renderiza os avatares (Human) na cena já construída pelo jogo single,
 * controla a câmera própria, envia input autoritativo e aplica snapshots.
 */
import { SnapshotBuffer } from './snapshot.js';
import { RemotePlayer } from './remotePlayer.js';
import { criarKillfeed } from '../ui/killfeed.js';
import { criarScoreboard } from '../ui/scoreboard.js';
import { criarBrHud } from '../ui/brHud.js';
import { criarNetStatus } from '../ui/netStatus.js';
import { criarPausa } from '../ui/pause.js';
import { Car } from '../ent/car.js';
import * as THREE from '../../vendor/three.module.js';
import { T } from './protocol.js';
import { CAMERA } from '../config.js';
import { clamp, damp } from '../utils.js';

const INPUT_HZ = 20;

export class Match {
  constructor(game, net, info) {
    this.game = game;
    this.net = net;
    this.modo = info.modo;
    this.meuId = info.meuId;
    this.nick = info.nick;

    this.snapBuf = new SnapshotBuffer();
    this.avatares = new Map();   // id -> RemotePlayer
    this.nicks = new Map();      // id -> nick

    this.killfeed = criarKillfeed();
    this.scoreboard = criarScoreboard();
    this.brHud = criarBrHud();
    this.netStatus = criarNetStatus();

    // reusa a câmera do pipeline (composer) — renderizar com câmera própria
    // fora do composer deixava a tela do MP só com o céu laranja
    this.camera = this.game.gfx.camera;
    this.camera.rotation.order = 'YXZ';

    // input local
    this.inp = { mx: 0, mz: 0, run: false, jump: false, fire: false, ads: false };
    this.yaw = Math.PI;
    this.pitch = -0.22;
    // câmera de ombro (terceira pessoa), igual à do single
    this._camDist = CAMERA.defaultZoom;
    this._camFocus = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this._sendAcc = 0;
    this._pingAcc = 0;
    this._seq = 0;

    this._hp = 100;
    this._arma = 'pistola';
    this._morto = false;
    this._rodando = false;
    this._raf = null;
    this._ult = 0;
    this._pausado = false;      // pausa única (mesma tela/menus do solo)
    this._zona = null;          // {x,z,r} da zona do BR (minimapa)
    this._clockAcc = 0;
    this._dist = CAMERA.defaultZoom;   // zoom da câmera (faltava init: NaN)

    // veiculos do MP (carros autoritativos vindos do servidor)
    this.carrosMp = new Map();   // id -> { mesh: Car, x, y, z, playerId }
    this._emCarro = false;
    this._toggleCar = false;
    this._fireBtn = false;   // gatilho do botão ATIRAR do toque (segurar = rajada)

    this._ligarListeners();
  }

  // ------------------------------------------------------------- setup
  iniciar() {
    // para o laço do single player ANTES de qualquer coisa: sem isto a câmera
    // do título (orbital) e a do multiplayer brigavam pelo mesmo canvas
    if (window.__pararLoopSingle) window.__pararLoopSingle();
    // sem arma na tela: em terceira pessoa a pistola aparece na MÃO do Bob,
    // que fica visível na frente da câmera com o papagaio voando ao lado
    if (this.game && this.game.viewmodel) {
      this._viewmodelAntes = this.game.viewmodel.visible;
      this.game.viewmodel.visible = false;
    }
    // esconde o transito e pedestres do single — no MP os carros vêm do servidor
    if (this.game && this.game.cars) this.game.cars.group.visible = false;
    if (this.game && this.game.peds) this.game.peds.group.visible = false;

    // esconde a tela de abertura do single
    const ab = document.getElementById('title-screen');
    if (ab) ab.classList.add('hidden');

    // MESMO HUD do modo solo no MP: corações (vida), minimapa, relógio, FPS,
    // mira, dicas e avisos — some só o que não faz sentido (objetivo de
    // missão e a fileira de pontos/tempo/entregas)
    const hud = document.getElementById('hud');
    if (hud) hud.classList.remove('hidden');
    this._prepararHudSolo();

    const hudMp = document.getElementById('mp-hud');
    if (hudMp) hudMp.classList.remove('hidden');
    const ns = document.getElementById('net-status');
    if (ns) ns.classList.remove('hidden');
    this.netStatus.setEstado('conectando');
    if (this.modo === 'br') this.brHud.mostrar();
    const joy = document.getElementById('mp-joy');
    if (joy) joy.classList.toggle('hidden', !(this.game && this.game.toque));
    const look = document.getElementById('mp-look');
    if (look) look.classList.toggle('hidden', !(this.game && this.game.toque));
    const pad = document.getElementById("mp-pad");
    if (pad) pad.classList.toggle("hidden", !(this.game && this.game.toque));
    if (this.game && this.game.toque && this.game._telaCheia) this.game._telaCheia();
    // botão de pausa na tela (só no toque; no PC é ESC/Pause)
    this._pausaBtn = document.getElementById('mp-pausa');
    if (this._pausaBtn) {
      this._pausaBtn.classList.toggle('hidden', !(this.game && this.game.toque));
      this._pausaBtnHandler = () => this._togglePausa();
      this._pausaBtn.addEventListener('click', this._pausaBtnHandler);
    }

    // pausa única — os MESMOS menus de OPÇÕES e CONTROLES do modo solo
    this.pausa = criarPausa();
    this.pausa.ligar({
      retomar: () => this._retomar(),
      opcoes: () => { if (this.game) this.game._abrirOpcoes(true); },
      controles: () => { if (this.game && this.game.keys) this.game.keys.abrir(); },
      sair: () => { this.pausa.esconder(); this.sair(); },
    });
    // [Android] botão voltar da barra de navegação abre/fecha a pausa
    this._ligarBack();

    // feedback local das balas (dano é do servidor): faísca vermelha ao
    // acertar um avatar, laranja num carro — guarda os callbacks do solo
    if (this.game && this.game.bullets) {
      const bul = this.game.bullets;
      this._bulletsAntes = {
        onHitFoe: bul.onHitFoe, onHitCar: bul.onHitCar, onHitPed: bul.onHitPed,
      };
      this._up = new THREE.Vector3(0, 1, 0);
      bul.onHitFoe = (foe, ponto) => this.game.fx.impact(ponto, this._up, { r: 3.2, g: 0.5, b: 0.4 });
      bul.onHitCar = (car, ponto) => this.game.fx.impact(ponto, this._up, { r: 3.2, g: 1.8, b: 0.5 });
      bul.onHitPed = null;
    }

    // avatares para os jogadores conhecidos
    for (const [id, info] of this.nicks) this._garantirAvatar(id, info);

    this._rodando = true;
    this._ult = performance.now();
    this._loop(this._ult);
  }

  _ligarListeners() {
    this._kd = (e) => {
      if (e.code === 'Escape' || e.code === 'Pause') { this._togglePausa(); return; }
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') this.inp.mz += 1;
      if (k === 's' || k === 'arrowdown') this.inp.mz -= 1;
      if (k === 'a' || k === 'arrowleft') this.inp.mx -= 1;
      if (k === 'd' || k === 'arrowright') this.inp.mx += 1;
      if (k === 'shift') this.inp.run = true;
      if (k === ' ') { this.inp.jump = true; e.preventDefault(); }
      if (k === 'tab') { e.preventDefault(); this.scoreboard.alternar(); }
      if (k === 'e') this._toggleCar = true;
      this._norm();
    };
    this._ku = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') this.inp.mz -= 1;
      if (k === 's' || k === 'arrowdown') this.inp.mz += 1;
      if (k === 'a' || k === 'arrowleft') this.inp.mx += 1;
      if (k === 'd' || k === 'arrowright') this.inp.mx -= 1;
      if (k === 'shift') this.inp.run = false;
      if (k === ' ') this.inp.jump = false;
      this._norm();
    };

    // mouse: mover = olhar (pointer lock) ou arrastar; clique = atirar.
    // Toques NÃO atiram: no celular o gatilho é só o botão ATIRAR (igual ao solo)
    this._pd = (e) => {
      if (e.pointerType === 'touch') return;
      if (this._pausado) return;   // menu aberto: cliques são do painel
      this._dragX = e.clientX; this._dragY = e.clientY;
      this._dragOn = true;
      this._fire = true;
      try { document.body.requestPointerLock?.(); } catch {}
    };
    this._pu = () => { this._dragOn = false; this._fire = false; };
    this._pm = (e) => {
      if (document.pointerLockElement) {
        this.yaw -= e.movementX * 0.0024;
        this.pitch -= e.movementY * 0.0024;
      } else if (this._dragOn) {
        const dx = e.clientX - this._dragX, dy = e.clientY - this._dragY;
        this._dragX = e.clientX; this._dragY = e.clientY;
        this.yaw -= dx * 0.004;
        this.pitch -= dy * 0.004;
      }
      this._clampAim();
    };
    // scroll do mouse aproxima/afasta a câmera (fora do carro)
    this._zw = (e) => {
      if (this._emCarro) return;
      if (this._pausado) return;   // rolar o menu não mexe no zoom
      this._dist = clamp(this._dist - e.deltaY * 0.004, CAMERA.minZoom, CAMERA.maxZoom);
    };

    // touch: joystick esquerdo + olhar/atirar à direita
    this._tjs = null;
    this._joy = document.getElementById('mp-joy');
    this._lookEl = document.getElementById('mp-look');

    this._touchStart = (e) => {
      // pausa/opções abertas: o toque é do MENU — sem preventDefault, o
      // scroll nativo das opções funciona (antes a página não rolava)
      if (this._pausado) return;
      for (const t of e.changedTouches) {
        // toque em botão/menu: deixa o clique sintético acontecer (☰, pausa,
        // placar...) — o preventDefault aqui matava os clicks no mobile
        if (t.target.closest('button, .btn, [data-acao], [data-segura]')) continue;
        const x = t.clientX, y = t.clientY;
        const jr = this._joy ? this._joy.getBoundingClientRect() : null;
        if (jr && x >= jr.left && x <= jr.right && y >= jr.top && y <= jr.bottom) {
          // toque no joystick
          this._tjs = { id: t.identifier, cx: jr.left + jr.width / 2, cy: jr.top + jr.height / 2 };
          this._joyTouch = { id: t.identifier, x, y };
          e.preventDefault();
        } else {
          // área de olhar: arrastar gira a câmera (tap curto NÃO atira —
          // o gatilho é só o botão ATIRAR, igual ao modo solo)
          if (!this._lt) this._lt = { id: t.identifier, x, y, t0: performance.now(), drag: false };
          e.preventDefault();
        }
      }
    };
    this._touchMove = (e) => {
      if (this._pausado) return;   // pausa: o dedo é do menu, não do jogo
      for (const t of e.changedTouches) {
        if (this._lt && t.identifier === this._lt.id) {
          const dx = t.clientX - this._lt.x, dy = t.clientY - this._lt.y;
          if (!this._lt.drag && Math.hypot(dx, dy) > 10) this._lt.drag = true;
          if (this._lt.drag) {
            this.yaw -= dx * 0.005;
            this.pitch -= dy * 0.005;
            this._lt.x = t.clientX; this._lt.y = t.clientY;
            this._clampAim();
          }
          e.preventDefault();
        } else if (this._joyTouch && t.identifier === this._joyTouch.id) {
          const jr = this._joy.getBoundingClientRect();
          const cx = jr.left + jr.width / 2, cy = jr.top + jr.height / 2;
          let dx = t.clientX - cx, dy = t.clientY - cy;
          const d = Math.hypot(dx, dy), R = jr.width / 2 - 12;
          if (d > R) { dx = dx / d * R; dy = dy / d * R; }
          this.inp.mx = dx / R;
          this.inp.mz = -dy / R;
          const knob = this._joy.querySelector('.knob');
          if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
          e.preventDefault();
        }
      }
    };
    this._touchEnd = (e) => {
      for (const t of e.changedTouches) {
        if (this._lt && t.identifier === this._lt.id) {
          this._lt = null;
        }
        if (this._joyTouch && t.identifier === this._joyTouch.id) {
          this._joyTouch = null;
          this.inp.mx = 0; this.inp.mz = 0;
          const knob = this._joy?.querySelector('.knob');
          if (knob) knob.style.transform = 'translate(0,0)';
        }
      }
    };

    // botões de ação do toque (ATIRAR/PULAR/AÇÃO/CORRER) — mesmo padrão do solo
    this._mpBtns = [];
    const ligaBtn = (id, down, up) => {
      const el = document.getElementById(id);
      if (!el) return;
      const d = (ev) => { ev.preventDefault(); ev.stopPropagation(); down(); el.classList.add('press'); };
      const u = (ev) => { ev.preventDefault(); ev.stopPropagation(); if (up) up(); el.classList.remove('press'); };
      el.addEventListener('touchstart', d, { passive: false });
      el.addEventListener('touchend', u, { passive: false });
      el.addEventListener('touchcancel', u, { passive: false });
      el.addEventListener('mousedown', d);
      el.addEventListener('mouseup', u);
      el.addEventListener('mouseleave', u);
      this._mpBtns.push({ el, d, u });
    };
    ligaBtn('mp-atirar', () => { this._fireBtn = true; }, () => { this._fireBtn = false; });
    ligaBtn('mp-pular', () => { this.inp.jump = true; }, () => { this.inp.jump = false; });
    ligaBtn('mp-acao', () => { this._toggleCar = true; });
    ligaBtn('mp-correr', () => { this.inp.run = true; }, () => { this.inp.run = false; });
    // [COD Mobile] o botão ATIRAR também é o analógico de mira, igual ao
    // solo: o dedo FIRME atira em rajada; DESLIZANDO, a câmera gira e a
    // mira acompanha o arrasto — dá para segurar o recuo sem largar o
    // gatilho (só toque; no PC o olhar já é o mouse)
    this._mpMira = null;
    const miraEl = document.getElementById('mp-atirar');
    if (miraEl) {
      const m = { el: miraEl, down: null, move: null, up: null };
      let ancora = null, pend = { x: 0, y: 0 };
      m.down = (ev) => {
        if (ev.pointerType !== 'touch') return;
        ancora = { x: ev.clientX, y: ev.clientY };
        pend = { x: 0, y: 0 };
        try { miraEl.setPointerCapture(ev.pointerId); } catch {}
      };
      m.move = (ev) => {
        if (!ancora) return;
        pend.x += ev.clientX - ancora.x;
        pend.y += ev.clientY - ancora.y;
        ancora = { x: ev.clientX, y: ev.clientY };
        // micro-tremor do polegar parado não mexe na mira; passou disso,
        // o dedo deslizando gira a câmera (a mira acompanha o arrasto)
        if (Math.hypot(pend.x, pend.y) < 3) return;
        this.yaw -= pend.x * 0.005;
        this.pitch -= pend.y * 0.005;
        this._clampAim();
        pend = { x: 0, y: 0 };
      };
      m.up = () => { ancora = null; pend = { x: 0, y: 0 }; };
      miraEl.addEventListener('pointerdown', m.down);
      miraEl.addEventListener('pointermove', m.move);
      miraEl.addEventListener('pointerup', m.up);
      miraEl.addEventListener('pointercancel', m.up);
      this._mpMira = m;
    }
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('pointerdown', this._pd);
    window.addEventListener('pointerup', this._pu);
    window.addEventListener('pointermove', this._pm);
    window.addEventListener('wheel', this._zw, { passive: true });
    document.addEventListener('touchstart', this._touchStart, { passive: false });
    document.addEventListener('touchmove', this._touchMove, { passive: false });
    document.addEventListener('touchend', this._touchEnd, { passive: false });
  }

  _norm() {
    const d = Math.hypot(this.inp.mx, this.inp.mz);
    if (d > 1) { this.inp.mx /= d; this.inp.mz /= d; }
  }

  _clampAim() {
    this.pitch = Math.max(CAMERA.pitchMin, Math.min(CAMERA.pitchMax, this.pitch));
  }

  // ------------------------------------------------------- rede (msg)
  tratar(msg) {
    switch (msg.t) {
      case T.SNAPSHOT:
        this._snap(msg);
        break;
      case T.KILL:
      case T.DEATH: {
        const morto = this._nick(msg.id);
        const por = msg.por != null ? this._nick(msg.por) : 'zona';
        if (msg.t === T.KILL) this.killfeed.add(morto, por, msg.arma, msg.id === this.meuId);
        if (msg.id === this.meuId) this._morreu(por);
        break;
      }
      case T.RESPAWN:
        if (msg.id === this.meuId) this._revive();
        break;
      case T.WINNER:
        this._vencedor(msg);
        break;
      case T.LOOT_LIST:
        if (this.brHud) this.brHud.atualizar({ loot: (msg.itens || []).length }, this.meuId, null);
        break;
      case T.SPAWN:
        break;   // BR sem avião: os jogadores nascem espalhados pelo mapa

      case T.PLAYER_LEFT:
      case T.BOT_SAIU:
        this._removerAvatar(msg.id);
        break;
      case T.CAR_BOOM:
        this._explodirCarro(msg);
        break;
      case T.CHAT:
        break;
      default:
        break;
    }
  }

  _snap(msg) {
    this.snapBuf.push(msg);
    // registra nicks e garante avatares
    for (const p of msg.players || []) {
      if (p.nick) this.nicks.set(p.id, { nick: p.nick, bot: p.bot });
      this._garantirAvatar(p.id);
    }
    // HUD do jogador local
    const eu = (msg.players || []).find((p) => p.id === this.meuId);
    if (eu) {
      this._hp = eu.hp ?? this._hp;
      this._arma = eu.arma || this._arma;
      this._atualizarHud();
    }
    // scoreboard
    this.scoreboard.atualizar((msg.players || []).map((p) => ({ ...p, local: p.id === this.meuId })));
    // BR
    if (this.modo === 'br') {
      if (msg.zone) this._zona = { x: msg.zone.x, z: msg.zone.z, r: msg.zone.r };
      const pos = this.snapBuf.ultimo() && eu ? { x: eu.x, z: eu.z } : null;
      this.brHud.atualizar(msg, this.meuId, pos);
    }
    // carros + estado do veiculo do jogador local
    if (msg.cars) this._aplicarCarros(msg.cars);
    if (eu) this._emCarro = eu.inCar != null;
  }

  _garantirAvatar(id) {
    if (this.avatares.has(id)) return;
    const info = this.nicks.get(id) || { nick: '?', bot: false };
    // o jogador local também ganha avatar: o Bob com arma e o papagaio
    // voando — a câmera de ombro mostra o corpo dele em terceira pessoa
    const rp = new RemotePlayer(this.game.gfx.scene, { id, ...info }, { local: id === this.meuId });
    this.avatares.set(id, rp);
  }

  _removerAvatar(id) {
    const rp = this.avatares.get(id);
    if (rp) { rp.remover(); this.avatares.delete(id); }
    this.nicks.delete(id);
  }

  _nick(id) {
    return this.nicks.get(id)?.nick || '?';
  }

  // ------------------------------------------------------------ loop
  _loop(now) {
    if (!this._rodando) return;
    this._raf = requestAnimationFrame((t) => this._loop(t));
    const dt = Math.min(0.05, Math.max(0.0001, (now - this._ult) / 1000));
    this._ult = now;

    if (!this._pausado) this._update(dt);
    this.game.gfx.render();   // pipeline completo (composer): sem isto só o céu aparecia
  }

  _update(dt) {
    if (this._pausado) return;   // pausa: congela o cliente (não envia input)

    // HUD do solo vivo no MP: FPS e relógio (o laço do single está parado)
    if (this.game && this.game.hud) {
      this.game.hud.tickFPS(dt);
      this._clockAcc += dt;
      if (this._clockAcc >= 1) {
        this._clockAcc = 0;
        const d = new Date();
        const h = d.getHours();
        this.game.hud.setClock(
          String(h).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'),
          h >= 19 || h < 6,
        );
      }
    }
    // interpola avatares
    const alpha = this.snapBuf.alpha();
    for (const [id, rp] of this.avatares) {
      const d = this.snapBuf.ler(id, alpha);
      if (!d) continue;
      rp.aplicar(d);
      // o avatar local gira com o mouse na hora (a posição continua vindo
      // do servidor) — sem isto a câmera parece "travada" pela latência
      if (rp.local) { rp.yaw = this.yaw; rp.pitch = this.pitch; }
      // morte: o corpo explode como no solo (vale para bots e jogadores)
      if (!rp.vivo && !rp._explodiu) {
        rp._explodiu = true;
        if (this.game && this.game.fx) {
          this.game.fx.explode(new THREE.Vector3(rp.x, rp.y + 0.9, rp.z), 0.7);
          if (this.game.audio) this.game.audio.explosao(0.7);
        }
      } else if (rp.vivo) {
        rp._explodiu = false;
      }
      // velocidades do MP/BR (5.1/11.6 — ~20% abaixo do solo 6.4/14.5)
      const vel = Math.hypot(d.moveX || 0, d.moveZ || 0) * (d.run ? 11.6 : 5.1);
      rp.update(dt, vel);
      // corpo do próprio jogador visível a pé; dentro do carro ele some
      if (rp.local) rp.human.root.visible = rp.vivo && !this._emCarro;
    }
    // câmera de ombro em terceira pessoa, igual à do single: o mouse gira
    // o olhar na hora (sem a latência do servidor) e a câmera se posiciona
    // atrás e à direita do Bob, que fica visível com a arma na mão
    const eu = this.snapBuf.ler(this.meuId, alpha);
    const foc = this._camFocus;
    if (eu) foc.set(eu.x, eu.y + 1.48, eu.z);
    else foc.set(0, 2, 0);
    const noCarro = this._emCarro;
    const ombro = noCarro ? 0 : CAMERA.shoulderX;
    // [tiro] tracer local — dano é autoritativo do servidor (feedback igual ao solo)
    if ((this._fire || this._fireBtn) && foc) {
      const agoraT = performance.now();
      if (agoraT - (this._lastTiroT || 0) > 130) {
        this._lastTiroT = agoraT;
        const rpLoc = this.avatares.get(this.meuId);
        if (rpLoc) rpLoc.setAiming(true);
        const dirT = new THREE.Vector3();
        this.camera.getWorldDirection(dirT);
        const dxT = dirT.x;
        const dyT = dirT.y;
        const dzT = dirT.z;
        const oT = this.camera.position.clone().addScaledVector(dirT, 0.6);
        const colT = this.game.col;
        let fimT = null;
        if (colT) {
          const hitT = colT.raycast(oT.x, oT.y, oT.z, dxT, dyT, dzT, 160);
          if (hitT) fimT = new THREE.Vector3(oT.x + dxT * hitT.t, oT.y + dyT * hitT.t, oT.z + dzT * hitT.t);
        }
        if (!fimT) fimT = oT.clone().add(new THREE.Vector3(dxT, dyT, dzT).multiplyScalar(160));
        if (!this._tracer) {
          const gT = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
          this._tracer = new THREE.Line(gT, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.85 }));
          this._tracer.frustumCulled = false;
          this.game.gfx.scene.add(this._tracer);
        }
        const posT = this._tracer.geometry.attributes.position;
        posT.setXYZ(0, oT.x, oT.y, oT.z);
        posT.setXYZ(1, fimT.x, fimT.y, fimT.z);
        posT.needsUpdate = true;
        this._tracer.visible = true;
        this._tracerVida = 0.08;
        this.game.bullets?.fire(oT, new THREE.Vector3(dxT, dyT, dzT));
        if (this.game && this.game.audio) this.game.audio.tiro();
      }
    }
    if (this._tracer) {
      if (this._tracerVida > 0) this._tracerVida -= dt;
      else this._tracer.visible = false;
    }
    if (!(this._fire || this._fireBtn)) {
      const rpLoc2 = this.avatares.get(this.meuId);
      if (rpLoc2) rpLoc2.setAiming(false);
    }
    // balas e partículas do SOLO rodando no MP: sem isto o projétil não
    // avança nem cria faísca ao bater (e explosão nenhuma anima)
    this._sincronizarAlvosBala();
    if (this.game && this.game.bullets) this.game.bullets.update(dt);
    if (this.game && this.game.fx) this.game.fx.update(dt);
    this._camDist = damp(this._camDist, noCarro ? CAMERA.carZoom : this._dist, 9, dt);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
    let dist = this._camDist;
    // olhar para cima encurta o braço: sem isto a câmera mergulha no chão
    const t = (this.pitch - CAMERA.pitchTuckStart) / (CAMERA.pitchMax - CAMERA.pitchTuckStart);
    dist *= 1 - clamp(t, 0, 1) * CAMERA.pitchTuck;
    const back = dir.clone().negate();
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const col = this.game.col;
    // não deixa a câmera entrar dentro de prédio
    if (col) {
      const hit = col.raycast(
        foc.x + right.x * ombro, foc.y, foc.z + right.z * ombro,
        back.x, back.y, back.z, dist + 0.6,
      );
      if (hit) dist = Math.max(CAMERA.minZoom * 0.45, hit.t - 0.45);
    }
    this.camera.position.copy(foc).addScaledVector(back, dist).addScaledVector(right, ombro);
    // e nunca abaixo do chão (a mira sobe junto com o empurrão)
    let lift = 0;
    if (col) {
      const floor = col.groundHeightAt(this.camera.position.x, this.camera.position.z, this.camera.position.y) + 0.45;
      lift = Math.max(0, floor - this.camera.position.y);
      this.camera.position.y += lift;
    }
    this._camLook.copy(foc);
    this._camLook.y += lift;
    this.camera.lookAt(this._camLook);

    // envia input a INPUT_HZ
    this._sendAcc += dt;
    if (this._sendAcc >= 1 / INPUT_HZ) {
      this._sendAcc = 0;
      this.net.input({
        yaw: this.yaw,
        pitch: this.pitch,
        moveX: this.inp.mx,
        moveZ: this.inp.mz,
        run: this.inp.run,
        jump: this.inp.jump,
        fire: !!(this._fire || this._dragOn || this._fireBtn),
        ads: !!(this._fire || this._dragOn || this._fireBtn),
        car: this._toggleCar ? this._alvoCarro() : null,
      });
      this._toggleCar = false;
      this._fire = false;   // tiro único por input (rajada via clique segura)
      this.inp.jump = false;
    }
    // dicas no MESMO lugar do HUD do solo: carros no DM, nada de avião no BR
    if (this._emCarro) this._setHint('E — sair do carro');
    else {
      const alvo = this._alvoCarro();
      if (alvo != null) this._setHint('E — entrar no carro');
      else this._setHint(null);
    }
    // minimapa do solo no MP: posição do jogador + círculo da zona no BR.
    // O yaw segue o MESMO do solo (player.yaw = câmera + PI + bodyTurn) —
    // passar o yaw da câmera direto deixava o radar de cabeça para baixo.
    if (eu && this.game && this.game.minimap) {
      const marks = { pickup: null, deliver: null, heli: null, portais: null, players: [] };
      if (this.modo === 'br' && this._zona) marks.zone = this._zona;
      for (const [id, rp] of this.avatares) {
        if (id === this.meuId || !rp || !rp.root) continue;
        marks.players.push({ x: rp.root.position.x, z: rp.root.position.z });
      }
      this.game.minimap.draw(dt, { x: eu.x, z: eu.z, yaw: this.yaw + Math.PI + CAMERA.bodyTurn }, marks, null);
    }
    // rodas dos carros
    for (const cr of this.carrosMp.values()) cr.mesh.spinWheels(dt);
    // ping a cada 2s
    this._pingAcc += dt;
    if (this._pingAcc >= 2) {
      this._pingAcc = 0;
      this.net.ping(performance.now());
      this.netStatus.setPing(this.net.rtt);
      this.netStatus.setEstado(this.net.estado);
    }
  }

  // ------------------------------------------------------------ HUD
  _atualizarHud() {
    // a vida agora aparece nos corações do HUD do solo (0-100 -> 6 ❤)
    if (this.game && this.game.hud) {
      const cor = Math.max(0, Math.min(6, Math.ceil(this._hp / (100 / 6))));
      this.game.hud.setHearts(cor);
    }
  }

  _morreu(por) {
    if (this._morto) return;
    this._morto = true;
    const rp = this.avatares.get(this.meuId);
    if (rp) rp.vivo = false;   // corpo e papagaio somem da cena
    const ov = document.getElementById('mp-overlay');
    if (ov) {
      ov.classList.remove('hidden');
      ov.className = 'mp-overlay morte';
      ov.querySelector('.ov-titulo').textContent = 'VOCÊ MORREU';
      ov.querySelector('.ov-sub').textContent = `Eliminado por ${por}`;
      const btn = ov.querySelector('.mp-btn');
      btn.style.display = 'none';
    }
    if (this.brHud) this.brHud.esconder();
  }

  _revive() {
    this._morto = false;
    const rp = this.avatares.get(this.meuId);
    if (rp) rp.vivo = true;
    const ov = document.getElementById('mp-overlay');
    if (ov) ov.classList.add('hidden');
    if (this.modo === 'br') this.brHud.mostrar();
  }

  _vencedor(msg) {
    const ov = document.getElementById('mp-overlay');
    if (!ov) return;
    ov.classList.remove('hidden');
    const venceu = msg.id === this.meuId;
    ov.className = 'mp-overlay ' + (venceu ? 'vitoria' : '');
    ov.querySelector('.ov-titulo').textContent = venceu ? 'VITÓRIA! 🏆' : 'FIM DE PARTIDA';
    ov.querySelector('.ov-sub').textContent = venceu ? 'Você é o último de pé!' : `${msg.nick || 'Alguém'} venceu`;
    ov.querySelector('.ov-kills').textContent = 'Partida encerrada — obrigado por jogar!';
    const btn = ov.querySelector('.mp-btn');
    btn.style.display = '';
    btn.textContent = 'VOLTAR AO MENU';
    btn.onclick = () => {
      ov.classList.add('hidden');
      this.sair();
    };
  }

  // ------------------------------------------------------------ veiculos
  _aplicarCarros(lista) {
    for (const c of lista) {
      // carro explodiu no servidor: some da cena de vez
      if (c.destroyed) {
        const velho = this.carrosMp.get(c.id);
        if (velho) {
          velho.mesh.dispose(this.game.gfx.scene);
          this.carrosMp.delete(c.id);
        }
        continue;
      }
      let cr = this.carrosMp.get(c.id);
      if (!cr) {
        const mesh = new Car(c.cor || 0xe53935, Math.random);
        this.game.gfx.scene.add(mesh.root);
        cr = { mesh, x: c.x, y: c.y, z: c.z, playerId: null };
        this.carrosMp.set(c.id, cr);
      }
      cr.x = c.x; cr.y = c.y; cr.z = c.z;
      cr.playerId = c.playerId;
      cr.mesh.root.position.set(c.x, c.y, c.z);
      cr.mesh.yaw = c.yaw;
      cr.mesh.syncTransform();
      cr.mesh.speed = c.speed;
    }
  }

  /** Carro destruído no servidor: explosão grande + some da cena. */
  _explodirCarro(msg) {
    const cr = this.carrosMp.get(msg.id);
    if (!cr) return;
    const p = new THREE.Vector3(cr.x, cr.y + 0.6, cr.z);
    if (this.game && this.game.fx) {
      this.game.fx.explode(p, 1.8);
      if (this.game.audio) this.game.audio.explosao(1.8);
    }
    cr.mesh.dispose(this.game.gfx.scene);
    this.carrosMp.delete(msg.id);
  }

  /** Alvos locais das balas (avatares e carros) — o dano é do servidor;
   *  aqui é só o feedback visual (faísca no corpo/carro), igual ao solo. */
  _sincronizarAlvosBala() {
    const bul = this.game && this.game.bullets;
    if (!bul) return;
    const foes = [];
    for (const rp of this.avatares.values()) {
      if (!rp._alvo) rp._alvo = { vivo: true, root: rp.root, alturaAlvo: 1.15, raioAcerto: 0.55 };
      rp._alvo.vivo = rp.vivo;
      foes.push(rp._alvo);
    }
    bul.targets.foes = foes.length ? foes : null;
    const cars = [];
    let meuCarro = null;
    for (const cr of this.carrosMp.values()) {
      if (!cr._alvo) cr._alvo = { alive: true, root: cr.mesh.root };
      cr._alvo.alive = true;
      cars.push(cr._alvo);
      if (cr.playerId === this.meuId) meuCarro = cr._alvo;
    }
    bul.targets.cars = cars.length ? { cars } : null;
    bul.ignoreCar = meuCarro;   // bala não acerta o próprio carro (sai de dentro dele)
  }

  /** Carro livre mais proximo do jogador (raio 4.5) ou 0 (sair do atual). */
  _alvoCarro() {
    if (this._emCarro) return 0;
    const snap = this.snapBuf.ultimo();
    const eu = snap && snap.players ? snap.players.find((p) => p.id === this.meuId) : null;
    if (!eu) return null;
    let best = null, bestD = 4.5 * 4.5;
    for (const [id, cr] of this.carrosMp) {
      if (cr.playerId != null) continue;
      const dx = cr.x - eu.x, dz = cr.z - eu.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  /** Dica contextual no MESMO lugar do HUD do solo. */
  _setHint(texto) {
    if (this.game && this.game.hud) this.game.hud.setPrompt(texto);
  }

  fimPartida(msg) {
    this._vencedor(msg);
  }

  // ------------------------------------------------------------ pausa
  /** Pausa única — mesma tela e os mesmos menus de OPÇÕES/CONTROLES do solo. */
  _togglePausa() {
    // telas abertas fecham antes da pausa (mesma ordem do modo solo)
    const opcoes = document.getElementById('options-screen');
    if (opcoes && !opcoes.classList.contains('hidden')) {
      if (this.game) this.game._abrirOpcoes(false);
      return;
    }
    if (this.game && this.game.keys && this.game.keys.aberto) {
      this.game.keys.fechar();
      return;
    }
    const sb = document.getElementById('scoreboard');
    if (sb && !sb.classList.contains('hidden')) { this.scoreboard.alternar(); return; }
    const ov = document.getElementById('mp-overlay');
    if (ov && !ov.classList.contains('hidden')) return;   // morte/vitória tem fluxo próprio
    if (this._pausado) this._retomar();
    else this._pausar();
  }

  _pausar() {
    if (this._pausado) return;
    this._pausado = true;
    this._setHint(null);
    // dedos soltos: nada de andar/atirar sozinho ao retomar
    this._lt = null;
    this._joyTouch = null;
    this.inp.mx = 0; this.inp.mz = 0; this.inp.run = false;
    this._fireBtn = false; this._fire = false;
    if (this.pausa) this.pausa.mostrar();
  }

  _retomar() {
    if (!this._pausado) return;
    this._pausado = false;
    if (this.pausa) this.pausa.esconder();
  }

  /** Mostra o HUD do single no MP: corações = vida, minimapa, relógio, FPS. */
  _prepararHudSolo() {
    const obj = document.getElementById('objective');
    if (obj) obj.classList.add('hidden');
    const sr = document.querySelector('#topleft .stat-row');
    if (sr) sr.style.display = 'none';
    for (const id of ['speedo', 'heli-panel', 'carrying', 'lock-on', 'missile-gauge']) {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    }
    const barra = document.getElementById('mp-vida');
    if (barra) barra.classList.add('hidden');
    const armaEl = document.getElementById('mp-arma');
    if (armaEl) armaEl.classList.add('hidden');
    if (this.game && this.game.hud) {
      this.game.hud.setHearts(6);
      this.game.hud.setPrompt(null);
    }
  }

  /** Devolve o HUD do solo ao estado de menu ao sair do MP. */
  _restaurarHudSolo() {
    const obj = document.getElementById('objective');
    if (obj) obj.classList.remove('hidden');
    const sr = document.querySelector('#topleft .stat-row');
    if (sr) sr.style.display = '';
  }

  /** [Android] botão voltar da barra de navegação = pausa (sentinela no history). */
  _ligarBack() {
    this._backHandler = () => {
      if (!this._rodando) return;
      try { history.pushState(null, ''); } catch {}
      this._togglePausa();
    };
    window.addEventListener('popstate', this._backHandler);
    try { history.pushState(null, ''); } catch {}
  }

  // ------------------------------------------------------------ sair
  sair() {
    this._rodando = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('pointerdown', this._pd);
    window.removeEventListener('pointerup', this._pu);
    window.removeEventListener('pointermove', this._pm);
    window.removeEventListener('wheel', this._zw);
    document.removeEventListener('touchstart', this._touchStart);
    document.removeEventListener('touchmove', this._touchMove);
    document.removeEventListener('touchend', this._touchEnd);
    for (const rp of this.avatares.values()) rp.remover();
    this.avatares.clear();
    // remove os carros do MP e devolve o transito do single
    for (const cr of this.carrosMp.values()) cr.mesh.dispose(this.game.gfx.scene);
    this.carrosMp.clear();
    if (this._tracer) { this.game.gfx.scene.remove(this._tracer); this._tracer.geometry.dispose(); this._tracer.material.dispose(); this._tracer = null; }
    // devolve as balas do single: alvos do trânsito e callbacks originais
    if (this.game && this.game.bullets) {
      const bul = this.game.bullets;
      bul.setTargets(this.game.peds, this.game.cars);
      bul.setFoes(null);
      bul.ignoreCar = null;
      if (this._bulletsAntes) {
        bul.onHitFoe = this._bulletsAntes.onHitFoe;
        bul.onHitCar = this._bulletsAntes.onHitCar;
        bul.onHitPed = this._bulletsAntes.onHitPed;
        this._bulletsAntes = null;
      }
    }
    if (this.game && this.game.cars) this.game.cars.group.visible = true;
    if (this.game && this.game.peds) this.game.peds.group.visible = true;
    // pausa: desliga handlers do MP e devolve o comando ao modo solo
    if (this._backHandler) { window.removeEventListener('popstate', this._backHandler); this._backHandler = null; }
    if (this.pausa) {
      this.pausa.esconder();
      if (this.game && this.game._ligarPausaSolo) this.game._ligarPausaSolo();
    }
    if (this._pausaBtn && this._pausaBtnHandler) {
      this._pausaBtn.removeEventListener('click', this._pausaBtnHandler);
      this._pausaBtn.classList.add('hidden');
    }
    this._restaurarHudSolo();
    const hud = document.getElementById('hud');
    if (hud) hud.classList.add('hidden');
    this._setHint(null);
    const hudMp = document.getElementById('mp-hud');
    if (hudMp) hudMp.classList.add('hidden');
    const joy = document.getElementById('mp-joy');
    if (joy) joy.classList.add('hidden');
    const look = document.getElementById('mp-look');
    if (look) look.classList.add('hidden');
    for (const b of this._mpBtns) {
      b.el.removeEventListener("touchstart", b.d);
      b.el.removeEventListener("touchend", b.u);
      b.el.removeEventListener("touchcancel", b.u);
      b.el.removeEventListener("mousedown", b.d);
      b.el.removeEventListener("mouseup", b.u);
      b.el.removeEventListener("mouseleave", b.u);
    }
    this._mpBtns = [];
    if (this._mpMira && this._mpMira.el) {
      const m = this._mpMira;
      m.el.removeEventListener('pointerdown', m.down);
      m.el.removeEventListener('pointermove', m.move);
      m.el.removeEventListener('pointerup', m.up);
      m.el.removeEventListener('pointercancel', m.up);
      this._mpMira = null;
    }
    const pad = document.getElementById("mp-pad");
    if (pad) pad.classList.add("hidden");
    const ov = document.getElementById('mp-overlay');
    if (ov) ov.classList.add('hidden');
    const ab = document.getElementById('title-screen');
    if (ab) ab.classList.remove('hidden');
    // devolve o laço e a câmera ao single player (tela de abertura girando)
    if (window.__retomarLoopSingle) window.__retomarLoopSingle();
    // restaura a arma de tela ao estado que estava ANTES do MP (no solo em
    // terceira pessoa ela fica escondida — forçar true deixava uma pistola
    // flutuando atrás do Bob na câmera)
    if (this.game && this.game.viewmodel) {
      this.game.viewmodel.visible = this._viewmodelAntes ?? false;
    }
    this.camera.rotation.order = 'XYZ';
    this.killfeed.limpar();
  }
}
