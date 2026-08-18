import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { CURB_H, BLOCK_INNER } from '../config.js';
import { voxMaterial } from '../ent/voxel.js';

/**
 * ============================================================
 *  Complexo do Centro Administrativo (Canaã dos Carajás)
 *  Prédios Verde Claro + Lago + Praça Envidraçada + Pista Vermelha
 * ============================================================
 */

export function buildPrefeitura(scene, col, city) {
  const block = city.prefeituraBlock || city.blockAt(5, 3);
  if (!block) return;
  const cx = block.cx, cz = block.cz; // x=128, z=0
  const g = new THREE.Group();
  g.name = 'prefeitura-complex';
  scene.add(g);

  const PISO = CURB_H + 0.02;

  // ------------------------------------------------------------------ 1. Gramado Base do Parque
  const size = BLOCK_INNER; // 36m
  const grassMat = voxMaterial(0x528e38, { aspereza: 0.9 });
  const grassMesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), grassMat);
  grassMesh.position.set(cx, PISO, cz);
  grassMesh.receiveShadow = true;
  g.add(grassMesh);
  col.addPlatform(cx - size / 2, cz - size / 2, cx + size / 2, cz + size / 2, () => PISO);

  // ------------------------------------------------------------------ 2. O Lago Ornamental da Prefeitura (Canaã)
  const lakeW = 16, lakeD = 22;
  const lakeX = cx - 7, lakeZ = cz;
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x1da2b4,
    roughness: 0.08,
    metalness: 0.1,
    transmission: 0.8,
    transparent: true,
    opacity: 0.85,
    clearcoat: 1.0,
  });
  const lakeMesh = new THREE.Mesh(new THREE.PlaneGeometry(lakeW, lakeD).rotateX(-Math.PI / 2), waterMat);
  lakeMesh.position.set(lakeX, PISO + 0.03, lakeZ);
  lakeMesh.receiveShadow = true;
  g.add(lakeMesh);

  // Borda de pedra e ciclovia vermelha ao redor do lago
  const borderMat = voxMaterial(0xca5844, { aspereza: 0.8 }); // Pista/ciclovia vermelha da foto
  const borderGeo = new THREE.RingGeometry(8, 12, 32).rotateX(-Math.PI / 2);
  const borderMesh = new THREE.Mesh(borderGeo, borderMat);
  borderMesh.position.set(lakeX, PISO + 0.02, lakeZ);
  g.add(borderMesh);

  // ------------------------------------------------------------------ 3. Prédios Verde Claro do Centro Administrativo
  const verdeClaro = voxMaterial(0xa4c4b5, { aspereza: 0.7, metal: 0.1 }); // Cor verde pastel idêntica à foto
  const verdeEscuro = voxMaterial(0x355e4e, { aspereza: 0.6, metal: 0.2 }); // Frisos e colunas verticais
  const vidro = voxMaterial(0x82c3d9, { emissivo: 0.2, aspereza: 0.2 });
  const concreto = voxMaterial(0xdddddd, { aspereza: 0.9 });

  const bldgX = cx + 8, bldgZ = cz;
  const bldgW = 14, bldgD = 28, bldgH = 8.5;

  // Bloco Principal
  const bldgMesh = new THREE.Mesh(new THREE.BoxGeometry(bldgW, bldgH, bldgD), verdeClaro);
  bldgMesh.position.set(bldgX, PISO + bldgH / 2, bldgZ);
  bldgMesh.castShadow = true;
  bldgMesh.receiveShadow = true;
  g.add(bldgMesh);

  // Colunas verticais e detalhes arquitetônicos verdes
  const columns = [];
  for (let z = -bldgD / 2 + 2; z <= bldgD / 2 - 2; z += 4) {
    const colGeo = new THREE.BoxGeometry(0.6, bldgH + 0.2, 0.6);
    colGeo.translate(bldgX - bldgW / 2 - 0.1, PISO + bldgH / 2, bldgZ + z);
    columns.push(colGeo);
  }
  const colMesh = new THREE.Mesh(mergeGeometries(columns, false), verdeEscuro);
  colMesh.castShadow = true;
  g.add(colMesh);

  // Fachada Central de Cobogós/Envidraçada (Canaã)
  const glassFacade = new THREE.Mesh(new THREE.BoxGeometry(0.4, bldgH * 0.75, 8), vidro);
  glassFacade.position.set(bldgX - bldgW / 2 - 0.2, PISO + bldgH * 0.45, bldgZ);
  g.add(glassFacade);

  // Totem "CENTRO ADMINISTRATIVO"
  const totemMat = voxMaterial(0xffffff, { aspereza: 0.5 });
  const totem = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.5, 2.2), totemMat);
  totem.position.set(cx - 1, PISO + 1.75, cz + 12);
  totem.castShadow = true;
  g.add(totem);

  const totemPlaca = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 2.0), voxMaterial(0x1b4d3e));
  totemPlaca.position.set(cx - 1, PISO + 2.6, cz + 12);
  g.add(totemPlaca);

  // Colisões do Complexo
  col.addBox(bldgX, bldgZ, bldgW / 2, bldgD / 2, PISO + bldgH, 'prefeitura');
}
