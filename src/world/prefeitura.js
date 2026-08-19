import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { CURB_H, CELL } from '../config.js';
import { voxMaterial } from '../ent/voxel.js';

export function buildPrefeitura(scene, col, city) {
  const g = new THREE.Group();
  g.name = 'prefeitura-lago-complex';
  scene.add(g);

  const PISO = CURB_H + 0.12; // Cota elevada (12cm acima da calçada urbana) para garantir que a grama do terreno nunca invada

  const cx = 310;
  const cz = 0;

  const Q_LEN = CELL; // 64m (1 quarteirão)
  const LAGO_LEN = Q_LEN * 3; // 192m (3 quarteirões de comprimento!)
  const LAGO_W_TOP = 85;   // Topo mais largo (Norte)
  const LAGO_W_BOT = 60;   // Base mais afunilada (Sul)

  const parkW = 150;
  const parkD = LAGO_LEN + 50;

  // Centro do complexo lago/faixas (mesmo centro do quarteirão da prefeitura)
  const lakeX = cx;
  const lakeZ = cz;

  function makeTrapezoidShape(wTop, wBot, length) {
    const s = new THREE.Shape();
    const halfL = length / 2;
    const wt = wTop / 2;
    const wb = wBot / 2;

    // +halfL = Topo (Norte - Largo)
    // -halfL = Base (Sul - Estreito)
    s.moveTo(-wb + 6, -halfL);
    s.quadraticCurveTo(-wb - 4, 0, -wt + 8, halfL);
    s.quadraticCurveTo(0, halfL + 6, wt - 8, halfL);
    s.quadraticCurveTo(wt + 4, 0, wb - 6, -halfL);
    s.quadraticCurveTo(0, -halfL - 6, -wb + 6, -halfL);
    return s;
  }

  // Helper para criar anéis/pistas vazadas no centro
  function makeRingGeometry(wTopOut, wBotOut, lenOut, wTopIn, wBotIn, lenIn) {
    const outer = makeTrapezoidShape(wTopOut, wBotOut, lenOut);
    const inner = makeTrapezoidShape(wTopIn, wBotIn, lenIn);
    const holePath = new THREE.Path(inner.getPoints().reverse()); // Sentido inverso para furo correto
    outer.holes = [holePath];
    const geo = new THREE.ShapeGeometry(outer);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  // --- DIMENSÕES CONCÊNTRICAS ---
  // 3. Faixa Externa (Calçadão de Concreto Claro)
  const calcadaoExtGeo = makeRingGeometry(92, 66, 210, 84, 60, 196);
  calcadaoExtGeo.translate(lakeX, PISO + 0.01, lakeZ);
  const concreteMat = voxMaterial(0xdcd6cd, { aspereza: 0.75 });
  const calcadaoExt = new THREE.Mesh(calcadaoExtGeo, concreteMat);
  calcadaoExt.receiveShadow = true;
  g.add(calcadaoExt);

  // 2. Faixa do Meio (Pista Vermelha de Caminhada/Ciclovia)
  const pistaVermelhaGeo = makeRingGeometry(84, 60, 196, 76, 54, 182);
  pistaVermelhaGeo.translate(lakeX, PISO + 0.02, lakeZ);
  const trackMat = voxMaterial(0xc24936, { aspereza: 0.8 });
  const pistaVermelha = new THREE.Mesh(pistaVermelhaGeo, trackMat);
  pistaVermelha.receiveShadow = true;
  g.add(pistaVermelha);

  // 1. Faixa Interna (Calçadão de Concreto Claro)
  const calcadaoIntGeo = makeRingGeometry(76, 54, 182, 68, 48, 168);
  calcadaoIntGeo.translate(lakeX, PISO + 0.03, lakeZ);
  const calcadaoInt = new THREE.Mesh(calcadaoIntGeo, concreteMat);
  calcadaoInt.receiveShadow = true;
  g.add(calcadaoInt);

  // --- LAGO (100% Encaixado dentro do espaço interno, sem tocar nas faixas) ---
  // Borda do lago: Topo 60m, Base 42m, Extensão 154m (deixa ~4m de margem livre em relação à faixa interna)
  const lakeShape = makeTrapezoidShape(60, 42, 154);

  const DEPTH = 1.8;
  const WATER_Y = PISO - 0.35;

  // Bacia/Fundo do Lago (Azul escuro profundo para dar sensação de profundidade)
  const basinMat = voxMaterial(0x0e3b5e, { aspereza: 0.95 });
  const extrudeSettings = {
    steps: 1,
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.3,
    bevelSize: 0.3,
    bevelSegments: 2,
  };
  const basinGeo = new THREE.ExtrudeGeometry(lakeShape, extrudeSettings);
  basinGeo.rotateX(-Math.PI / 2);
  basinGeo.translate(lakeX, PISO - DEPTH, lakeZ);

  const basinMesh = new THREE.Mesh(basinGeo, basinMat);
  basinMesh.receiveShadow = true;
  g.add(basinMesh);

  // Superfície da Água (Azul vivo cristalino e reluzente)
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x0077be,
    roughness: 0.05,
    metalness: 0.8,
    transparent: true,
    opacity: 0.78,
  });

  const waterShapeGeo = new THREE.ShapeGeometry(lakeShape);
  waterShapeGeo.rotateX(-Math.PI / 2);
  waterShapeGeo.translate(lakeX, WATER_Y, lakeZ);

  const waterMesh = new THREE.Mesh(waterShapeGeo, waterMat);
  waterMesh.receiveShadow = true;
  g.add(waterMesh);

  // --- PRÉDIO DA PREFEITURA (ao lado do lago) ---
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

  const columns = [];
  for (let z = -bldgD / 2 + 3; z <= bldgD / 2 - 3; z += 6) {
    const colGeo = new THREE.BoxGeometry(0.8, bldgH + 0.3, 0.8);
    colGeo.translate(bldgX - bldgW / 2 - 0.2, PISO + bldgH / 2, bldgZ + z);
    columns.push(colGeo);
  }
  const colMesh = new THREE.Mesh(mergeGeometries(columns, false), verdeEscuro);
  colMesh.castShadow = true;
  g.add(colMesh);

  const glassFacade = new THREE.Mesh(new THREE.BoxGeometry(0.5, bldgH * 0.8, 18), vidro);
  glassFacade.position.set(bldgX - bldgW / 2 - 0.3, PISO + bldgH * 0.48, bldgZ);
  g.add(glassFacade);

  const marquise = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 22), concreto);
  marquise.position.set(bldgX - bldgW / 2 - 4, PISO + 4.5, bldgZ);
  marquise.castShadow = true;
  g.add(marquise);

  const totemMat = voxMaterial(0xffffff, { aspereza: 0.4 });
  const totem = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.2, 3.5), totemMat);
  totem.position.set(bldgX - 18, PISO + 2.1, bldgZ + 18);
  totem.castShadow = true;
  g.add(totem);

  const totemPlaca = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.6, 3.2), voxMaterial(0x184838));
  totemPlaca.position.set(bldgX - 18, PISO + 3.1, bldgZ + 18);
  g.add(totemPlaca);

  col.addBox(bldgX, bldgZ, bldgW / 2, bldgD / 2, PISO + bldgH, 'prefeitura');
}