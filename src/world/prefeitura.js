import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { CURB_H, CELL } from '../config.js';
import { voxMaterial } from '../ent/voxel.js';

/**
 * ============================================================
 *  Complexo do Centro Administrativo & Lago Municipal (Canaã)
 *  - Relevo 100% plano (garantido pelo Platô da Prefeitura).
 *  - Formato Orgânico Curvo / Trapezoidal Idêntico à Foto de Satélite.
 *  - Escavado com Profundidade real (1.8m) em relação ao calçadão/pista.
 * ============================================================
 */

export function buildPrefeitura(scene, col, city) {
  const g = new THREE.Group();
  g.name = 'prefeitura-lago-complex';
  scene.add(g);

  const PISO = CURB_H + 0.02;

  // Posição base: Leste da cidade (fora da malha urbana)
  const cx = 310;
  const cz = 0;

  const Q_LEN = CELL; // 64m (1 quarteirão)
  const LAGO_LEN = Q_LEN * 3; // 192m (3 quarteirões de comprimento!)
  const LAGO_W_TOP = 85;   // Topo mais largo (Norte)
  const LAGO_W_BOT = 60;   // Base mais afunilada (Sul)

  // ------------------------------------------------------------------ 1. Gramado do Parque
  const parkW = 140;
  const parkD = LAGO_LEN + 40;
  const grassMat = voxMaterial(0x487e32, { aspereza: 0.9 });
  const grassMesh = new THREE.Mesh(new THREE.PlaneGeometry(parkW, parkD).rotateX(-Math.PI / 2), grassMat);
  grassMesh.position.set(cx, PISO, cz);
  grassMesh.receiveShadow = true;
  g.add(grassMesh);

  col.addPlatform(cx - parkW / 2, cz - parkD / 2, cx + parkW / 2, cz + parkD / 2, () => PISO);

  // ------------------------------------------------------------------ 2. Formato Orgânico do Lago (Foto de Satélite)
  const lakeX = cx - 15;
  const lakeZ = cz;

  // Criando a forma (Shape 2D) com cantos arredondados e lados em curva suave
  const shape = new THREE.Shape();
  const halfL = LAGO_LEN / 2;
  const wTop = LAGO_W_TOP / 2;
  const wBot = LAGO_W_BOT / 2;

  // Desenho orgânico no plano X/Z
  shape.moveTo(-wBot + 8, -halfL);
  shape.quadraticCurveTo(-wBot - 5, 0, -wTop + 10, halfL);
  shape.quadraticCurveTo(0, halfL + 8, wTop - 10, halfL);
  shape.quadraticCurveTo(wTop + 5, 0, wBot - 8, -halfL);
  shape.quadraticCurveTo(0, -halfL - 8, -wBot + 8, -halfL);

  // ------------------------------------------------------------------ 3. Escavação & Margem com Profundidade Real (1.8m)
  const DEPTH = 1.8;
  const WATER_Y = PISO - 0.35; // Água 35cm abaixo da pista
  const BOTTOM_Y = PISO - DEPTH;

  const basinMat = voxMaterial(0x324738, { aspereza: 0.95 });
  const extrudeSettings = {
    steps: 1,
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.4,
    bevelSize: 0.5,
    bevelSegments: 3,
  };
  const basinGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  basinGeo.rotateX(Math.PI / 2);
  basinGeo.translate(lakeX, PISO, lakeZ);

  const basinMesh = new THREE.Mesh(basinGeo, basinMat);
  basinMesh.receiveShadow = true;
  g.add(basinMesh);

  // ------------------------------------------------------------------ 4. Lâmina d'Água Visível
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x1aa0b4,
    roughness: 0.1,
    metalness: 0.5,
    transparent: true,
    opacity: 0.88,
  });

  const waterShapeGeo = new THREE.ShapeGeometry(shape);
  waterShapeGeo.rotateX(-Math.PI / 2);
  waterShapeGeo.translate(lakeX, WATER_Y, lakeZ);

  const waterMesh = new THREE.Mesh(waterShapeGeo, waterMat);
  waterMesh.receiveShadow = true;
  g.add(waterMesh);

  // ------------------------------------------------------------------ 5. Pista Vermelha de Caminhada/Ciclovia Acompanhando o Formato Orgânico
  const trackMat = voxMaterial(0xc24936, { aspereza: 0.8 }); // Pista vermelha
  const trackShapeGeo = new THREE.ShapeGeometry(shape);
  trackShapeGeo.rotateX(-Math.PI / 2);

  // Pista ao redor (ligeiramente maior)
  const trackMesh = new THREE.Mesh(trackShapeGeo, trackMat);
  trackMesh.scale.set(1.15, 1.15, 1.15);
  trackMesh.position.set(lakeX, PISO + 0.01, lakeZ);
  g.add(trackMesh);

  // Re-cobrir a relva interna para deixar apenas a faixa de pista visível em volta
  const innerCoverMesh = new THREE.Mesh(trackShapeGeo, grassMat);
  innerCoverMesh.scale.set(1.02, 1.02, 1.02);
  innerCoverMesh.position.set(lakeX, PISO + 0.02, lakeZ);
  g.add(innerCoverMesh);

  // ------------------------------------------------------------------ 6. Prédio da Prefeitura (1 Quarteirão de Comprimento)
  const bldgX = cx + 55;
  const bldgZ = cz;
  const bldgW = 24;
  const bldgD = Q_LEN; // 64m (1 Quarteirão completo)
  const bldgH = 9.5;

  const verdeClaro = voxMaterial(0xa2c7b5, { aspereza: 0.65, metal: 0.1 });
  const verdeEscuro = voxMaterial(0x2d5948, { aspereza: 0.55, metal: 0.2 });
  const vidro = voxMaterial(0x76b9d0, { emissivo: 0.25, aspereza: 0.2, metal: 0.5 });
  const concreto = voxMaterial(0xe2e2e2, { aspereza: 0.9 });

  const bldgMesh = new THREE.Mesh(new THREE.BoxGeometry(bldgW, bldgH, bldgD), verdeClaro);
  bldgMesh.position.set(bldgX, PISO + bldgH / 2, bldgZ);
  bldgMesh.castShadow = true;
  bldgMesh.receiveShadow = true;
  g.add(bldgMesh);

  // Colunas da Fachada
  const columns = [];
  for (let z = -bldgD / 2 + 3; z <= bldgD / 2 - 3; z += 6) {
    const colGeo = new THREE.BoxGeometry(0.8, bldgH + 0.3, 0.8);
    colGeo.translate(bldgX - bldgW / 2 - 0.2, PISO + bldgH / 2, bldgZ + z);
    columns.push(colGeo);
  }
  const colMesh = new THREE.Mesh(mergeGeometries(columns, false), verdeEscuro);
  colMesh.castShadow = true;
  g.add(colMesh);

  // Fachada Central Envidraçada
  const glassFacade = new THREE.Mesh(new THREE.BoxGeometry(0.5, bldgH * 0.8, 18), vidro);
  glassFacade.position.set(bldgX - bldgW / 2 - 0.3, PISO + bldgH * 0.48, bldgZ);
  g.add(glassFacade);

  // Marquise de Entrada
  const marquise = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 22), concreto);
  marquise.position.set(bldgX - bldgW / 2 - 4, PISO + 4.5, bldgZ);
  marquise.castShadow = true;
  g.add(marquise);

  // Totem do Centro Administrativo
  const totemMat = voxMaterial(0xffffff, { aspereza: 0.4 });
  const totem = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.2, 3.5), totemMat);
  totem.position.set(bldgX - 18, PISO + 2.1, bldgZ + 18);
  totem.castShadow = true;
  g.add(totem);

  const totemPlaca = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.6, 3.2), voxMaterial(0x184838));
  totemPlaca.position.set(bldgX - 18, PISO + 3.1, bldgZ + 18);
  g.add(totemPlaca);

  // Colisão da Prefeitura
  col.addBox(bldgX, bldgZ, bldgW / 2, bldgD / 2, PISO + bldgH, 'prefeitura');
}
