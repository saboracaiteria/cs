# Plano de Execução: IA de Bots, Veículos, Colisão em Lajes e Sprites

Este plano detalha o desenvolvimento e integração das melhorias solicitadas:

---

## 1. 🏢 Colisão Física em Lajes e Topo de Prédios (`src/world/collision.js` & `src/player.js`)
- **Objetivo**: Garantir que o jogador e os NPCs caminhem com colisão física perfeita no topo das lajes dos prédios, sem cair por dentro do edifício.
- **Implementação**:
  - Atualizar `CollisionWorld.groundHeightAt()` para incluir lajes registradas e alturas de telhado (`roofHeightAt`).
  - Suportar bordas seguras nos topos dos prédios.

---

## 2. 🛡️⚔️ IA Avançada de Ataque/Defesa dos Bots (`src/ent/foe.js`)
- **Objetivo**: Elevar o nível de tática dos inimigos.
- **Implementação**:
  - **Esquiva Dinâmica**: Bots saltam/deslizam para o lado ao entrarem na mira do jogador.
  - **Uso de Cobertura**: Quando a vida estiver abaixo de 30% ou recarregando tiro, o bot procura obstáculos para se esconder.
  - **Flanqueamento em Grupo**: Inimigos se espalham em ângulos diferentes ao invés de correrem em fila indiana.

---

## 3. 🛞🚁 Bots Pilotos de Carro e Helicóptero (`src/ent/foe.js` & `src/game.js`)
- **Objetivo**: Inimigos chegam de carro e patrulham de helicóptero.
- **Implementação**:
  - **Veículo Inimigo**: Criar suporte para inimigos dirigirem `Car` até o jogador e desembarcarem.
  - **Suporte Aéreo**: Inimigos voadores sobrevoam o campo de batalha atirando.

---

## 4. 🖼️ Sprites & Visual High-Performance (`src/world/imgbuildings.js` & `src/gfx/particles.js`)
- **Objetivo**: Substituir meshes pesados por Billboards 2D / Sprites de imagens otimizadas.
- **Implementação**:
  - Adicionar outdoors, faixas urbanas e vegetação via Sprites.
  - Criar sistema de partículas por sprites (fumaça, faíscas, decalque de tiros).
