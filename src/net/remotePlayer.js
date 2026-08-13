




import { Human } from '../ent/human.js';
import { Loro } from '../ent/loro.js';
import { makePistola } from '../player.js';
import { CAMERA } from '../config.js';
import * as THREE from '../../vendor/three.module.js';


const PALETA = [
  0xe8453c, 0x2f9e5f, 0x3a6fd8, 0xe0a323, 0x9c4fd8, 0xd84f8f,
  0x23b0c9, 0x8a6f4f, 0x5a6b8a, 0xc9c23a,
];


const LORO_CORES = [
  0x3ddc84, 0xe8453c, 0x25d0ff, 0xffb020, 0x9c4fd8, 0xd84f8f,
  0x2f9e5f, 0xff7a1a, 0x23b0c9, 0xc9c23a,
];

export class RemotePlayer {





  constructor(scene, info, opts = {}) {
    this.id = info.id;
    this.nick = info.nick;
    this.bot = !!info.bot;
    this.local = !!opts.local;
    this.scene = scene;

    // [ROUPA] cor sincronizada: o servidor manda a cor escolhida pelo dono
    // (snap.cor) — o fallback é a cor derivada do id (comportamento antigo)
    const h = Math.abs(info.id) % PALETA.length;
    const cor = opts.cor ?? info.cor ?? PALETA[h];
    this.human = new Human({
      shirt: cor,
      pants: this.local ? 0x3d4a5c : (h % 2 ? 0x23252e : 0x3a3d45),
      skin: this.local ? 0xd9a066 : 0xe8b48c,
      hair: this.local ? 0x2a1f14 : [0x1c1e24, 0x4a2f1f, 0x6b4a2f][h % 3],
      fullShadow: !!opts.local,
    });

    this.human.setWeapon(makePistola());
    this.root = this.human.root;
    scene.add(this.root);
    // [INVISIVEL-FIX] entidades do MP sempre renderizam: com a câmera do heli
    // em altitude o frustum culling cortava avatares no chão (ângulo íngreme
    // para baixo) e eles sumiam para quem voava — mesmo estando de frente.
    this.root.traverse(o => { if (o.isMesh || o.isSprite) o.frustumCulled = false; });

    // [TAG] nome acima da cabeça — todo player vê o nick dos outros (e dos
    // bots, com 🤖). Sprite 2D sempre de frente, tamanho constante em tela.
    this.tag = null;
    if (!this.local) this._criarTag(cor);

    this.loro = new Loro(scene, { cor: LORO_CORES[h] });
    this.loro.root.traverse(o => { if (o.isMesh || o.isSprite) o.frustumCulled = false; });

    this.x = 0; this.y = 0; this.z = 0;
    this.yaw = 0; this.pitch = 0;
    this.hp = 100;
    this.vivo = true;


    this._predicted = false;
    this._vx = 0; this._vz = 0; this._vy = 0;
    this._onGround = true;
  }


  _criarTag(cor) {
    try {
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 72;
      const ctx = cv.getContext('2d');
      const nome = (this.bot ? '🤖 ' : '') + (this.nick || '?');
      ctx.font = 'bold 32px system-ui, sans-serif';
      const wNome = Math.min(Math.ceil(ctx.measureText(nome).width), 236);

      // fundo arredondado (fillRect simples p/ compatibilidade)
      ctx.fillStyle = 'rgba(8, 12, 22, 0.6)';
      ctx.fillRect(6, 6, wNome + 24, 56);
      ctx.strokeStyle = this.bot ? 'rgba(255, 180, 60, 0.65)' : 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(6, 6, wNome + 24, 56);

      // ponto de cor da roupa (à esquerda do nome)
      ctx.fillStyle = '#' + cor.toString(16).padStart(6, '0');
      ctx.beginPath();
      ctx.arc(20, 34, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(nome, 34 + wNome / 2, 36);

      const tex = new THREE.CanvasTexture(cv);
      tex.anisotropy = 4;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      this.tag = new THREE.Sprite(mat);
      this.tag.frustumCulled = false;   // [INVISIVEL-FIX] nome nunca some
      this.tag.scale.set(1.5, 0.42, 1);
      this.tag.position.set(0, -999, 0);   // escondido até o primeiro update
      this.scene.add(this.tag);
    } catch (e) {
      this.tag = null;   // sem canvas (ambiente estranho) — segue sem tag
    }
  }


  aplicar(d) {
    // [REDE-FLUIDEZ] primeiro snap: adota a posição direto (sem deslizar do 0,0,0)
    if (this._tX === undefined) {
      this.x = d.x; this.y = d.y; this.z = d.z;
    }
    // [REDE-FLUIDEZ] respawn legítimo (morto -> vivo): teleporta de verdade
    if (!this.vivo && (d.hp ?? 1) > 0) {
      this.x = d.x; this.y = d.y; this.z = d.z;
      this._vx = 0; this._vz = 0; this._vy = 0;
    }
    this._tX = d.x; this._tZ = d.z;
    this._tY = d.y;   // alvos suavizados no update (degraus do servidor tremiam)
    this.yaw = d.yaw ?? this.yaw;
    this.pitch = d.pitch ?? this.pitch;
    this.hp = d.hp ?? this.hp;
    this.vivo = (d.hp ?? 1) > 0;
    this.firing = (d.fire || 0) >= 0.5;   // [MP] avatar esta atirando agora
  }


  update(dt, speed = 0, animar = true, air = 0, run = false) {
    this._run = run;   // [ANIM] correndo de verdade (tronco inclina só correndo)



    if (this.local && this._predicted) {
      // [REDE-FLUIDEZ] jogador LOCAL: a PREDIÇÃO local manda — o snap do
      // servidor está SEMPRE atrasado pela latência (err ~ velocidade × RTT).
      // Corrigir esse erro a cada frame (como o maxCorr=45 fazia) puxava o
      // jogador de volta sem parar = micro-teleportes. Agora: só corrige
      // divergência REAL (colisão/empurrão no servidor), com limiar alto e
      // correção LENTA — a fluidez do movimento local é preservada.
      const dx = (this._tX ?? this.x) - this.x;
      const dz = (this._tZ ?? this.z) - this.z;
      const err = Math.hypot(dx, dz);
      if (err > 3.5) {
        if (err > 20) {
          // respawn/teleporte legítimo do servidor
          this.x = this._tX; this.z = this._tZ;
          this._vx = 0; this._vz = 0; this._vy = 0;
        } else {
          const maxCorr = 12 * dt;                 // correção lenta (12 m/s máx)
          const k = Math.min(1, maxCorr / err);    // suave, sem salto
          this.x += dx * k;
          this.z += dz * k;
          if (err > 6) { this._vx = 0; this._vz = 0; this._vy = 0; }
        }
      }
      const dy = (this._tY ?? this.y) - this.y;
      if (dy < -1.2) this.y += dy * Math.min(1, 10 * dt);
    } else {
      // [REDE-FLUIDEZ] avatar REMOTO: correção com velocidade limitada (máx
      // 35 m/s) — sem o "teleporte" de antes (|dx|>2 saltava direto pro alvo).
      // Erros pequenos seguem suaves; erros grandes (jitter/empurrão) são
      // alcançados em ~0,3s em vez de pular.
      const dx = (this._tX ?? this.x) - this.x;
      const dz = (this._tZ ?? this.z) - this.z;
      const err = Math.hypot(dx, dz);
      if (err > 0.0001) {
        const maxCorr = (this.local ? 50 : 35) * dt;
        const k = Math.min(1, maxCorr / err);
        this.x += dx * k;
        this.z += dz * k;
      }
      const dy = (this._tY ?? this.y) - this.y;
      this.y += Math.abs(dy) < 0.08 ? dy * Math.min(1, 18 * dt) : Math.max(-8, Math.min(8, dy));
    }
    this.root.position.set(this.x, this.y, this.z);

    // [TAG] nome acompanha o player (só para os outros — a própria some)
    if (this.tag) {
      this.tag.position.set(this.x, this.y + 1.95, this.z);
      this.tag.visible = this.vivo;
    }

    this.root.rotation.y = this.yaw + Math.PI + (this.local ? CAMERA.bodyTurn : 0);

    if (!animar) return;   // posicao segue; passos/asa em camera lenta


    if (!this.local) this.human.aiming = this.firing && this.vivo;
    this.human.lookYaw = 0;
    this.human.lookPitch = this.pitch;
    this.human.update(dt, speed, { air, run: this._run });
    if (!this.local) this.root.visible = this.vivo;
    this.loro.visible = this.vivo && !this._loroSkip;
    if (this.vivo && !this._loroSkip) {
      if (this._loroYaw == null) this._loroYaw = this.yaw + Math.PI;
      let d = this.yaw + Math.PI - this._loroYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this._loroYaw += d * Math.min(1, 12 * dt);
      this.loro.update(dt, this.root.position, this._loroYaw, speed);
    }
  }


  setAiming(on) {


    this.human.aiming = on;
  }

  remover() {
    if (this.root.parent) this.root.parent.remove(this.root);
    if (this.tag) {
      if (this.tag.parent) this.tag.parent.remove(this.tag);
      if (this.tag.material.map) this.tag.material.map.dispose();
      this.tag.material.dispose();
    }
    if (this.loro) this.loro.dispose();
  }
}

