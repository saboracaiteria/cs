import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { CURB_H, CELL } from '../config.js';
import { voxMaterial } from '../ent/voxel.js';

/**
 * ============================================================
 *  Complexo do Centro Administrativo & Lago Municipal (Canaã)
 *  - Fica ao LADO da cidade (fora da malha urbana principal).
 *  - Prefeitura: comprimento de 1 quarteirão inteiro (~64m).
 *  - Lago: comprimento de 3 quarteirões inteiros (~192m).
 * ============================================================
 */

export function buildPrefeitura(scene, col, city) {
  const g = new THREE.Group();
  g.name = 'prefeitura-lago-complex';
  scene.add(g);

  const PISO = CURB_H + 0.02;

  // Posição base: AO LADO da cidade (Leste da malha urbana)
  // Malha vai de x = -256 até +256. Colocamos o parque iniciando logo após a borda da cidade em x = 280, z = 0.
  const cx = 310;
  const cz = 0;

  const Q_LEN = CELL; // 64m (comprimento de 1 quarteirão)
  const LAGO_LEN = Q_LEN * 3; // 192m (comprimento de 3 quarteirões!)
  const LAGO_W = 75; // 75m de largura do lago

  // ------------------------------------------------------------------ 1. Gramado Gigante do Parque da Prefeitura
  const parkW = 160;
  const parkD = LAGO_LEN + 40; // 232m de extensão do parque
  const grassMat = voxMaterial(0x487e32, { aspereza: 0.9 });
  const grassMesh = new THREE.Mesh(new THREE.PlaneGeometry(parkW, parkD).rotateX(-Math.PI / 2), grassMat);
  grassMesh.position.set(cx, PISO, cz);
  grassMesh.receiveShadow = true;
  g.add(grassMesh);

  // Plataforma caminhável do parque
  col.addPlatform(cx - parkW / 2, cz - parkD / 2, cx + parkW / 2, cz + parkD / 2, () => PISO);

  // ------------------------------------------------------------------ 2. O Grande Lago da Prefeitura (3 Quarteirões)
  const lakeX = cx - 25;
  const lakeZ = cz;
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x1892a6,
    roughness: 0.06,
    metalness: 0.15,
    transmission: 0.85,
    transparent: true,
    opacity: 0.88,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });

  const lakeMesh = new THREE.Mesh(new THREE.PlaneGeometry(LAGO_W, LAGO_LEN).rotateX(-Math.PI / 2), waterMat);
  lakeMesh.position.set(lakeX, PISO + 0.04, lakeZ);
  lakeMesh.receiveShadow = true;
  g.add(lakeMesh);

  // Pista de Caminhada / Ciclovia Vermelha Periférica (Canaã)
  const trackMat = voxMaterial(0xc24936, { aspereza: 0.8 }); // Pista vermelha
  const trackBorderGeo = new THREE.PlaneGeometry(LAGO_W + 12, LAGO_LEN + 12).rotateX(-Math.PI / 2);
  const trackMesh = new THREE.Mesh(trackBorderGeo, trackMat);
  trackMesh.position.set(lakeX, PISO + 0.02, lakeZ);
  g.add(trackMesh);

  // Re-imprimir relva interna dentro do anel da pista para não cobrir a água
  const innerGrassGeo = new THREE.PlaneGeometry(LAGO_W, LAGO_LEN).rotateX(-Math.PI / 2);
  const innerGrassMesh = new THREE.Mesh(innerGrassGeo, grassMat);
  innerGrassMesh.position.set(lakeX, PISO + 0.03, lakeZ);
  g.add(innerGrassMesh);

  // ------------------------------------------------------------------ 3. Prédio da Prefeitura (1 Quarteirão de Comprimento)
  const bldgX = cx + 45;
  const bldgZ = cz;
  const bldgW = 24; // 24m de largura
  const bldgD = Q_LEN; // 64m (1 Quarteirão completo de comprimento!)
  const bldgH = 9.5; // Altura ideal mantida

  const verdeClaro = voxMaterial(0xa2c7b5, { aspereza: 0.65, metal: 0.1 });
  const verdeEscuro = voxMaterial(0x2d5948, { aspereza: 0.55, metal: 0.2 });
  const vidro = voxMaterial(0x76b9d0, { emissivo: 0.25, aspereza: 0.2, metal: 0.5 });
  const concreto = voxMaterial(0xe2e2e2, { aspereza: 0.9 });

  // Bloco Principal da Prefeitura
  const bldgMesh = new THREE.Mesh(new THREE.BoxGeometry(bldgW, bldgH, bldgD), verdeClaro);
  bldgMesh.position.set(bldgX, PISO + bldgH / 2, bldgZ);
  bldgMesh.castShadow = true;
  bldgMesh.receiveShadow = true;
  g.add(bldgMesh);

  // Colunas e Frisos Verticais Verdes na Fachada Principal (Voltada para o Lago)
  const columns = [];
  for (let z = -bldgD / 2 + 3; z <= bldgD / 2 - 3; z += 6) {
    const colGeo = new THREE.BoxGeometry(0.8, bldgH + 0.3, 0.8);
    colGeo.translate(bldgX - bldgW / 2 - 0.2, PISO + bldgH / 2, bldgZ + z);
    columns.push(colGeo);
  }
  const colMesh = new THREE.Mesh(mergeGeometries(columns, false), verdeEscuro);
  colMesh.castShadow = true;
  g.add(colMesh);

  // Fachada Central de Vidro / Cobogós
  const glassFacade = new THREE.Mesh(new THREE.BoxGeometry(0.5, bldgH * 0.8, 18), vidro);
  glassFacade.position.set(bldgX - bldgW / 2 - 0.3, PISO + bldgH * 0.48, bldgZ);
  g.add(glassFacade);

  // Marquise e Entrada do Centro Administrativo
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
