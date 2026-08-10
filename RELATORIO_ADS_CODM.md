# Relatório Técnico — ADS Estilo CODM
**Data:** 2026-08-10  
**Objetivo:** Alinhar o sistema de mira ADS do jogo com o comportamento do Call of Duty Mobile.

---

## 1. Problema Atual

O jogador fica à **esquerda** da tela (câmera over-the-shoulder) em **todos** os modos, incluindo durante o ADS.  
No CODM o comportamento correto é:

| Estado      | Câmera                                     | Mira / Crosshair          |
|-------------|-------------------------------------------|---------------------------|
| Hip-fire    | Deslocada para a direita (`shoulderX`)    | Centralizada na tela       |
| **ADS**     | **Move para o centro** (sem offset ombro) | **Centro exato da tela**  |

Atualmente o jogo faz:
- ADS só muda **FOV** e **cor da mira** (classe CSS `.ads`).
- O `shoulderX` (offset lateral da câmera) **nunca é zerado** durante o ADS.
- O `aimRay` é chamado com `(0, 0)` para o tiro — correto — mas a câmera continua deslocada, causando **divergência visual** entre onde a mira está e para onde a bala vai.

---

## 2. Diagnóstico por Arquivo

### `src/camera.js`

| Linha | Trecho Relevante | Problema |
|-------|-----------------|----------|
| 32    | `this.ads = 0;` | Propriedade existe mas **não influencia o offset de ombro** |
| 219   | `const ombro = this.mode === 'foot' ? CAMERA.shoulderX : ...` | **Nunca interpola para 0** durante ADS |
| 230   | `addScaledVector(right, ombro)` | Câmera sempre deslocada lateralmente |
| 320   | `aimRay(ndcX=0, ndcY=0)` | Correto — o raio de tiro é central |

**Correção necessária:** Na linha 219, usar `ombro * (1 - this.ads)` para suavizar o offset lateral para 0 enquanto `ads` sobe de 0 → 1.

### `src/config.js`

| Parâmetro       | Valor   | Status |
|----------------|---------|--------|
| `shoulderX`    | `1.8`   | OK — é o deslocamento de ombro |
| `adsFov`       | `54`    | OK — zoom de celular |
| `adsFovPc`     | `31`    | OK — zoom de PC (2×) |
| `adsSpeed`     | `9`     | OK — velocidade da transição |
| `spreadAds`    | `0`     | OK — tiro perfeito no ADS |

Não precisa de novos parâmetros.

### `src/ui/hud.js`

| Linha | Método | Status |
|-------|--------|--------|
| 170   | `setCrosshairCenter(on)` | Existe — adiciona classe `.center` |
| 175   | `setAds(on)` | Existe — adiciona classe `.ads` |

O `setAds` já é chamado em `game.js:2427`. O `setCrosshairCenter` **não** é chamado no single-player — apenas no multiplayer (`match.js:796`).

**Correção necessária:** Em `_updateHUD` (`game.js:2427`), chamar também `setCrosshairCenter(this.camera.isAds)` junto com `setAds`.

### `css/style.css`

| Linha | Regra | Status |
|-------|-------|--------|
| 34-40 | `#crosshair { left:50%; top:50% }` | **Crosshair já está centrado** por padrão |
| 42    | `#crosshair.center { left:50%; top:50% }` | Redundante — mesma posição do default |
| 44-49 | `#crosshair.ads { ... }` | Só muda a **cor/espessura** da mira, não a posição |

**O CSS já posiciona o crosshair no centro (50%/50%) por padrão.** Não há deslocamento CSS causando o problema — o problema é visual/perceptivo: com a câmera deslocada, o **centro da tela não coincide com onde o olhar aponta**.

### `src/game.js`

| Linha | Trecho | Status |
|-------|--------|--------|
| 1224  | `aimRay(..., 0, 0)` | ✅ Correto — tiro vai ao centro |
| 2057-2061 | `setAds(aimando, ...)` | ✅ ADS ativado corretamente |
| 2427  | `hud.setAds(this.camera.isAds)` | ⚠️ Falta `setCrosshairCenter` |

### `src/ent/viewmodel.js`

| Linha | Trecho | Status |
|-------|--------|--------|
| 4     | `POS_REPOUSO = (0.26, -0.22, -0.52)` | Posição de descanso da arma |
| 6     | `POS_ADS = (0.22, -0.12, -0.44)` | Posição de mira da arma |
| 84    | `this.ads = damp(...)` | Interpola a posição da arma |

O viewmodel já interpola corretamente entre repouso e ADS. O problema não está aqui.

---

## 3. Root Cause

```
Hip-fire:  câmera deslocada (+shoulderX)  →  olhar não aponta para 50%/50% da tela
ADS atual: câmera deslocada (+shoulderX)  →  mesmo problema, só muda FOV e cor
ADS CODM:  câmera no centro (shoulderX→0) →  olhar aponta exatamente para o centro
```

O `this.ads` em `camera.js` já é calculado e suavizado a cada frame, mas nunca é usado para modificar `ombro`. Essa é a **única linha** que precisa mudar na câmera.

---

## 4. Plano de Implementação

### Mudança 1 — `src/camera.js` (linha 219)

```js
// ANTES
const ombro = this.mode === 'foot' ? CAMERA.shoulderX : (this.mode === 'heli-out' ? CAMERA.heliShoulderX : 0);

// DEPOIS
const ombroBase = this.mode === 'foot' ? CAMERA.shoulderX : (this.mode === 'heli-out' ? CAMERA.heliShoulderX : 0);
const ombro = ombroBase * (1 - this.ads);
```

Isso faz a câmera deslizar suavemente de `shoulderX` para `0` na velocidade de `adsSpeed=9`, parity perfeita com a suavização do FOV.

### Mudança 2 — `src/game.js` (linha 2427)

```js
// ANTES
this.hud.setAds(this.camera.isAds);

// DEPOIS
this.hud.setAds(this.camera.isAds);
this.hud.setCrosshairCenter(this.camera.isAds);
```

Garante que a classe `.center` seja aplicada ao crosshair durante ADS no single-player (já funciona no multiplayer).

### Mudança 3 — `css/style.css` (opcional, estética)

Adicionar transição suave ao `#crosshair` para que a mudança visual acompanhe a transição da câmera (já existe `transition` para `transform`, mas não para `left`/`top`):

```css
/* ANTES */
#crosshair {
  ...
  transition: transform .06s ease-out;
}

/* DEPOIS */
#crosshair {
  ...
  transition: transform .06s ease-out, left .11s ease-out, top .11s ease-out;
}
```

---

## 5. Impacto e Riscos

| Aspecto | Impacto | Risco |
|---------|---------|-------|
| Câmera shoulder → centro durante ADS | ✅ Parity CODM | ⚠️ Colisão com parede: o raycast de oclusão usa `baseX/baseZ` com o ombro. Com `ombro=0` no ADS, o cone de proteção lateral desaparece. Baixo risco: no ADS o jogador normalmente está longe de paredes. |
| Crosshair `.center` no single-player | ✅ Consistência com multiplayer | Sem risco — já estava implementado no HUD |
| Transição CSS | ✅ Visual mais suave | Sem risco |
| Raio de tiro (`aimRay`) | **Sem mudança** — já usa `(0,0)` | Sem risco |
| Viewmodel | **Sem mudança** — já interpola | Sem risco |

---

## 6. Arquivos a Modificar

```
src/camera.js     → 1 linha alterada (ombro usa ads como fator)
src/game.js       → 1 linha acrescentada (setCrosshairCenter no HUD update)
css/style.css     → 1 propriedade acrescentada (transition no crosshair)
```

**Total: 3 mudanças cirúrgicas, sem refatoração.**
