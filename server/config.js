/**
 * Constantes do servidor — espelho das do cliente (src/config.js).
 * Tudo que o servidor precisa saber sobre o mundo e o jogador mora aqui.
 * A cidade é gerada com a MESMA seed do cliente, então os colisores batem.
 */

// ---------------------------------------------------------------- malha urbana
export const GRID = 8;
export const CELL = 64;
export const HALF = ((GRID - 1) * CELL) / 2;   // 224
export const ROAD_W = 18;
export const ROAD_H = ROAD_W / 2;
export const SIDEWALK_W = 5;
export const CURB = ROAD_H + SIDEWALK_W;       // 14
export const CURB_H = 0.24;
export const LANE = 4.5;
export const BLOCK_INNER = CELL - 2 * CURB;    // 36
export const WORLD_EDGE = HALF + CELL * 0.5;

export const PROP_OFF = 9.9;           // postes e árvores junto ao meio-fio (igual ao cliente)
// ---------------------------------------------------------------- jogador
export const PLAYER = {
  radius: 0.42,
  height: 1.78,
  eye: 1.62,
  // ~20% mais lento que o solo (6.4/14.5) a pedido: no MP a sensação de
  // velocidade com latência é maior, e os duelos ficam mais justos
  walkSpeed: 5.1,
  runSpeed: 11.6,
  accel: 58,
  jumpSpeed: 7.4,
  gravity: 26,
  turnSmooth: 14,
  maxHearts: 6,
  invulnTime: 1.6,
  regenDelay: 9,
  regenTime: 6,
};

// ---------------------------------------------------------------- veiculos MP
export const CAR = {
  radius: 2.1,
  height: 1.6,
  maxSpeed: 26,
  accel: 14,
  brake: 34,
  steer: 1.9,
  enterRange: 4.5,
};
export const NUM_CARS = 8;


// ---------------------------------------------------------------- combate
export const GAME = {
  totalTime: 600,
  fireCooldown: 0.16,
  bulletSpeed: 145,
  bulletLife: 3.0,
  pickupRange: 3.4,
};

// ---------------------------------------------------------------- rede
export const NET = {
  port: process.env.PORT || 3000,
  /** Frequência do loop de física do servidor (Hz). */
  tickRate: 30,
  /** Quantos inputs o servidor aceita por segundo por jogador (anti-spam). */
  maxInputRate: 40,
  /** Depois disto sem mensagem, o jogador é desconectado. */
  timeoutMs: 60_000,
  /** Máximo de mensagens por segundo por conexão (anti-flood). */
  maxMsgPerSec: 120,
  maxPayload: 4096,
  /** Versão do protocolo — cliente e servidor precisam bater. */
  version: 1,
};

// ---------------------------------------------------------------- modos
export const MODES = {
  dm: {
    id: 'dm',
    label: 'MULTIPLAYER',
    maxPlayers: 8,
    minPlayers: 2,       // bots completam até minPlayers quando ligado
    killLimit: 25,
    timeLimit: 600,      // segundos
    respawnTime: 3,
    spawnProtect: 3,     // segundos imune após nascer
    teamCount: 2,        // verde x amarelo
  },
  br: {
    id: 'br',
    label: 'BATTLE ROYALE',
    maxPlayers: 20,
    minPlayers: 6,       // bots completam até minPlayers quando ligado
    lootPerSpawn: 3,     // itens por ponto de loot
    zoneStartR: 210,     // raio inicial da zona
    zoneFinalR: 8,       // raio final — fecha de verdade
    zoneSteps: 6,        // quantas vezes a zona encolhe
    zoneStepTime: 45,    // segundos entre encolhimentos
    zoneDpsBase: 2,      // dano/s fora da zona (cresce a cada passo)
    planeSpeed: 60,      // velocidade do avião
    planeHeight: 70,
    fallSpeed: 12,       // queda livre
    parachuteSpeed: 5.5, // queda de paraquedas
    lootRarity: { comum: 0.6, raro: 0.3, epico: 0.1 },
  },
};

// ---------------------------------------------------------------- zona BR
/** Sequência de raios da zona (fração do raio inicial). */
export const ZONE_SHRINK = [1.0, 0.72, 0.5, 0.32, 0.18, 0.08, 0.0];

/** Raios máximos de segurança contra posições absurdas (mapa ~ -2600..2600). */
export const WORLD_LIMIT = 2600;

/**
 * Platôs — espelho de src/config.js (terreno aplainado dos marcos).
 * `y` é calculado na carga do terrain.js (média do relevo natural).
 */
export const PLATOS = [
  { id: 'pelourinho', x: -121.6, z: -435.0, rot: -0.25, hx: 62, hz: 34, fade: 26 },
  { id: 'museu', x: -424.3, z: 140.8, rot: 0.42, hx: 58, hz: 52, fade: 28 },
];

export const CABLE = {
  rise: 9,
  halfX: 10, halfZ: 8,
  deckOver: 1,
  cabinFloor: 5.1,
  dock: 4.6,
  cableSep: 1.7,
  dwell: 7,
  boardDwell: 1.8,
  speed: 8.5,
  rampLen: 42, rampHalfW: 2.4,
  boardRange: 4.6,
};

