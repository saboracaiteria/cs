/**
 * Carros do multiplayer — autoritativos no servidor.
 *
 * Nascem nas ruas da cidade (mesma grade do cliente), o jogador entra (tecla E
 * perto de um carro livre), dirige com WASD (moveZ = acelerar/ré, moveX =
 * esterço) e sai (E de novo). Colidem com prédios via CollisionWorld e o
 * snapshot carrega posição/yaw/velocidade de cada um + quem está dirigindo.
 */

import { GRID, HALF, CAR } from './config.js';
import { makeRng, rngPick, clamp } from './util.js';

let carUid = 1;

const CORES = [
  0xe53935, 0x1e88e5, 0xfdd835, 0x43a047,
  0x8e24aa, 0xfb8c00, 0x00897b, 0x5d4037,
];

/** Cria `count` carros parados perto dos cruzamentos (sempre na rua). */
export function createCars(world, count) {
  const rng = makeRng(20260725);
  const cars = [];

  // nós da grade (cruzamentos) — as ruas ficam entre os quarteirões
  const nos = [];
  for (let i = 1; i < GRID - 1; i++) {
    for (let j = 1; j < GRID - 1; j++) nos.push([i, j]);
  }
  for (let k = nos.length - 1; k > 0; k--) {
    const m = Math.floor(rng() * (k + 1));
    [nos[k], nos[m]] = [nos[m], nos[k]];
  }

  for (let n = 0; n < count && n < nos.length; n++) {
    const [i, j] = nos[n];
    const cx = i * 64 - HALF, cz = j * 64 - HALF;
    // desloca para dentro de uma das ruas do cruzamento (fora dos prédios)
    let x = cx + (rng() - 0.5) * 46;
    let z = cz + (rng() - 0.5) * 46;
    if (world.col.isBlocked(x, z, CAR.radius)) { x = cx; z = cz; }
    const y = world.col.groundHeightAt(x, z);
    cars.push({
      id: carUid++,
      x, y: y + 0.2, z,
      yaw: rng() < 0.5 ? 0 : Math.PI / 2,
      speed: 0,
      playerId: null,        // id do jogador dirigindo (null = livre)
      inp: null,             // input do motorista (moveX, moveZ)
      cor: rngPick(rng, CORES),
      hp: 90,                // vida: 4 tiros de pistola (24) — explode ao zerar
      destroyed: false,      // virou sucata: não dirige nem pode entrar
    });
  }
  return cars;
}

/** Move os carros dirigidos (aceleração, esterço, colisão, limite do mundo). */
export function updateCars(world, cars, dt) {
  for (const c of cars) {
    if (c.playerId == null) continue;
    const inp = c.inp || { moveX: 0, moveZ: 0 };

    // acelera / freia / ré
    const gas = clamp(inp.moveZ, -1, 1);
    const alvo = gas * CAR.maxSpeed;
    const accel = gas !== 0 ? CAR.accel : CAR.brake;
    c.speed += clamp(alvo - c.speed, -accel * dt, accel * dt);

    // esterço proporcional à velocidade
    if (Math.abs(c.speed) > 0.4) {
      const steer = -clamp(inp.moveX, -1, 1) * CAR.steer * Math.min(1, Math.abs(c.speed) / 9);
      c.yaw += steer * dt * (c.speed >= 0 ? 1 : -1);
    }

    // anda
    c.x += Math.sin(c.yaw) * c.speed * dt;
    c.z += Math.cos(c.yaw) * c.speed * dt;

    // colisão com prédios/postes (círculo do carro)
    const pos = { x: c.x, y: c.y, z: c.z };
    world.col.resolveCircle(pos, CAR.radius, CAR.height);
    c.x = pos.x;
    c.z = pos.z;
    c.y = world.col.groundHeightAt(c.x, c.z) + 0.2;

    // limite do mundo
    c.x = clamp(c.x, -2500, 2500);
    c.z = clamp(c.z, -2500, 2500);
  }
}
