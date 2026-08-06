import * as THREE from '../../vendor/three.module.js';
import { voxMaterial, VX } from './voxel.js';

/**
 * ============================================================
 *  A arma na tela (viewmodel)
 * ============================================================
 *
 * O canto inferior direito da tela, estilo COD Mobile: a mão do Bob
 * segurando a **pistola** — a mesma que ele ergue na posição de tiro
 * em terceira pessoa quando segura ATIRAR.
 *
 * ---- COMO ELA FICA SEMPRE NA FRENTE ----
 * A arma é filha da CÂMERA, não da cena. Assim ela acompanha o olhar de
 * graça, sem precisar recalcular posição a cada quadro.
 *
 * Duas consequências que precisaram de cuidado:
 *
 * 1. Objeto filho de câmera só é desenhado se a própria câmera estiver
 *    na cena. Three.js percorre o grafo a partir da cena, e uma câmera
 *    solta não é visitada — a arma simplesmente não apareceria.
 * 2. Com 0,35 m de distância ela cairia dentro do `near` da câmera e
 *    seria cortada. Por isso o modelo é MINIATURA (escala ~0.5) e fica
 *    logo além do plano de corte, em vez de ser um objeto de tamanho
 *    real colado no rosto.
 */

const POS_REPOUSO = new THREE.Vector3(0.26, -0.22, -0.52);
/** [FPS] Mirando (ADS): a arma sobe para o centro da tela, estilo COD Mobile. */
const POS_ADS = new THREE.Vector3(0.16, -0.18, -0.42);   // [FPS] mirando: ergue um pouco, SEM sair do lado direito da tela

export class ViewModel {
  constructor(camera, scene) {
    this.cam = camera;

    // a câmera precisa estar na cena para os filhos dela serem desenhados
    if (!camera.parent) scene.add(camera);

    this.root = new THREE.Group();
    this.root.position.copy(POS_REPOUSO);
    this.root.visible = false;
    /*
     * renderOrder alto + sem escrita de profundidade contra o mundo não
     * resolve sozinho a interpenetração em parede; o que resolve é a
     * arma ser pequena e próxima. Mantemos a profundidade normal para
     * ela receber a luz e a sombra da cena como qualquer objeto.
     */
    camera.add(this.root);

    this._montar();

    this.t = 0;
    this.coice = 0;      // 0..1, decai depois do tiro
    this.balanco = 0;
    this.ads = 0;        // 0..1, quão erguida a arma está no zoom de mira
    this._adsQuero = false;
  }

  _montar() {
    const g = new THREE.Group();
    g.scale.setScalar(0.5);
    this.root.add(g);

    const bloco = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w * VX, h * VX, d * VX), mat);
      m.position.set(x * VX, y * VX, z * VX);
      g.add(m);
      return m;
    };

    const pele = voxMaterial(0xd9a066);
    const manga = voxMaterial(0x6b4423);          // jaqueta de couro do Bob
    const ferro = voxMaterial(0x2a2f38, { metal: 0.45, aspereza: 0.5 });
    const escuro = voxMaterial(0x16191f, { metal: 0.3, aspereza: 0.6 });
    const dourado = voxMaterial(0xffb020, { metal: 0.7, aspereza: 0.28, emissivo: 0.55 });

    // antebraço entrando pelo canto da tela
    bloco(4, 4, 12, 0, -3, 4, manga);
    // mão segurando a coronha
    bloco(4.4, 4.4, 4, 0, -1.4, -2, pele);
    // corpo da pistola
    bloco(5, 7, 3, 0, -0.5, -4.5, ferro);
    // coroa traseira / cão
    bloco(4, 3.4, 3, 0, 2.6, -4.5, escuro);
    // cano apontando para o centro da tela
    bloco(3, 3, 12, 0, 0.9, -9.5, escuro);
    // mira
    bloco(1.4, 1.6, 2, 0, 3.7, -8, escuro);
    // detalhe dourado na lateral do corpo
    bloco(5.4, 1.4, 3.4, 0, -2.2, -4.5, dourado);
    // guarda-mato + gatilho
    bloco(2.6, 3, 2.6, 0, -3.8, -4, escuro);
  }

  set visible(v) { this.root.visible = v; }
  get visible() { return this.root.visible; }

  /** Chamado a cada tiro. */
  darCoice() { this.coice = 1; }

  /** [FPS] Zoom de mira: a arma sobe para o centro da tela. */
  setAds(on) { this._adsQuero = !!on; }

  /**
   * @param {number} vel  velocidade do jogador (dá o balanço do passo)
   */
  update(dt, vel = 0) {
    if (!this.root.visible) return;
    this.t += dt;
    this.coice = Math.max(0, this.coice - dt * 5.5);

    // balanço do passo: sobe e desce em oito, como a mão de quem anda
    this.balanco = damp(this.balanco, Math.min(1, vel / 5), 6, dt);
    const b = this.balanco;
    const bx = Math.sin(this.t * 7.5) * 0.014 * b;
    const by = Math.abs(Math.cos(this.t * 7.5)) * 0.016 * b;

    // [FPS] zoom de mira: a arma desliza do canto para o centro
    this.ads = damp(this.ads, this._adsQuero ? 1 : 0, 10, dt);
    const a = this.ads;
    const pos = new THREE.Vector3().lerpVectors(POS_REPOUSO, POS_ADS, a);

    // coice: recua e levanta o bico
    const c = this.coice * this.coice;
    this.root.position.set(
      pos.x + bx,
      pos.y - by + c * 0.03,
      pos.z + c * 0.10,
    );
    this.root.rotation.x = c * 0.42 + a * 0.08;
    this.root.rotation.z = Math.sin(this.t * 3.7) * 0.02 * b * (1 - a);

  }
}

/** Amortecimento exponencial, igual ao de `utils.js` (evita import circular). */
function damp(a, b, lambda, dt) {
  return b + (a - b) * Math.exp(-lambda * dt);
}
