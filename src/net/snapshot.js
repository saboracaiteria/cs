/**
 * SnapshotBuffer — guarda os 2 últimos snapshots do servidor e interpola.
 * O servidor manda ~30 snaps/s; o cliente renderiza em 60+ fps interpolando
 * a posição de cada jogador entre o snap anterior e o atual (latência zero
 * de movimento para o olho).
 */
export class SnapshotBuffer {
  constructor() {
    this.anterior = null;   // {t, data}
    this.atual = null;      // {t, data}
    this.t = 0;             // tempo entre os dois (s)
  }

  /** Empurra um snap novo (já parseado). */
  push(snap, agoraMs = performance.now()) {
    if (this.atual) this.anterior = this.atual;
    this.atual = { t: agoraMs, data: snap };
    this.t = Math.max(0.001, this.atual.t - (this.anterior ? this.anterior.t : this.atual.t));
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
    return { ...a, ...pos, yaw: a.yaw ?? 0, pitch: a.pitch ?? 0 };
  }

  limpar() {
    this.anterior = null;
    this.atual = null;
  }
}
