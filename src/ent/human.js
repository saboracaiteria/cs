import * as THREE from '../../vendor/three.module.js';
import { PALETTE } from '../config.js';
import { clamp, damp, dampAngle, rngPick, rngRange } from '../utils.js';

/**
 * Human (Skin 3D Integrado com Física de Tiro, Câmera e Biomecânica Humana)
 * Une a anatomia realista do skin HTML (peitoral, deltoides, abdômen, rotação de tronco)
 * com o sistema de mira 3D (pitch/yaw da câmera, suporte a pistola, tiro e pacote).
 */

const HIP_Y = 0.94, THIGH_L = 0.44, SHIN_L = 0.42;
const SHOULDER_Y = 1.42, SHOULDER_X = 0.22;
const UPPER_ARM_L = 0.31, FOREARM_L = 0.29, HEAD_Y = 1.63;

export class Human {
  constructor(opts = {}) {
    const rng = opts.rng || Math.random;
    this.fullShadow = opts.fullShadow === true;
    this.falling = false;
    
    // Cores configuráveis
    this.skinColor = opts.skin ?? rngPick(rng, PALETTE.skin);
    this.shirtColor = opts.shirt ?? rngPick(rng, PALETTE.shirt);
    this.pantsColor = opts.pants ?? rngPick(rng, PALETTE.pants);
    this.hairColor = opts.hair ?? rngPick(rng, PALETTE.hair);
    this.shoeColor = opts.shoe ?? 0x1a1d24;

    this.materials = {
      skin: new THREE.MeshStandardMaterial({ color: this.skinColor, roughness: 0.55, metalness: 0.05 }),
      shirt: new THREE.MeshStandardMaterial({ color: this.shirtColor, roughness: 0.7, metalness: 0.05 }),
      pants: new THREE.MeshStandardMaterial({ color: this.pantsColor, roughness: 0.8, metalness: 0.02 }),
      shoe: new THREE.MeshStandardMaterial({ color: this.shoeColor, roughness: 0.6, metalness: 0.1 }),
      shoeSole: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 }),
      hair: new THREE.MeshStandardMaterial({ color: this.hairColor, roughness: 0.9 })
    };

    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);

    this.buildBody();

    const s = opts.scale ?? 1;
    this.root.scale.setScalar(s);
    this.height = 1.75 * s;

    // Estados e animação
    this.phase = rngRange(rng, 0, Math.PI * 2);
    this._air = 0;
    this._jumpT = 0;
    this._jumpSide = 1;
    this._jumpPrev = 0;
    this._lean = 0;
    
    this.carrying = false;
    this.armGesture = 0;
    this.aiming = false;
    this.aimAmt = 0;
    this.weapon = null;

    this.lookPitch = 0; // Inclinação da mira/câmera
    this.lookYaw = 0;   // Ângulo horizontal da mira/câmera
    this.turnDelayTimer = 0;
  }

  buildBody() {
    const mat = this.materials;

    // --- Parte Inferior do Corpo ---
    const lowerBodyGroup = new THREE.Group();
    const hip = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.165, 0.22, 14), mat.pants);
    hip.position.set(0, 0.93, 0); hip.scale.set(1.15, 1, 0.85); hip.castShadow = true;
    lowerBodyGroup.add(hip);

    const buildLeg = (side) => {
      const legRoot = new THREE.Group();
      legRoot.position.set(side * 0.11, HIP_Y, 0);

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.072, THIGH_L, 14), mat.pants);
      thigh.position.y = -THIGH_L / 2; thigh.scale.set(0.95, 1, 1.1); thigh.castShadow = this.fullShadow;
      legRoot.add(thigh);

      const shinGroup = new THREE.Group();
      shinGroup.position.y = -THIGH_L;
      const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.050, SHIN_L, 14), mat.pants);
      calf.position.y = -SHIN_L / 2; calf.scale.set(1, 1, 1.18); calf.castShadow = this.fullShadow;
      shinGroup.add(calf);

      // --- MODELAGEM ANATÔMICA DO TÊNIS (Calcanhar arredondado e bico curvo esportivo) ---
      const footGroup = new THREE.Group();
      footGroup.position.set(0, -SHIN_L - 0.025, 0);
      footGroup.scale.set(1.15, 1.10, 1.18); // Sapato ligeiramente maior e melhor proporcionalizado

      // 1. Sola Anatômica (Traseira arredondada + Bico erguido)
      const soleHeel = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.048, 0.04, 14), mat.shoeSole);
      soleHeel.position.set(0, -0.02, -0.035);
      soleHeel.scale.set(1.0, 1.0, 1.35);

      const soleFront = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.040, 0.04, 14), mat.shoeSole);
      soleFront.position.set(0, -0.017, 0.075);
      soleFront.rotation.x = -0.08; // Elevação sutil no bico do tênis (toe spring)
      soleFront.scale.set(0.95, 1.0, 1.35);

      const soleMid = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.04, 0.11), mat.shoeSole);
      soleMid.position.set(0, -0.02, 0.02);

      // 2. Cabedal / Corpo do Tênis (Calcanhar curvo e bico anatômico)
      const shoeHeel = new THREE.Mesh(new THREE.CylinderGeometry(0.050, 0.046, 0.075, 14), mat.shoe);
      shoeHeel.position.set(0, 0.005, -0.032);
      shoeHeel.scale.set(0.98, 1.0, 1.3);

      const shoeToe = new THREE.Mesh(new THREE.CylinderGeometry(0.051, 0.034, 0.07, 14), mat.shoe);
      shoeToe.position.set(0, 0.003, 0.078);
      shoeToe.rotation.x = -0.06;
      shoeToe.scale.set(0.90, 1.0, 1.3);

      const shoeBody = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.072, 0.105), mat.shoe);
      shoeBody.position.set(0, 0.005, 0.022);

      footGroup.add(soleHeel, soleFront, soleMid, shoeHeel, shoeToe, shoeBody);
      shinGroup.add(footGroup);

      legRoot.add(shinGroup);
      return { root: legRoot, shin: shinGroup, foot: footGroup };
    };

    this.legL = buildLeg(1);
    this.legR = buildLeg(-1);
    lowerBodyGroup.add(this.legL.root, this.legR.root);
    this.pivot.add(lowerBodyGroup);

    // --- Parte Superior do Corpo (Tronco articulado) ---
    this.upperBodyGroup = new THREE.Group();
    this.upperBodyGroup.position.set(0, 1.02, 0);

    const upperContent = new THREE.Group();
    upperContent.position.set(0, -1.02, 0);
    this.upperBodyGroup.add(upperContent);

    const absMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.17, 0.24, 14), mat.shirt);
    absMesh.position.set(0, 1.14, 0.01); absMesh.scale.set(1.1, 1, 0.82); absMesh.castShadow = true;

    const pecL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.16, 0.13), mat.shirt);
    pecL.position.set(0.095, 1.33, 0.07); pecL.rotation.y = 0.08; pecL.castShadow = true;
    const pecR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.16, 0.13), mat.shirt);
    pecR.position.set(-0.095, 1.33, 0.07); pecR.rotation.y = -0.08; pecR.castShadow = true;

    const lats = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.20, 0.28, 14), mat.shirt);
    lats.position.set(0, 1.32, -0.01); lats.scale.set(1.18, 1, 0.80); lats.castShadow = true;

    const trap = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.23, 0.12, 16), mat.shirt);
    trap.position.set(0, 1.42, -0.005); trap.scale.set(1.18, 1.0, 0.82); trap.castShadow = true;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.078, 0.12, 12), mat.skin);
    neck.position.set(0, 1.48, -0.005); neck.castShadow = true;

    upperContent.add(absMesh, pecL, pecR, lats, trap, neck);

    // --- Cabeça (Acompanha inclinação da câmera) ---
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 1.48;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 14), mat.skin);
    head.scale.set(0.92, 1.18, 1.05); head.position.set(0, HEAD_Y - 1.48, 0.01); head.castShadow = this.fullShadow;

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.118, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), mat.hair);
    hair.scale.set(0.95, 1.15, 1.06); hair.position.set(0, HEAD_Y - 1.46, 0);

    this.headGroup.add(head, hair);
    upperContent.add(this.headGroup);

    // --- Braços com Deltoides ---
    const buildArm = (side) => {
      const armRoot = new THREE.Group();
      armRoot.position.set(side * SHOULDER_X, SHOULDER_Y, 0);

      const delt = new THREE.Mesh(new THREE.SphereGeometry(0.092, 14, 12), mat.shirt);
      delt.scale.set(1.12, 1.22, 1.08); delt.position.set(0, -0.02, 0); delt.castShadow = this.fullShadow;
      armRoot.add(delt);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.054, UPPER_ARM_L, 12), mat.shirt);
      upper.position.y = -UPPER_ARM_L / 2; upper.scale.set(1, 1, 1.12); upper.castShadow = this.fullShadow;
      armRoot.add(upper);

      const foreGroup = new THREE.Group();
      foreGroup.position.y = -UPPER_ARM_L;

      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.040, FOREARM_L, 12), mat.skin);
      fore.position.y = -FOREARM_L / 2; fore.castShadow = this.fullShadow;
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.08, 0.07), mat.skin);
      hand.position.set(0, -FOREARM_L - 0.035, 0.01); hand.castShadow = this.fullShadow;

      foreGroup.add(fore, hand);
      armRoot.add(foreGroup);
      return { root: armRoot, fore: foreGroup };
    };

    this.armL = buildArm(1);
    this.armR = buildArm(-1);
    upperContent.add(this.armL.root, this.armR.root);

    this.pivot.add(this.upperBodyGroup);
  }

  /** Altera as cores da skin em tempo real (compatível com UI do HTML) */
  setColors(colors = {}) {
    if (colors.skin) this.materials.skin.color.setHex(colors.skin);
    if (colors.shirt) this.materials.shirt.color.setHex(colors.shirt);
    if (colors.pants) this.materials.pants.color.setHex(colors.pants);
    if (colors.shoe) this.materials.shoe.color.setHex(colors.shoe);
    if (colors.hair) this.materials.hair.color.setHex(colors.hair);
  }

  /** Acopla a arma do jogo na mão direita do personagem */
  setWeapon(weapon) {
    this.weapon = weapon;
    this.armR.fore.add(weapon);
    weapon.visible = !this.carrying;
  }

  /** Atualização de Animação, Câmera, Torção de Tronco e Tiro */
  update(dt, speed, opts = {}) {
    const isMoving = speed > 0.15;
    if (this.weapon) this.weapon.visible = !this.carrying;

    // Transição suave para estado de Mira (ADS)
    const targetAim = this.aiming ? 1.0 : 0.0;
    this.aimAmt = damp(this.aimAmt, targetAim, 12, dt);

    // Gestão de ar/pulo
    const airTarget = opts.air ?? (this._air ?? 0);
    this._air = damp(this._air ?? 0, airTarget, 14, dt);
    const ar = this._air;
    if (this._jumpT > 0) this._jumpT -= dt;

    // --- Rotação do Tronco e Olhar ---
    const hp = clamp(this.lookPitch, -1.1, 1.1);
    const hy = clamp(this.lookYaw, -0.5, 0.5);

    // Suaviza a rotação da cabeça acompanhando a mira
    this.headGroup.rotation.x = damp(this.headGroup.rotation.x, -hp * 0.85, 14, dt);
    this.headGroup.rotation.y = damp(this.headGroup.rotation.y, hy, 14, dt);

    // --- ROTAÇÃO HÍBRIDA POR ESTÁGIOS (Atrasos estritos de 0.2s) ---
    const camForwardAngle = (opts.camYaw || 0) + Math.PI;
    let targetUpperRot = 0;

    if (isMoving) {
      this.turnDelayTimer = 0;
      
      // 1. Pernas e quadril (root) giram primeiro na direção do movimento (atraso de resposta de 0.2s)
      const moveAngle = opts.moveAngle != null ? opts.moveAngle : this.root.rotation.y;
      let rootDiff = moveAngle - this.root.rotation.y;
      rootDiff = Math.atan2(Math.sin(rootDiff), Math.cos(rootDiff));
      this.root.rotation.y += rootDiff * Math.min(dt * 8.0, 1.0); // Giro com resposta em ~0.2s

      // 2. Tronco superior acompanha a direção em seguida (0.2s)
      const analogLocalAngle = opts.analogLocalAngle || 0;
      targetUpperRot = Math.max(-0.35, Math.min(0.35, analogLocalAngle));
      let upperDiff = targetUpperRot - this.upperBodyGroup.rotation.y;
      upperDiff = Math.atan2(Math.sin(upperDiff), Math.cos(upperDiff));
      this.upperBodyGroup.rotation.y += upperDiff * Math.min(dt * 8.0, 1.0);

    } else {
      // Quando parado: Olhar da câmera vira o tronco primeiro; quadril/pernas aguardam 0.2s
      let angleDiff = camForwardAngle - this.root.rotation.y;
      angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

      const MAX_IDLE_TORSO_TWIST = 0.6;
      const THRESHOLD_ANGLE = 0.20;

      if (Math.abs(angleDiff) > THRESHOLD_ANGLE) {
        this.turnDelayTimer += dt;
      } else {
        this.turnDelayTimer = 0;
      }

      targetUpperRot = Math.max(-MAX_IDLE_TORSO_TWIST, Math.min(MAX_IDLE_TORSO_TWIST, angleDiff));

      // Tronco vira primeiro com a visão (resposta em ~0.2s)
      let upperDiff = targetUpperRot - this.upperBodyGroup.rotation.y;
      upperDiff = Math.atan2(Math.sin(upperDiff), Math.cos(upperDiff));
      this.upperBodyGroup.rotation.y += upperDiff * Math.min(dt * 8.0, 1.0);

      // Pernas e quadril viram em seguida após exatamente 0.2s (ou desvio > 0.6 rad)
      if (this.turnDelayTimer >= 0.2 || Math.abs(angleDiff) > MAX_IDLE_TORSO_TWIST) {
        this.root.rotation.y += angleDiff * Math.min(dt * 8.0, 1.0);
      }
    }

    // Animação de locomoção
    const isRun = !!opts.run;
    const cadence = isMoving ? (isRun ? 9.5 : 6.0) : 1.6;
    const amp = isMoving ? (isRun ? 0.65 : 0.40) : 0;
    this.phase += dt * cadence;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);

    if (ar > 0.2) {
      // --- POSE NO AR / SALTO (Alternando perna de apoio a cada pulo) ---
      if (this._jumpT > 0 && !this._jumpPrev) {
        this._jumpSide = (this._jumpSide === 1 ? -1 : 1);
      }
      this._jumpPrev = this._jumpT > 0 ? 1 : 0;

      const isLeftLeading = this._jumpSide === 1;
      this.pivot.position.y = 0.07 + ar * 0.03;
      this.pivot.rotation.x = -0.03;

      // Perna da frente flexiona o joelho; perna de trás empurra/estica
      this.legL.root.rotation.x = isLeftLeading ? -0.4 : 0.3;
      this.legR.root.rotation.x = isLeftLeading ? 0.3 : -0.4;
      this.legL.shin.rotation.x = isLeftLeading ? 0.7 : 0.2;
      this.legR.shin.rotation.x = isLeftLeading ? 0.2 : 0.7;

      // Tornozelo mantém o pé natural no ar
      this.legL.foot.rotation.x = -(this.legL.root.rotation.x + this.legL.shin.rotation.x) + 0.1;
      this.legR.foot.rotation.x = -(this.legR.root.rotation.x + this.legR.shin.rotation.x) + 0.1;

      if (!this.aiming && !this.carrying) {
        const jumpArmY = (opts.vy || 0) * 0.04;
        this.armL.root.rotation.set(-0.2 - jumpArmY, 0.2, 0);
        this.armL.fore.rotation.x = -0.4;
        this.armR.root.rotation.set(-0.2 - jumpArmY, -0.2, 0);
        this.armR.fore.rotation.x = -0.4;
      }
    } else {
      // --- POSE NO CHÃO (Biomecânica de Planta do Pé e Postura Ereta) ---
      const leanTarget = (isRun && isMoving) ? 0.04 : 0;
      this._lean = damp(this._lean, leanTarget, 8, dt);
      this.pivot.rotation.x = this._lean;

      // Coxa alterna movimento (limitado a amplitude natural para não jogar os pés muito para trás)
      const legLSweep = Math.max(-0.38, Math.min(0.36, s * amp));
      const legRSweep = Math.max(-0.38, Math.min(0.36, -s * amp));

      this.legL.root.rotation.x = legLSweep;
      this.legR.root.rotation.x = legRSweep;

      // Flexão natural de joelho na passada
      this.legL.shin.rotation.x = Math.max(0, s) * amp * 1.1 + 0.10;
      this.legR.shin.rotation.x = Math.max(0, -s) * amp * 1.1 + 0.10;

      // --- ARTICULAÇÃO DO PÉ / TORNOZELO (Leve elevação de calcanhar + rolagem dinâmica) ---
      // heelPitch (+0.08) garante uma leve e elegante inclinação de calcanhar (postura atlética).
      // O fator 0.82 remove a trava horizontal rígida para o pé não parecer "colado" no chão.
      const heelPitch = 0.08;
      const heelStrikeL = Math.max(0, s) * amp * -0.12; // Toque suave à frente
      const pushL = Math.max(0, -s) * amp * 0.38;        // Elevação de calcanhar no empurrão

      const heelStrikeR = Math.max(0, -s) * amp * -0.12;
      const pushR = Math.max(0, s) * amp * 0.38;

      const footL_base = -(this.legL.root.rotation.x + this.legL.shin.rotation.x) * 0.82;
      const footR_base = -(this.legR.root.rotation.x + this.legR.shin.rotation.x) * 0.82;

      this.legL.foot.rotation.x = footL_base + heelPitch + heelStrikeL + pushL;
      this.legR.foot.rotation.x = footR_base + heelPitch + heelStrikeR + pushR;

      // Bobbing vertical
      const bob = isMoving ? Math.abs(c) * (isRun ? 0.055 : 0.035) * amp : Math.sin(this.phase) * 0.01;
      this.pivot.position.y = bob;
      this.pivot.rotation.z = isMoving ? Math.sin(this.phase) * 0.03 * amp : 0;

      // --- Animação dos Braços ---
      if (this.carrying) {
        this.armL.root.rotation.set(-1.25, 0, 0.22);
        this.armR.root.rotation.set(-1.25, 0, -0.22);
        this.armL.fore.rotation.x = -0.55;
        this.armR.fore.rotation.x = -0.55;
      } else if (isMoving) {
        if (isRun) {
          this.armL.root.rotation.set(-0.5 - s * amp * 0.4, 0.2, Math.sin(this.phase) * 0.06);
          this.armL.fore.rotation.x = -0.6;

          this.armR.root.rotation.set(-0.4 + s * amp * 0.4, -0.2, -Math.sin(this.phase) * 0.06);
          this.armR.fore.rotation.x = -0.6;
        } else {
          this.armL.root.rotation.set(-s * amp * 0.7, 0.1, 0);
          this.armL.fore.rotation.x = -Math.abs(s) * 0.3 - 0.15;

          this.armR.root.rotation.set(s * amp * 0.7, -0.1, 0);
          this.armR.fore.rotation.x = -Math.abs(s) * 0.3 - 0.15;
        }
      } else {
        // Respiração em estado parado
        const breath = Math.sin(this.phase) * 0.02;
        this.armL.root.rotation.set(-0.1 + breath, 0.1, 0.05);
        this.armL.fore.rotation.x = -0.15;

        this.armR.root.rotation.set(-0.1 + breath, -0.1, -0.05);
        this.armR.fore.rotation.x = -0.15;
      }
    }

    // --- POSIÇÃO DE TIRO E MIRA (ADS BLEND) ---
    if (this.aimAmt > 0.001 && !this.carrying) {
      const a = this.aimAmt;
      const k2 = 1 - a;

      const pitchArm = clamp(this.lookPitch, -0.7, 0.7);
      const yawArm = clamp(this.lookYaw, -0.5, 0.5);

      // Braço Direito (segura a pistola e aponta para a mira)
      this.armR.root.rotation.x = this.armR.root.rotation.x * k2 + (-1.45 - pitchArm) * a;
      this.armR.root.rotation.y = yawArm * a;
      this.armR.root.rotation.z = this.armR.root.rotation.z * k2 + 0.10 * a;
      this.armR.fore.rotation.x = this.armR.fore.rotation.x * k2 + -0.12 * a;

      // Braço Esquerdo (suporte tático à arma)
      this.armL.root.rotation.x = this.armL.root.rotation.x * k2 + (-1.45 - pitchArm * 0.85) * a;
      this.armL.root.rotation.y = yawArm * 0.85 * a;
      this.armL.root.rotation.z = this.armL.root.rotation.z * k2 + -0.30 * a;
      this.armL.fore.rotation.x = this.armL.fore.rotation.x * k2 + -0.12 * a;
    }
  }

  setPose(kind) {
    if (kind === 'panic') {
      this.armL.root.rotation.set(-2.7, 0, 0.5);
      this.armR.root.rotation.set(-2.7, 0, -0.5);
    }
  }

  get position() { return this.root.position; }

  setNight(n) {
    // Ajusta tom noturno dos materiais
    this.materials.shirt.emissiveIntensity = n * 0.2;
    this.materials.pants.emissiveIntensity = n * 0.2;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    Object.values(this.materials).forEach(m => m.dispose());
  }
}
