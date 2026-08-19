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

  // --- PISTA DE ASFALTO / RUAS EXTERNAS AO REDOR DO COMPLEXO ---
  // Faixa de rua asfaltada que circula todo o parque
  const ruaGeo = makeRingGeometry(116, 90, 236, 96, 70, 216);
  ruaGeo.translate(lakeX, PISO + 0.005, lakeZ);
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.82,
    metalness: 0.1,
  });
  const ruaMesh = new THREE.Mesh(ruaGeo, roadMat);
  ruaMesh.receiveShadow = true;
  g.add(ruaMesh);

  // --- DIMENSÕES CONCÊNTRICAS (FAIXAS DO PARQUE) ---
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

  // --- PRÉDIO DA PREFEITURA (Posicionado no topo/Norte do lago - Marcado de vermelho) ---
  const bldgW = 64; // Frente virada para o lago
  const bldgD = 22; // Profundidade
  const bldgH = 9.5;

  // Coordenadas: Topo/Norte do lago (lakeZ - LAGO_LEN/2 - offset)
  const bldgX = cx;
  const bldgZ = cz - (LAGO_LEN / 2) - 22;

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
  for (let x = -bldgW / 2 + 4; x <= bldgW / 2 - 4; x += 6) {
    const colGeo = new THREE.BoxGeometry(0.8, bldgH + 0.3, 0.8);
    colGeo.translate(bldgX + x, PISO + bldgH / 2, bldgZ + bldgD / 2 + 0.2);
    columns.push(colGeo);
  }
  const colMesh = new THREE.Mesh(mergeGeometries(columns, false), verdeEscuro);
  colMesh.castShadow = true;
  g.add(colMesh);

  const glassFacade = new THREE.Mesh(new THREE.BoxGeometry(bldgW * 0.7, bldgH * 0.8, 0.5), vidro);
  glassFacade.position.set(bldgX, PISO + bldgH * 0.48, bldgZ + bldgD / 2 + 0.3);
  g.add(glassFacade);

  const marquise = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 8), concreto);
  marquise.position.set(bldgX, PISO + 4.5, bldgZ + bldgD / 2 + 4);
  marquise.castShadow = true;
  g.add(marquise);

  const totemMat = voxMaterial(0xffffff, { aspereza: 0.4 });
  const totem = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.2, 1.2), totemMat);
  totem.position.set(bldgX - 18, PISO + 2.1, bldgZ + bldgD / 2 + 10);
  totem.castShadow = true;
  g.add(totem);

  const totemPlaca = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 1.35), voxMaterial(0x184838));
  totemPlaca.position.set(bldgX - 18, PISO + 3.1, bldgZ + bldgD / 2 + 10);
  g.add(totemPlaca);

  col.addBox(bldgX, bldgZ, bldgW / 2, bldgD / 2, PISO + bldgH, 'prefeitura');
}