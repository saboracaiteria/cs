/**
 * netStatus — badge de conexão (ping / estado) no canto da tela.
 */
export function criarNetStatus() {
  const el = document.getElementById('net-status');
  if (!el) return { setPing() {}, setEstado() {} };

  const pingEl = document.getElementById('ns-ping');

  function setPing(ms) {
    if (ms == null) return;
    pingEl.textContent = `${ms}ms`;
    pingEl.className = ms < 80 ? 'ns-ok' : ms < 200 ? 'ns-meio' : 'ns-ruim';
  }

  function setEstado(estado) {
    const nomes = { off: 'desconectado', conectando: 'conectando…', aberto: 'online', erro: 'erro' };
    el.dataset.estado = estado;
    el.querySelector('.ns-estado').textContent = nomes[estado] || estado;
  }

  return { setPing, setEstado };
}
