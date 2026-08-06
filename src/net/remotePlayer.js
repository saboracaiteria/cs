/**
 * RemotePlayer — avatar de um jogador remoto (ou do próprio jogador).
 * Reusa o Human do jogo (tronco + cabeça com lookPitch/lookYaw).
 */
import { Human } from '../ent/human.js';
import { Loro } from '../ent/loro.js';
import { makePistola } from '../player.js';

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
      fullShadow: false,
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
  }

  /** Aplica dados do snapshot (posição já interpolada). */
  aplicar(d) {
    this.x = d.x; this.y = d.y; this.z = d.z;
    this.yaw = d.yaw ?? this.yaw;
    this.pitch = d.pitch ?? this.pitch;
    this.hp = d.hp ?? this.hp;
    this.vivo = (d.hp ?? 1) > 0;
  }

  /** Animação por quadro. */
  update(dt, speed = 0) {
    this.root.position.set(this.x, this.y, this.z);
    // mesma convenção do single: o corpo olha para +Z em yaw 0 (câmera olha -Z)
    this.root.rotation.y = this.yaw + Math.PI;
    this.human.lookYaw = 0;
    this.human.lookPitch = this.pitch;
    this.human.update(dt, speed);
    if (!this.local) this.root.visible = this.vivo;
    this.loro.visible = this.vivo;
    if (this.vivo) this.loro.update(dt, this.root.position, this.yaw + Math.PI, speed);
  }

  remover() {
    if (this.root.parent) this.root.parent.remove(this.root);
    if (this.loro) this.loro.dispose();
  }
}
