import * as THREE from '../../vendor/three.module.js';
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
import { T } from './protocol.js';

const INPUT_HZ = 20;
const EYE = 1.62;

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

    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 900);
    this.camera.rotation.order = 'YXZ';

    // input local
    this.inp = { mx: 0, mz: 0, run: false, jump: false, fire: false, ads: false };
    this.yaw = Math.PI;
    this.pitch = 0;
    this._sendAcc = 0;
    this._pingAcc = 0;
    this._seq = 0;

    this._hp = 100;
    this._arma = 'pistola';
    this._morto = false;
    this._rodando = false;
    this._raf = null;
    this._ult = 0;

    this._ligarListeners();
  }

  // ------------------------------------------------------------- setup
  iniciar() {
    // esconde a tela de abertura do single e o HUD single
    const ab = document.getElementById('title-screen');
    if (ab) ab.classList.add('hidden');
    const hud = document.getElementById('hud');
    if (hud) hud.classList.add('hidden');

    const hudMp = document.getElementById('mp-hud');
    if (hudMp) hudMp.classList.remove('hidden');
    const ns = document.getElementById('net-status');
    if (ns) ns.classList.remove('hidden');
    this.netStatus.setEstado('conectando');
    const joy = document.getElementById('mp-joy');
    if (joy) joy.classList.remove('hidden');
    const look = document.getElementById('mp-look');
    if (look) look.classList.remove('hidden');

    // avatares para os jogadores conhecidos
    for (const [id, info] of this.nicks) this._garantirAvatar(id, info);

    this._rodando = true;
    this._ult = performance.now();
    this._loop(this._ult);
  }

  _ligarListeners() {
    this._kd = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') this.inp.mz += 1;
      if (k === 's' || k === 'arrowdown') this.inp.mz -= 1;
      if (k === 'a' || k === 'arrowleft') this.inp.mx -= 1;
      if (k === 'd' || k === 'arrowright') this.inp.mx += 1;
      if (k === 'shift') this.inp.run = true;
      if (k === ' ') { this.inp.jump = true; e.preventDefault(); }
      if (k === 'tab') { e.preventDefault(); this.scoreboard.alternar(); }
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

    // mouse: mover = olhar (pointer lock) ou arrastar; clique = atirar
    this._pd = (e) => {
      this._dragX = e.clientX; this._dragY = e.clientY;
      this._dragOn = true;
      this._fire = true;
      try { document.body.requestPointerLock?.(); } catch {}
    };
    this._pu = () => { this._dragOn = false; this._fire = false; };
    this._pm = (e) => {
      if (document.pointerLockElement) {
        this.yaw -= e.movementX * 0.0024;
        this.pitch += e.movementY * 0.0024;
      } else if (this._dragOn) {
        const dx = e.clientX - this._dragX, dy = e.clientY - this._dragY;
        this._dragX = e.clientX; this._dragY = e.clientY;
        this.yaw -= dx * 0.004;
        this.pitch += dy * 0.004;
      }
      this._clampAim();
    };
    this._cm = () => {
      if (document.pointerLockElement) document.exitPointerLock?.();
    };

    // touch: joystick esquerdo + olhar/atirar à direita
    this._tjs = null;
    this._joy = document.getElementById('mp-joy');
    this._lookEl = document.getElementById('mp-look');

    this._touchStart = (e) => {
      for (const t of e.changedTouches) {
        const x = t.clientX, y = t.clientY;
        const jr = this._joy ? this._joy.getBoundingClientRect() : null;
        if (jr && x >= jr.left && x <= jr.right && y >= jr.top && y <= jr.bottom) {
          // toque no joystick
          this._tjs = { id: t.identifier, cx: jr.left + jr.width / 2, cy: jr.top + jr.height / 2 };
          this._joyTouch = { id: t.identifier, x, y };
          e.preventDefault();
        } else {
          // área de olhar/atirar
          if (!this._lt) this._lt = { id: t.identifier, x, y, t0: performance.now(), drag: false };
          e.preventDefault();
        }
      }
    };
    this._touchMove = (e) => {
      for (const t of e.changedTouches) {
        if (this._lt && t.identifier === this._lt.id) {
          const dx = t.clientX - this._lt.x, dy = t.clientY - this._lt.y;
          if (!this._lt.drag && Math.hypot(dx, dy) > 10) this._lt.drag = true;
          if (this._lt.drag) {
            this.yaw -= dx * 0.005;
            this.pitch += dy * 0.005;
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
          const foiTiro = !this._lt.drag && (performance.now() - this._lt.t0) < 350;
          this._lt = null;
          if (foiTiro) this._fire = true;
        }
        if (this._joyTouch && t.identifier === this._joyTouch.id) {
          this._joyTouch = null;
          this.inp.mx = 0; this.inp.mz = 0;
          const knob = this._joy?.querySelector('.knob');
          if (knob) knob.style.transform = 'translate(0,0)';
        }
      }
    };

    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('pointerdown', this._pd);
    window.addEventListener('pointerup', this._pu);
    window.addEventListener('pointermove', this._pm);
    document.addEventListener('pointerlockchange', this._cm);
    document.addEventListener('touchstart', this._touchStart, { passive: false });
    document.addEventListener('touchmove', this._touchMove, { passive: false });
    document.addEventListener('touchend', this._touchEnd, { passive: false });
  }

  _norm() {
    const d = Math.hypot(this.inp.mx, this.inp.mz);
    if (d > 1) { this.inp.mx /= d; this.inp.mz /= d; }
  }

  _clampAim() {
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch));
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
      case T.PLAYER_LEFT:
      case T.BOT_SAIU:
        this._removerAvatar(msg.id);
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
      const pos = this.snapBuf.ultimo() && eu ? { x: eu.x, z: eu.z } : null;
      this.brHud.atualizar(msg, this.meuId, pos);
    }
  }

  _garantirAvatar(id) {
    if (this.avatares.has(id) || id === this.meuId) return;
    const info = this.nicks.get(id) || { nick: '?', bot: false };
    const rp = new RemotePlayer(this.game.gfx.scene, { id, ...info });
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

    this._update(dt);
    this.game.gfx.renderer.render(this.game.gfx.scene, this.camera);
  }

  _update(dt) {
    // interpola avatares
    const alpha = this.snapBuf.alpha();
    for (const [id, rp] of this.avatares) {
      const d = this.snapBuf.ler(id, alpha);
      if (!d) continue;
      rp.aplicar(d);
      const vel = Math.hypot(d.moveX || 0, d.moveZ || 0);
      rp.update(dt, vel * 8);
    }
    // câmera do jogador local (posição autoritativa interpolada)
    const eu = this.snapBuf.ler(this.meuId, alpha);
    if (eu) {
      this.camera.position.set(eu.x, eu.y + EYE, eu.z);
      this.yaw = eu.yaw ?? this.yaw;
      this.pitch = eu.pitch ?? this.pitch;
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

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
        fire: !!(this._fire || this._dragOn),
        ads: this.inp.ads,
      });
      this._fire = false;   // tiro único por input (rajada via clique segura)
      this.inp.jump = false;
    }
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
    const fill = document.getElementById('mp-hp-fill');
    const val = document.getElementById('mp-hp-val');
    const arma = document.getElementById('mp-arma');
    if (fill) fill.style.width = Math.max(0, this._hp) + '%';
    if (val) val.textContent = Math.max(0, Math.round(this._hp)) + ' HP';
    if (arma) {
      const nomes = { pistola: 'PISTOLA', metralhadora: 'METRALHADORA', sniper: 'SNIPER', shotgun: 'ESCADA' };
      arma.innerHTML = (nomes[this._arma] || this._arma.toUpperCase()) + '<small>munição infinita</small>';
    }
  }

  _morreu(por) {
    if (this._morto) return;
    this._morto = true;
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

  // ------------------------------------------------------------ sair
  sair() {
    this._rodando = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('pointerdown', this._pd);
    window.removeEventListener('pointerup', this._pu);
    window.removeEventListener('pointermove', this._pm);
    document.removeEventListener('pointerlockchange', this._cm);
    document.removeEventListener('touchstart', this._touchStart);
    document.removeEventListener('touchmove', this._touchMove);
    document.removeEventListener('touchend', this._touchEnd);
    for (const rp of this.avatares.values()) rp.remover();
    this.avatares.clear();
    const hudMp = document.getElementById('mp-hud');
    if (hudMp) hudMp.classList.add('hidden');
    const joy = document.getElementById('mp-joy');
    if (joy) joy.classList.add('hidden');
    const look = document.getElementById('mp-look');
    if (look) look.classList.add('hidden');
    const ov = document.getElementById('mp-overlay');
    if (ov) ov.classList.add('hidden');
    const ab = document.getElementById('title-screen');
    if (ab) ab.classList.remove('hidden');
    this.killfeed.limpar();
  }
}
