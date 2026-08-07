/**
 * SnapshotBuffer — guarda os 2 últimos snapshots do servidor e interpola.
 * O servidor manda ~30 snaps/s; o cliente renderiza em 60+ fps interpolando
 * a posição de cada jogador entre o snap anterior e o atual (latência zero
 * de movimento para o olho).
 */
// intervalo nominal entre snapshots do servidor (30 Hz). O alpha NÃO usa o
// intervalo entre CHEGADAS: com jitter de rede (Wi-Fi/celular) o movimento
// engasgava — acelerava e congelava a cada pacote atrasado
const TICK_MS = 1000 / 30;

export class SnapshotBuffer {
  constructor() {
    this.anterior = null;   // {t, data, seq}
    this.atual = null;      // {t, data, seq}
    this.t = TICK_MS;       // duração da interpolação (ms)
  }

  /** Empurra um snap novo (já parseado). */
  push(snap, agoraMs = performance.now()) {
    if (this.atual) this.anterior = this.atual;
    this.atual = { t: agoraMs, data: snap, seq: snap.seq ?? 0 };
    // duração = nº de ticks ENTRE os dois snaps (seq) × tick nominal; se um
    // pacote se perdeu, a interpolação continua na velocidade real do jogo
    const dSeq = this.anterior ? Math.max(1, (snap.seq ?? 0) - (this.anterior.seq ?? 0)) : 1;
    this.t = Math.max(0.001, dSeq * TICK_MS);
  }

  /** Fator de interpolação 0..1 entre anterior e atual. */
  alpha(agoraMs = performance.now()) {
    if (!this.anterior) return 0;
    return Math.max(0, Math.min(1, (agoraMs - this.anterior.t) / this.t));
  }

  /** Último snap (sem interpolação). */
  ultimo() { return this.atual ? this.atual.data : null; }

  /** Snap anterior (fallback). */
  anteriorSnap() { return this.anterior ? this.anterior.data : this.atual ? this.atual.data : null; }

  /** Posição interpolada de um jogador. Retorna {x,y,z} ou null. */
  posicao(id, alpha) {
    const a = this.atual ? this.atual.data.players.find((p) => p.id === id) : null;
    const b = this.anterior ? this.anterior.data.players.find((p) => p.id === id) : null;
    if (!a) return b ? { x: b.x, y: b.y, z: b.z } : null;
    if (!b) return { x: a.x, y: a.y, z: a.z };
    const k = alpha;
    return {
      x: b.x + (a.x - b.x) * k,
      y: b.y + (a.y - b.y) * k,
      z: b.z + (a.z - b.z) * k,
    };
  }

  /** Dados interpolados do jogador (posição + yaw/pitch suavizados). */
  ler(id, alpha) {
    const pos = this.posicao(id, alpha);
    const a = this.atual ? this.atual.data.players.find((p) => p.id === id) : null;
    if (!pos || !a) return null;
    const ant = this.anterior ? this.anterior.data.players.find((p) => p.id === id) : null;
    const ay = a.yaw ?? 0;
    let yaw = ay;
    if (ant) {
      let dy = ay - (ant.yaw ?? ay);
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      yaw = (ant.yaw ?? ay) + dy * alpha;
    }
    // o Y NÃO é interpolado linearmente: o pulo é uma parábola e a reta
    // entre snapshots corta o pico (o pulo parecia baixo e lento); usa o
    // valor do snapshot atual
    return { ...a, ...pos, y: a.y, yaw, pitch: a.pitch ?? 0 };
  }

  limpar() {
    this.anterior = null;
    this.atual = null;
  }
}
