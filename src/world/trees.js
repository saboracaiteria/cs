// trees.js — Árvores 100% procedurais (código puro, sem GLB).
// 3 estilos: decídua (carvalho com galhos), pinheiro (cones), esférica (parque).
// Um bosque inteiro = 2 draw calls (troncos + copas) via mergeGeometries.
import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/jsm/utils/BufferGeometryUtils.js';
import { CURB_H } from '../config.js';
import { makeRng, rngRange, rngInt } from '../utils.js';

// ---------- helpers de geometria ----------

// cilindro com base na origem (y=0) subindo até h
function cyl(rTop, rBot, h, seg = 7) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(0, h / 2, 0);
  return g;
}

// galho fino partindo do tronco (tilt = inclinação p/ fora, yaw = direção)
function branch(ox, oy, oz, len, r, tilt, yaw, seg = 5) {
  const g = new THREE.CylinderGeometry(r * 0.55, r, len, seg);
  g.translate(0, len / 2, 0);
  g.rotateZ(tilt);
  g.rotateY(yaw);
  g.translate(ox, oy, oz);
  return g;
}

// espalha os vértices levemente (forma orgânica)
function jitter(geo, rng, amt) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i,
      p.getX(i) + (rng() - 0.5) * amt,
      p.getY(i) + (rng() - 0.5) * amt,
      p.getZ(i) + (rng() - 0.5) * amt);
  }
  return geo;
}

// pinta todos os vértices com a mesma cor (vertex color p/ variar por árvore)
function paint(geo, color) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

// ---------- estilos de árvore ----------

// Carvalho/decídua: tronco reto + 2-4 galhos + copa de blobs grandes
function makeDecidua(rng, leafDetail) {
  const trunkParts = [cyl(0.16, 0.32, 3.2)];
  const nB = rngInt(rng, 2, 4);
  for (let i = 0; i < nB; i++) {
    trunkParts.push(branch(
      0, rngRange(rng, 1.5, 2.8), 0,
      rngRange(rng, 0.9, 1.7), rngRange(rng, 0.07, 0.11),
      rngRange(rng, 0.45, 1.0), rngRange(rng, 0, Math.PI * 2)));
  }
  const trunk = mergeGeometries(trunkParts, false);

  const d = leafDetail;
  const R = rngRange(rng, 1.7, 2.3);
  const baseY = rngRange(rng, 2.7, 3.4);
  const nBlob = d ? rngInt(rng, 7, 10) : 5;
  const blobs = [];
  for (let i = 0; i < nBlob; i++) {
    const a = rngRange(rng, 0, Math.PI * 2);
    const e = rngRange(rng, 0.25, 1);
    const rr = rngRange(rng, 0.6, 1.05) * R * 0.5;
    const b = d ? new THREE.IcosahedronGeometry(rr, 1) : new THREE.IcosahedronGeometry(rr, 0);
    b.translate(
      Math.cos(a) * R * (0.4 + 0.6 * Math.sqrt(e)),
      baseY + Math.sin(e * Math.PI) * R * 0.42,
      Math.sin(a) * R * (0.4 + 0.6 * Math.sqrt(e)));
    blobs.push(b);
  }
  const leaves = mergeGeometries(blobs, false);
  jitter(leaves, rng, d ? 0.18 : 0.12);
  leaves.computeVertexNormals();
  return { trunk, leaves };
}

// Pinheiro: tronco fino + 5 camadas de cones empilhadas
function makePinheiro(rng, leafDetail) {
  const trunk = mergeGeometries([cyl(0.10, 0.24, 2.8)], false);
  const d = leafDetail;
  const top = rngRange(rng, 3.8, 4.8);
  const layers = [];
  const N = 5;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const y = top * (0.42 + t * 0.58);
    const r = (1 - t) * 1.45 + 0.14;
    const cone = new THREE.ConeGeometry(r, rngRange(rng, 1.1, 1.5), d ? 8 : 6);
    cone.translate(0, y, 0);
    layers.push(cone);
  }
  const leaves = mergeGeometries(layers, false);
  jitter(leaves, rng, 0.07);
  leaves.computeVertexNormals();
  return { trunk, leaves };
}

// Esférica de parque: tronco curto + bola achatada com "ombros"
function makeEsferica(rng, leafDetail) {
  const trunk = mergeGeometries([cyl(0.15, 0.27, 2.5)], false);
  const d = leafDetail;
  const R = rngRange(rng, 1.5, 2.0);
  const blobs = [];
  const main = d ? new THREE.SphereGeometry(R, 10, 8) : new THREE.SphereGeometry(R, 7, 5);
  main.scale(1, 0.82, 1);
  main.translate(0, 2.6 + R * 0.55, 0);
  blobs.push(main);
  const n = d ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = new THREE.SphereGeometry(R * 0.45, d ? 7 : 5, d ? 5 : 4);
    b.scale(1, 0.72, 1);
    b.translate(Math.cos(a) * R * 0.8, 2.6 + R * 0.4, Math.sin(a) * R * 0.8);
    blobs.push(b);
  }
  const leaves = mergeGeometries(blobs, false);
  jitter(leaves, rng, 0.06);
  leaves.computeVertexNormals();
  return { trunk, leaves };
}

// ---------- bosque ----------

export class TreeGrove {
  constructor(scene, collision) {
    this.scene = scene;
    this.col = collision;
    this.group = new THREE.Group();
    this.group.name = 'grove';
    scene.add(this.group);
  }

  // spots: [{x, z}] — planta cada árvore com rotação/escala/cor sorteadas (seed fixa)
  build(spots, seed = 4242, leafDetail = 1) {
    const rng = makeRng(seed);
    const trunkParts = [];
    const leafParts = [];

    for (const s of spots) {
      const roll = rng();
      const style = roll < 0.38 ? 'pinheiro' : (roll < 0.65 ? 'esferica' : 'decidua');
      const tree = this._make(style, rng, leafDetail);

      const sc = rngRange(rng, 0.8, 1.3);
      const sy = sc * rngRange(rng, 0.95, 1.25);
      const yaw = rngRange(rng, 0, Math.PI * 2);

      // transformacoes + padronizacao p/ mergeGeometries (toNonIndexed RETORNA nova geometria)
      tree.trunk.rotateY(yaw); tree.trunk.scale(sc, sy, sc); tree.trunk.translate(s.x, CURB_H, s.z);
      tree.leaves.rotateY(yaw); tree.leaves.scale(sc, sy, sc); tree.leaves.translate(s.x, CURB_H, s.z);
      if (tree.trunk.index) tree.trunk = tree.trunk.toNonIndexed();
      if (tree.leaves.index) tree.leaves = tree.leaves.toNonIndexed();

      // verde variado por árvore (vertex color na copa)
      const c = new THREE.Color().setHSL(
        0.26 + rng() * 0.06,
        0.42 + rng() * 0.22,
        0.24 + rng() * 0.14);
      paint(tree.leaves, c);

      trunkParts.push(tree.trunk);
      leafParts.push(tree.leaves);
      this.col.addCircle(s.x, s.z, 0.34 * sc, CURB_H + 2.6, 'tree');
    }

    if (!trunkParts.length) return;

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, vertexColors: true });

    const trunks = new THREE.Mesh(mergeGeometries(trunkParts, false), trunkMat);
    trunks.castShadow = true; trunks.receiveShadow = true;
    trunks.name = 'grove-trunks';

    const leaves = new THREE.Mesh(mergeGeometries(leafParts, false), leafMat);
    leaves.castShadow = false; leaves.receiveShadow = true;   // [FPS] copa não projeta sombra
    leaves.name = 'grove-leaves';

    this.group.add(trunks, leaves);
  }

  _make(style, rng, leafDetail) {
    if (style === 'pinheiro') return makePinheiro(rng, leafDetail);
    if (style === 'esferica') return makeEsferica(rng, leafDetail);
    return makeDecidua(rng, leafDetail);
  }
}
