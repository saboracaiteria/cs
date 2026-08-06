# Relatório de Erros — Servidor Multiplayer (GAME-3D)

**Data:** 06/08/2026
**Escopo:** Servidor Node (`server/index.js`) + protocolo de rede do multiplayer (modos DM e BR)
**Autor do código revisado:** modelo DeepSeek Flash (código do multiplayer e do servidor)
**Validação:** testes reais via WebSocket (entrada em sala, partida DM/BR, versão, flood, sanitização)

---

## Sumário

| # | Severidade | Arquivo | Linha | Erro |
|---|-----------|---------|-------|------|
| 1 | Alta | `server/index.js` | 115 | Assinatura errada de `send()` — erro de versão nunca chega ao cliente |
| 2 | Média | `server/index.js` | 145 | Assinatura errada de `send()` — PONG corrompido, ping do HUD quebrado |
| 3 | Média | `server/rooms/room.js` | 120 | Assinatura errada de `send()` — aviso "Aguardando PRONTO" nunca chega |
| 4 | Média | `server/rooms/br.js` | 33–46 | `_spawnLoot()` chamado 2x — loot duplicado no BR |
| 5 | Crítica | `server/protocol.js` | 40 | Limite de 8192 chars descarta LOOT_LIST — loot nunca chega ao cliente |

---

## Detalhamento

### Erro 1 — Erro de versão incompatível nunca chega ao cliente (Alta)

- **Arquivo:** `server/index.js:115`
- **Código errado:**
  ```js
  send(ws, T.ERROR, { msg: 'Versão incompatível. Atualize o jogo.' });
  ```
- **Causa:** a função `send(ws, obj)` aceita **2 parâmetros**, mas foi chamada com 3. O servidor serializa `T.ERROR` (a string `'error'`) e envia `"error"` — não o objeto esperado `{t:'error', msg:...}`.
- **Impacto:** jogador com versão desatualizada é desconectado (code 4001) **sem ver a mensagem** de explicação. Confirmado por teste: cliente fechado sem receber `error`.
- **Correção:**
  ```js
  send(ws, { t: T.ERROR, msg: 'Versão incompatível. Atualize o jogo.' });
  ```

### Erro 2 — Ping/RTT do HUD quebrado (Média)

- **Arquivo:** `server/index.js:145`
- **Código errado:**
  ```js
  send(ws, T.PONG, { agora: msg.agora });
  ```
- **Causa:** mesma assinatura errada — o cliente recebe a string `"pong"` em vez de `{t:'pong', agora:...}`.
- **Impacto:** `src/net/client.js` só atualiza `rtt` quando `msg.t === 'pong'`; com a resposta corrompida, o ping exibido no HUD (`match.js:345`) nunca é atualizado.
- **Correção:**
  ```js
  send(ws, { t: T.PONG, agora: msg.agora });
  ```

### Erro 3 — Aviso "Aguardando todos marcarem PRONTO" nunca aparece (Média)

- **Arquivo:** `server/rooms/room.js:120`
- **Código errado:**
  ```js
  send(p.client, T.ERROR, { msg: 'Aguardando todos marcarem PRONTO' });
  ```
- **Causa:** mesma assinatura errada de `send()`.
- **Impacto:** o host que tenta iniciar com jogadores sem pronto não recebe nenhum retorno visual.
- **Correção:**
  ```js
  send(p.client, { t: T.ERROR, msg: 'Aguardando todos marcarem PRONTO' });
  ```

### Erro 4 — Loot duplicado no Battle Royale (Média)

- **Arquivo:** `server/rooms/br.js:33–46`
- **Causa:** `_spawnLoot()` é executado **duas vezes** no início da partida:
  1. Diretamente no `_beginGame()` do BR;
  2. Novamente via `_setupWorld()`, que o `super._beginGame()` chama logo em seguida.
- **Impacto:** o servidor gera e transmite o loot em dobro (loot duplicado no mundo e 2 broadcasts de `LOOT_LIST`).
- **Correção:** remover a chamada direta em `_beginGame()` e manter apenas `_setupWorld()` (que já é chamado pelo `super._beginGame()`).

### Erro 5 — Loot NUNCA chega ao cliente no BR (Crítica)

- **Arquivo:** `server/protocol.js:40`
- **Código errado:**
  ```js
  const s = JSON.stringify(obj);
  if (s.length > 8192) return false;
  ```
- **Causa:** o limite de 8192 chars descarta **silenciosamente** mensagens grandes. O `LOOT_LIST` do BR (60 pontos × até 3 itens = até 180 itens) mede **12.112 chars** (medido com script de teste).
- **Impacto:** nenhum jogador do BR recebe a lista de loot — o modo BR fica sem loot funcional. Confirmado por teste: partida BR rodando com `loot=0` mensagens recebidas.
- **Correção:** aumentar o limite para 65.536 chars (64 KB), suficiente para o loot completo com folga:
  ```js
  if (s.length > 65536) return false;
  ```

---

## Nota sobre a autoria

Os 5 erros acima foram cometidos pelo modelo **DeepSeek Flash** na implementação do código do servidor multiplayer. As correções foram aplicadas e validadas com testes reais de WebSocket.

## Validação pós-correção

Scripts de teste usados (locais, não versionados):
- `_teste_ws.mjs` — fluxo completo DM (HELLO → lobby → READY → gameStart → snapshots)
- `_teste_cenarios.mjs` — BR, versão incompatível, nick malicioso, flood, JSON corrompido
- `_mede_loot.mjs` — medição do tamanho do LOOT_LIST

Resultado esperado após correção: **todos os cenários passam**, incluindo o recebimento da mensagem `error` de versão e do `LOOT_LIST`.
