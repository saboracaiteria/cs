/**
 * Física do jogador no servidor — autoritativa.
 * Movimento com aceleração, gravidade, pulo e colisão contra a CollisionWorld.
 * Os valores batem com o cliente (src/player.js + config.js).
 */

import { PLAYER } from './config.js';
import { clamp, angleDelta } from './util.js';

/**
 * Estado interno de um jogador controlado por rede/bot.
 * `pos` é {x,y,z}; `vel` é {x,y,z}.
 */
export function createBody(x, z, yaw = 0) {
  const gy = groundY(null, x, z);   // preenchido depois com o mundo
  return {
    pos: { x, y: gy, z },
    vel: { x: 0, y: 0, z: 0 },
    yaw,
    pitch: 0,
    grounded: true,
    onGround: true,
    jumpQueued: false,
    run: false,
    moveX: 0,   // input -1..1
    moveZ: 0,   // input -1..1
    lastGroundY: gy,
  };
}

function groundY(world, x, z, refY = null) {
  if (!world) return 0;
  return world.col.groundHeightAt(x, z, refY);
}

/**
 * Aplica um input de movimento a um corpo.
 * @param {object} world  { col, terrainHeight }
 * @param {object} body   corpo criado por createBody
 * @param {object} inp    { moveX, moveZ (dir de movimento no plano do chão),
 *                          yaw (alvo), run, jump }
 * @param {number} dt     passo de simulação
 */
export function stepBody(world, body, inp, dt) {
  const P = PLAYER;
  const { col } = world;

  // ---- mira (suave, sem teleporte)
  body.yaw += angleDelta(body.yaw, inp.yaw) * Math.min(1, P.turnSmooth * dt);
  body.pitch = clamp(inp.pitch ?? body.pitch, -1.4, 1.4);

  // ---- desejo de velocidade (relativo à câmera: moveX é "direita", moveZ é "frente")
  // Usa o yaw do INPUT (instantâneo), igual ao solo: o corpo suaviza no
  // snapshot, mas o movimento acompanha o olhar na hora — sem o atraso do
  // turnSmooth a direção do passo ficava "derrapando" em relação à câmera.
  const cy = inp.yaw;
  const sinY = Math.sin(cy), cosY = Math.cos(cy);
  const wishX = (inp.moveZ * -sinY) + (inp.moveX * cosY);
  const wishZ = (inp.moveZ * -cosY) - (inp.moveX * sinY);
  const len = Math.hypot(wishX, wishZ);
  const maxSpeed = inp.run ? P.runSpeed : P.walkSpeed;
  let wx = 0, wz = 0;
  if (len > 0.001) {
    wx = (wishX / len) * maxSpeed;
    wz = (wishZ / len) * maxSpeed;
  }

  // ---- aceleração no plano
  const accel = P.accel;
  body.vel.x += clamp(wx - body.vel.x, -accel * dt, accel * dt);
  body.vel.z += clamp(wz - body.vel.z, -accel * dt, accel * dt);

  // ---- pulo
  if (inp.jump) {
    if (body.onGround) {
      body.vel.y = P.jumpSpeed;
      body.onGround = false;
    }
  }

  // ---- gravidade
  body.vel.y -= P.gravity * dt;

  // ---- integração
  body.pos.x += body.vel.x * dt;
  body.pos.z += body.vel.z * dt;
  body.pos.y += body.vel.y * dt;

  // ---- chão
  const g = groundY(world, body.pos.x, body.pos.z, body.pos.y + 0.3);
  if (body.pos.y <= g) {
    body.pos.y = g;
    body.vel.y = 0;
    body.onGround = true;
  } else {
    body.onGround = false;
  }

  // ---- colisão com sólidos (prédios, postes, guarda-corpo)
  col.resolveCircle(body.pos, P.radius, P.height);

  // ---- limite do mundo (nunca deixa fugir do mapa)
  const LIM = 2500;
  body.pos.x = clamp(body.pos.x, -LIM, LIM);
  body.pos.z = clamp(body.pos.z, -LIM, LIM);

  // ---- dano de queda (caiu muito rápido → dano proporcional)
  let fallDamage = 0;
  if (body.vel.y < -18) {
    fallDamage = Math.min(60, ((-body.vel.y - 18) / 12) * 30);
  }

  return { fallDamage };
}

/** Distância de dano de queda em que o jogador morre de vez (queda muito alta). */
export function lethalFall() {
  return 60;
}
