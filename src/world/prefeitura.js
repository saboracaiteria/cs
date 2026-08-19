import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { CURB_H, CELL } from '../config.js';
import { voxMaterial } from '../ent/voxel.js';

export function buildPrefeitura(scene, col, city) {
  const g = new THREE.Group();
  g.name = 'prefeitura-lago-complex';
  scene.add(g);

  const PISO = CURB_H + 0.12; // Cota elevada (12cm acima da calçada urbana) para garantir que a grama do terreno nunca invada

  // O limite leste da cidade (última rua) fica em x = 224 (onde HALF = 224).
  // A pista de asfalto do complexo do lago tem largura roadW = 12, então seu bordo oeste fica em (lakeX - wOut/2).
  // Queremos que o bordo oeste da pista encoste perfeitamente na rua da cidade (x = 224 + ROAD_H = 233 ou x = 224).
  // Com cx = 282 e pista externa com largura X de 116 (meia largura 58), o bordo oeste fica em 282 - 58 = 224!
  const cx = 282;
  const cz = 0;

  const Q_LEN = CELL; // 64m (1 quarteirão)
  const LAGO_LEN = Q_LEN * 3; // 192m (3 quarteirões de comprimento!)
  const LAGO_W_TOP = 85;   // Topo mais largo (Norte)
  const LAGO_W_BOT = 60;   // Base mais afunilada (Sul)

  const parkW = 150;
  const parkD = LAGO_LEN + 50;

  // Centro do complexo lago/faixas
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

  // --- PISTA DE ASFALTO COM FAIXAS (IGUAL ÀS RUAS DA CIDADE) ---
  const roadW = 12.0; // Largura da rua de asfalto estilo cidade
  const ruaGeo = makeRingGeometry(116, 90, 236, 116 - roadW*2, 90 - roadW*2, 236 - roadW*2);
  ruaGeo.translate(lakeX, 0, lakeZ);

  // Usa o mesmo material de asfalto texturizado da cidade ou cria um equivalente com asphaltTexture
  const roadMat = city && city.roadMaterial ? city.roadMaterial : new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.82,
    metalness: 0.1,
  });
  const ruaMesh = new THREE.Mesh(ruaGeo, roadMat);
  ruaMesh.receiveShadow = true;
  g.add(ruaMesh);

  // Marcações das faixas brancas na pista externa
  const faixaExtGeo = makeRingGeometry(115.6, 89.6, 235.6, 115.2, 89.2, 235.2);
  faixaExtGeo.translate(lakeX, 0.012, lakeZ);
  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf2f2ee, roughness: 0.62, metalness: 0.0,
    emissive: 0x1a1a18, emissiveIntensity: 0.5,
  });
  const faixaExtMesh = new THREE.Mesh(faixaExtGeo, whiteMat);
  g.add(faixaExtMesh);

  // Faixa amarela dividindo as pistas
  const faixaAmarelaGeo = makeRingGeometry(104, 78, 224, 103.4, 77.4, 223.4);
  faixaAmarelaGeo.translate(lakeX, 0.012, lakeZ);
  const yellowMat = new THREE.MeshStandardMaterial({
    color: 0xe8b93a, roughness: 0.66, metalness: 0.0,
    emissive: 0x2a1e05, emissiveIntensity: 0.5,
  });
  const faixaAmarelaMesh = new THREE.Mesh(faixaAmarelaGeo, yellowMat);
  g.add(faixaAmarelaMesh);

  // --- DIMENSÕES CONCÊNTRICAS (FAIXAS INTERNAS DO PARQUE) ---
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
  const lakeShape = makeTrapezoidShape(60, 42, 154);

  const DEPTH = 1.8;
  const WATER_Y = PISO - 0.35;

  // Bacia/Fundo do Lago (Azul escuro profundo)
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

  // Superfície da Água (Azul vivo cristalino)
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

  // --- PRÉDIO DA PREFEITURA ---
  // A pista externa fica em cx=282. O bordo interno da pista no lado leste (+X) no topo (Norte, -Z)
  // tem wTopIn / 2 = (116 - 24)/2 = 46 (ou seja, X = 282 + 46 = 328).
  // A pista inteira se estende até X = 282 + 58 = 340.
  // Colocaremos o prédio da prefeitura na área interna do parque ou ajustado para não ficar por cima da rua leste!
  // Prédio: bldgW = 24. Se posicionado em bldgX = 314, vai de X=302 a X=326 (perfeitamente dentro do calçadão/parque, antes de chegar na pista de asfalto 328-340).
  const bldgW = 24;
  const bldgD = 60;
  const bldgH = 9.5;

  // Coordenadas: Lado Leste (+X) na área interna do parque, cabeceira Norte (-Z) do lago
  const bldgX = cx + 32; // 282 + 32 = 314 (fica a oeste da rua leste que começa em 328)
  const bldgZ = cz - 75;

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

  const glassFacade = new THREE.Mesh(new THREE.BoxGeometry(0.5, bldgH * 0.8, bldgD * 0.7), vidro);
  glassFacade.position.set(bldgX - bldgW / 2 - 0.3, PISO + bldgH * 0.48, bldgZ);
  g.add(glassFacade);

  const marquise = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 22), concreto);
  marquise.position.set(bldgX - bldgW / 2 - 4, PISO + 4.5, bldgZ);
  marquise.castShadow = true;
  g.add(marquise);

  const totemMat = voxMaterial(0xffffff, { aspereza: 0.4 });
  const totem = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.2, 3.5), totemMat);
  totem.position.set(bldgX - 14, PISO + 2.1, bldgZ + 18);
  totem.castShadow = true;
  g.add(totem);

  const totemPlaca = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.6, 3.2), voxMaterial(0x184838));
  totemPlaca.position.set(bldgX - 14, PISO + 3.1, bldgZ + 18);
  g.add(totemPlaca);

  col.addBox(bldgX, bldgZ, bldgW / 2, bldgD / 2, PISO + bldgH, 'prefeitura');
}