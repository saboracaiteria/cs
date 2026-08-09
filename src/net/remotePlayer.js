/**
 * RemotePlayer — avatar de um jogador remoto (ou do próprio jogador).
 * Reusa o Human do jogo (tronco + cabeça com lookPitch/lookYaw).
 */
import { Human } from '../ent/human.js';
import { Loro } from '../ent/loro.js';
import { makePistola } from '../player.js';
import { CAMERA } from '../config.js';

// cores determinísticas por id (para não piscar a cada partida)
const PALETA = [
  0xe8453c, 0x2f9e5f, 0x3a6fd8, 0xe0a323, 0x9c4fd8, 0xd84f8f,
  0x23b0c9, 0x8a6f4f, 0x5a6b8a, 0xc9c23a,
];

// cores dos papagaios — cada player tem um Loro de cor diferente
const LORO_CORES = [
  0x3ddc84, 0xe8453c, 0x25d0ff, 0xffb020, 0x9c4fd8, 0xd84f8f,
  0x2f9e5f, 0xff7a1a, 0x23b0c9, 0xc9c23a,
];

export class RemotePlayer {
  /**
   * @param {object} scene (cena THREE)
   * @param {object} info {id, nick, bot}
   * @param {object} opts  {cor} cor da camisa (opcional); {local} avatar do próprio jogador
   */
  constructor(scene, info, opts = {}) {
    this.id = info.id;
    this.nick = info.nick;
    this.bot = !!info.bot;
    this.local = !!opts.local;

    const h = Math.abs(info.id) % PALETA.length;
    const cor = opts.cor ?? PALETA[h];
    this.human = new Human({
      // o jogador local é o Bob, o personagem principal do jogo
      shirt: this.local ? 0x6b4423 : cor,
      pants: this.local ? 0x3d4a5c : (h % 2 ? 0x23252e : 0x3a3d45),
      skin: this.local ? 0xd9a066 : 0xe8b48c,
      hair: this.local ? 0x2a1f14 : [0x1c1e24, 0x4a2f1f, 0x6b4a2f][h % 3],
      fullShadow: !!opts.local,
    });
    // arma na mão — a mesma pistola do personagem principal
    this.human.setWeapon(makePistola());
    this.root = this.human.root;
    scene.add(this.root);

    // papagaio voando junto, cor diferente por jogador
    this.loro = new Loro(scene, { cor: LORO_CORES[h] });

    this.x = 0; this.y = 0; this.z = 0;
    this.yaw = 0; this.pitch = 0;
    this.hp = 100;
    this.vivo = true;

    // estado da predicao local (src/net/predict.js)
    this._predicted = false;
    this._vx = 0; this._vz = 0; this._vy = 0;
    this._onGround = true;
  }

  /** Aplica dados do snapshot (posição já interpolada). */
  aplicar(d) {
    this._tX = d.x; this._tZ = d.z;
    this._tY = d.y;   // alvos suavizados no update (degraus do servidor tremiam)
    this.yaw = d.yaw ?? this.yaw;
    this.pitch = d.pitch ?? this.pitch;
    this.hp = d.hp ?? this.hp;
    this.vivo = (d.hp ?? 1) > 0;
    this.firing = (d.fire || 0) >= 0.5;   // [MP] avatar esta atirando agora
  }

  /** Animação por quadro. `animar=false` (LOD) ainda segue a posição. */
  update(dt, speed = 0, animar = true) {
    // suaviza X/Z: o servidor manda a 30 Hz em degraus e a rede entrega com
    // jitter (o snapshot interpolado para e pula) — o damp mantém o corpo
    // em movimento contínuo até o alvo; teleporte (respawn/carro) vai direto
    if (this.local && this._predicted) {
      // RECONCILIACAO (predicao local ativa): o corpo ja andou na hora com o
      // input; o snapshot e a verdade do servidor. Erro pequeno = fisica
      // igual — NAO mexe (sem tremor). Corrige so divergencias reais.
      const dx = (this._tX ?? this.x) - this.x;
      const dz = (this._tZ ?? this.z) - this.z;
      const err = Math.hypot(dx, dz);
      if (err > 3) {
        // teleporte/respawn/veiculo: assume a posicao do servidor
        this.x = this._tX; this.z = this._tZ;
        this._vx = 0; this._vz = 0; this._vy = 0;
      } else if (err > 0.6) {
        // divergencia real (empurrao, colisao diferente): corrige devagar
        const k = Math.min(1, 3 * dt);
        this.x += dx * k;
        this.z += dz * k;
      }
      // y: so corrige para BAIXO quando o servidor esta bem mais baixo
      // (pulo cortado, chao diferente). Se o servidor esta "atras" no tempo
      // (ainda na parabola/queda), a predicao ja esta certa — nao mexe,
      // senao o corpo "levita" ao aterrissar.
      const dy = (this._tY ?? this.y) - this.y;
      if (dy < -1.2) this.y += dy * Math.min(1, 10 * dt);
    } else {
      const dx = (this._tX ?? this.x) - this.x;
      const dz = (this._tZ ?? this.z) - this.z;
      if (Math.abs(dx) > 2 || Math.abs(dz) > 2) { this.x += dx; this.z += dz; }
      else {
        const k = Math.min(1, (this.local ? 40 : 18) * dt);
        this.x += dx * k;
        this.z += dz * k;
      }
      const dy = (this._tY ?? this.y) - this.y;
      this.y += Math.abs(dy) < 0.08 ? dy * Math.min(1, 18 * dt) : dy;
    }
    this.root.position.set(this.x, this.y, this.z);

    this.root.rotation.y = this.yaw + Math.PI + (this.local ? CAMERA.bodyTurn : 0);

    if (!animar) return;   // posicao segue; passos/asa em camera lenta
    // [MP] bot/jogador ATIRANDO: ergue os bracos com a arma apontando
    // para o alvo (o yaw/pitch do corpo ja vem do snapshot mirando o player)
    if (!this.local) this.human.aiming = this.firing && this.vivo;
    this.human.lookYaw = 0;
    this.human.lookPitch = this.pitch;
    this.human.update(dt, speed);
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

  /** [MP] Posicao de tiro: bracos erguidos com a pistola (igual ao solo). */
  setAiming(on) {
    // remotos: ergue os bracos ao atirar (flag fire do snapshot);
    // local: ADS manual (match.js controla).
    this.human.aiming = on;
  }

  remover() {
    if (this.root.parent) this.root.parent.remove(this.root);
    if (this.loro) this.loro.dispose();
  }
}
